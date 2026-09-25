import type { Prisma } from "@prisma/client";
import { JotformPayloadSchema, type JotformPayload } from "./surveys.schema.js";
import { scoreAnswer, aggregate, type QuestionType } from "./scoring.js";
import { summarizeOpenAnswers, AI_MODEL } from "./ai.js";
import type { Prisma as PrismaNS } from "@prisma/client";
import {
  WeightInputSchema,
  type SurveyFilters,
  type WeightInput,
  type WeightImportResult,
  type RegisterDefinitionInput,
  type UpdateQuestionInput,
  type UnregisteredFormDto,
  type ReprocessPendingResult,
  type CreateJotformAccountInput,
  type UpdateOpenQuestionsSummaryInput,
  type HistoricalSubmissionsQuery,
  type HistoricalSubmissionsImportInput,
  type HistoricalSubmissionDto,
  type HistoricalImportResult,
} from "@epi/shared";
import { parseCsv } from "./csv.js";
import {
  surveysRepository,
  catalogFieldsRepository,
  persistResults,
  markPending,
  markError,
  type SurveyScope,
} from "./surveys.repository.js";
import { allowedSiteIds } from "../../shared/site-scope.js";
import { jotformClient } from "./jotform-client.js";
import { mapJotformQuestions, parseCatalogLabels } from "./jotform-questions.js";
import { env } from "../../config/env.js";

type ProcessOutcome =
  | { status: "PROCESADO"; resultCount: number }
  | { status: "PENDIENTE_CONFIGURACION"; reason: string }
  | { status: "ERROR"; reason: string };

export const surveysService = {
  /**
   * Entrada del webhook. Valida, guarda el crudo pase lo que pase y dispara
   * el procesamiento. Nunca lanza por "faltan reglas": eso es un pendiente,
   * no un error.
   */
  async ingest(body: unknown): Promise<{ submissionId: string } & ProcessOutcome> {
    const payload = JotformPayloadSchema.parse(liftIdentifiers(normalizeJotform(body)));

    const submission = await surveysRepository.upsertSubmission(
      payload.submissionID,
      payload as unknown as Prisma.InputJsonValue,
      Boolean(payload.isPrePost),
      receivedAtFromJotform(body)
    );

    if (payload.participant?.id) {
      await surveysRepository.upsertParticipant(payload.participant.id, {
        name: payload.participant.name,
        age: payload.participant.age,
        gender: payload.participant.gender,
        school: payload.participant.school,
        groupName: payload.participant.group,
      });
    }

    const outcome = await processSubmission(submission.id);
    return { submissionId: submission.id, ...outcome };
  },

  reprocessSurvey,
  analyzeOpenQuestion,
  listUnregisteredForms,
  registerDefinition,
  updateQuestion,
  reprocessPending,
  syncJotformForms,
  listJotformForms,
  previewFormQuestions,
  listJotformAccounts,
  createJotformAccount,
  deleteJotformAccount,
  updateOpenQuestionsSummary,
  listHistoricalSubmissions,
  importHistoricalSubmissions,
  listCatalogFields: () => catalogFieldsRepository.list(),
  listPending: (userId: string) => resolveScope(userId).then((scope) => surveysRepository.listPending(scope)),

  listSurveys: (filters: SurveyFilters, userId: string) =>
    resolveScope(userId).then((scope) => surveysRepository.listSubmissions(filters, scope)),
  listDefinitions: (userId: string) =>
    resolveScope(userId).then((scope) => surveysRepository.listDefinitions(scope)),
  listGroups: () => surveysRepository.distinctGroups(),
  getDefinitionQuestions: (id: string, userId: string) =>
    resolveScope(userId).then((scope) => surveysRepository.getDefinitionQuestions(id, scope)),
  countSince: (from: Date, userId: string) =>
    resolveScope(userId).then((scope) => surveysRepository.countSince(from, scope)),
  groupSummary,
  completeGroup,
  reportResults,
  reportFilterOptions,

  /** Ponderación manual de una pregunta (upsert). */
  async setWeight(questionId: string, input: WeightInput, userId: string) {
    const question = await surveysRepository.findQuestion(questionId);
    if (!question) throw new Error(`Pregunta ${questionId} no encontrada`);
    const site = await surveysRepository.findQuestionSite(questionId);
    await assertSiteAllowed(userId, site?.surveyDefinition?.siteId);
    return surveysRepository.upsertWeight(questionId, input);
  },

  async deleteWeight(questionId: string, userId: string) {
    const site = await surveysRepository.findQuestionSite(questionId);
    await assertSiteAllowed(userId, site?.surveyDefinition?.siteId);
    return surveysRepository.deleteWeight(questionId);
  },

  /**
   * Lee el CSV crudo (formato del sistema) y aplica las ponderaciones a las
   * preguntas de la definición, mapeando por externalId. Acumula errores por
   * fila en vez de abortar todo el import.
   */
  async importWeights(surveyDefinitionId: string, csvText: string, userId: string): Promise<WeightImportResult> {
    const def = await surveysRepository.findDefinition(surveyDefinitionId);
    if (!def) throw new Error(`Encuesta ${surveyDefinitionId} no encontrada`);
    await assertSiteAllowed(userId, def.siteId);

    const questions = await surveysRepository.getDefinitionQuestions(surveyDefinitionId);
    const byExternalId = new Map(questions.map((q) => [q.externalId, q.id]));

    const rows = parseCsv(csvText);
    const result: WeightImportResult = { applied: 0, skipped: 0, errors: [] };

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2; // fila 1 = encabezados
      const externalId = (rows[i]!.externalId ?? "").trim();
      if (!externalId) {
        result.errors.push({ row: rowNum, message: "externalId vacío" });
        continue;
      }
      const questionId = byExternalId.get(externalId);
      if (!questionId) {
        result.errors.push({ row: rowNum, message: `La pregunta '${externalId}' no existe en esta encuesta` });
        continue;
      }
      const parsed = WeightInputSchema.safeParse(rows[i]);
      if (!parsed.success) {
        result.errors.push({
          row: rowNum,
          message: parsed.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join("; "),
        });
        continue;
      }
      await surveysRepository.upsertWeight(questionId, parsed.data);
      result.applied++;
    }

    result.skipped = result.errors.length;
    return result;
  },
};

/**
 * Manda todas las respuestas de una pregunta abierta a la IA para obtener un
 * resumen + las mejores respuestas, y guarda el resultado en QuestionInsight.
 */
export async function analyzeOpenQuestion(questionId: string, userId: string) {
  const site = await surveysRepository.findQuestionSite(questionId);
  await assertSiteAllowed(userId, site?.surveyDefinition?.siteId);

  const q = await surveysRepository.getQuestionWithAnswers(questionId);
  if (!q) throw new Error(`Pregunta ${questionId} no encontrada`);
  if (q.type !== "OPEN_TEXT") throw new Error("Solo aplica a preguntas OPEN_TEXT");

  const answers = q.answers.map((a) => a.value).filter((v) => v.trim().length > 0);
  if (answers.length === 0) throw new Error("La pregunta no tiene respuestas para analizar");

  const insight = await summarizeOpenAnswers(q.text, answers, q.insight?.summary);
  return surveysRepository.upsertInsight(questionId, {
    summary: insight.summary,
    bestAnswers: insight.bestAnswers as unknown as PrismaNS.InputJsonValue,
    model: AI_MODEL,
  });
}

export async function updateOpenQuestionsSummary(
  surveyDefinitionId: string,
  input: UpdateOpenQuestionsSummaryInput,
  userId: string
) {
  const def = await surveysRepository.findDefinitionSite(surveyDefinitionId);
  await assertSiteAllowed(userId, def?.siteId);
  return surveysRepository.updateOpenQuestionsSummary(surveyDefinitionId, input.summary);
}

/**
 * Motor de bifurcación reutilizable. Lee el crudo de la submission, busca las
 * reglas de ponderación y:
 *  - si existen para todas las preguntas → calcula y guarda Aggregated_Results.
 *  - si faltan → marca PENDIENTE_CONFIGURACION y alerta al admin.
 * Idempotente: correrlo de nuevo reemplaza los derivados previos.
 */
export async function processSubmission(submissionId: string): Promise<ProcessOutcome> {
  const submission = await surveysRepository.findSubmission(submissionId);
  if (!submission) throw new Error(`Submission ${submissionId} no encontrada`);

  const payload = submission.rawJsonData as unknown as JotformPayload;
  const def = await surveysRepository.findActiveDefinition(payload.formID);

  if (!def || def.questions.length === 0) {
    await markPending(submissionId);
    alertAdmin(submissionId, `Sin definición/preguntas para el form ${payload.formID}`);
    return { status: "PENDIENTE_CONFIGURACION", reason: "sin definición configurada" };
  }

  // OPEN_TEXT no se pondera (se analiza con IA aparte), así que no exige Weight.
  const missing = def.questions
    .filter((q) => q.type !== "OPEN_TEXT" && !q.weight)
    .map((q) => q.externalId);
  if (missing.length > 0) {
    // Se persiste el link a la definición aunque quede pendiente: así se
    // sabe a qué sitio/encuesta pertenece (autorización, listados) y se
    // puede reprocesar en bloque una vez completadas las ponderaciones.
    await markPending(submissionId, def.id);
    alertAdmin(submissionId, `Faltan ponderaciones (Weights): ${missing.join(", ")}`);
    return { status: "PENDIENTE_CONFIGURACION", reason: `faltan pesos: ${missing.join(", ")}` };
  }

  // Reglas completas → calcular. Un fallo inesperado acá no debe perder el
  // dato: se guarda el detalle y queda en estado ERROR para revisión manual.
  try {
    const byExternalId = new Map(def.questions.map((q) => [q.externalId, q]));
    const answers: { questionId: string; value: string }[] = [];
    const scored = [];

    for (const a of payload.answers) {
      const q = byExternalId.get(a.questionId);
      if (!q) continue; // respuesta a un campo no configurado → se ignora
      const value = normalizeValue(a.value);
      answers.push({ questionId: q.id, value }); // se guarda siempre (incl. OPEN_TEXT)
      // Las respuestas en blanco no cuentan para el cálculo (ni en el máximo).
      if (q.weight && value.trim() !== "") {
        scored.push({
          category: q.weight.category,
          subcategory: q.weight.subcategory,
          max: q.weight.maxScore,
          score: scoreAnswer({
            type: q.type as QuestionType,
            value,
            maxScore: q.weight.maxScore,
            correctAnswer: q.weight.correctAnswer,
          }),
        });
      }
    }

    const results = aggregate(scored).map((r) => ({
      category: r.category,
      subcategory: r.subcategory,
      calculatedScore: r.score,
      maxPossible: r.max,
      isPrePost: Boolean(payload.isPrePost),
    }));

    const participantId = payload.participant?.id
      ? (await surveysRepository.upsertParticipant(payload.participant.id, {})).id
      : undefined;

    // Duplicado = mismo participante + misma encuesta + mismo momento
    // (pre/post) ya procesado antes. No se bloquea: se marca para revisión.
    const isDuplicate = participantId
      ? Boolean(
          await surveysRepository.findProcessedSibling({
            participantId,
            surveyDefinitionId: def.id,
            isPre: submission.isPre,
            excludeSubmissionId: submissionId,
          })
        )
      : false;

    await persistResults({
      submissionId,
      surveyDefinitionId: def.id,
      participantId,
      isDuplicate,
      answers,
      results,
    });

    return { status: "PROCESADO", resultCount: results.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markError(submissionId, message);
    alertAdmin(submissionId, `Error de procesamiento: ${message}`);
    return { status: "ERROR", reason: message };
  }
}

/**
 * Formularios de Jotform que ya enviaron respuestas pero nunca fueron
 * asociados a una SurveyDefinition — agrupados por formID con una muestra
 * de los IDs de campo recibidos, para que el admin sepa qué está entrando.
 */
export async function listUnregisteredForms(): Promise<UnregisteredFormDto[]> {
  const submissions = await surveysRepository.listUnassignedSubmissions();
  const groups = new Map<
    string,
    { count: number; firstReceivedAt: Date; externalIds: Set<string> }
  >();

  for (const s of submissions) {
    const payload = s.rawJsonData as unknown as JotformPayload;
    const formId = payload.formID ?? "desconocido";
    let g = groups.get(formId);
    if (!g) {
      g = { count: 0, firstReceivedAt: s.receivedAt, externalIds: new Set() };
      groups.set(formId, g);
    }
    g.count++;
    if (s.receivedAt < g.firstReceivedAt) g.firstReceivedAt = s.receivedAt;
    for (const a of payload.answers) g.externalIds.add(a.questionId);
  }

  return [...groups.entries()]
    .map(([jotformFormId, g]) => ({
      jotformFormId,
      count: g.count,
      firstReceivedAt: g.firstReceivedAt.toISOString(),
      sampleExternalIds: [...g.externalIds].slice(0, 20),
    }))
    .sort((a, b) => a.firstReceivedAt.localeCompare(b.firstReceivedAt));
}

// ── catálogo de formularios de Jotform ────────────────────────────────

/** GET /user/forms → guarda/actualiza el catálogo local y regresa el diff. */
export async function syncJotformForms() {
  const accounts = await jotformAccountsForApi();
  const forms = (
    await Promise.all(
      accounts.map(async (account) =>
        (await jotformClient.listForms(account.apiKey)).map((form) => ({ ...form, accountId: account.id }))
      )
    )
  ).flat();
  return surveysRepository.upsertJotformForms(forms);
}

/** Catálogo local (ya sincronizado), marcando cuáles ya tienen SurveyDefinition. */
export async function listJotformForms() {
  const [forms, registeredIds] = await Promise.all([
    surveysRepository.listJotformForms(),
    surveysRepository.registeredJotformFormIds(),
  ]);
  return forms.map((f) => ({ ...f, accountName: f.account?.name ?? null, registered: registeredIds.has(f.id) }));
}

/** GET /form/:id/questions en vivo, ya separado en preguntas ponderables vs. catálogo. */
export async function previewFormQuestions(formId: string) {
  const questions = await firstSuccessfulJotform((apiKey) => jotformClient.getFormQuestions(formId, apiKey));
  return mapJotformQuestions(questions, parseCatalogLabels(env.CATALOG_DATA));
}

function maskApiKey(apiKey: string) {
  return apiKey.length <= 4 ? "••••" : `••••${apiKey.slice(-4)}`;
}

async function jotformApiKeys() {
  const keys = (await jotformAccountsForApi()).map((a) => a.apiKey);
  if (keys.length === 0) throw new Error("JOTFORM_API_KEY no configurada");
  return keys;
}

async function jotformAccountsForApi() {
  const accounts = await surveysRepository.listJotformAccounts();
  const apiAccounts: { id: string | null; apiKey: string }[] = accounts.map((a) => ({ id: a.id, apiKey: a.apiKey }));
  if (env.JOTFORM_API_KEY) apiAccounts.push({ id: null, apiKey: env.JOTFORM_API_KEY });
  return apiAccounts;
}

async function firstSuccessfulJotform<T>(fn: (apiKey: string) => Promise<T>) {
  let lastError: unknown;
  for (const apiKey of await jotformApiKeys()) {
    try {
      return await fn(apiKey);
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

export async function listJotformAccounts() {
  const accounts = await surveysRepository.listJotformAccounts();
  return accounts.map((a) => ({
    id: a.id,
    name: a.name,
    apiKeyPreview: maskApiKey(a.apiKey),
    createdAt: a.createdAt.toISOString(),
  }));
}

export async function createJotformAccount(input: CreateJotformAccountInput) {
  await jotformClient.listForms(input.apiKey);
  const account = await surveysRepository.createJotformAccount(input);
  return {
    id: account.id,
    name: account.name,
    apiKeyPreview: maskApiKey(account.apiKey),
    createdAt: account.createdAt.toISOString(),
  };
}

export async function deleteJotformAccount(id: string) {
  await surveysRepository.deleteJotformAccount(id);
  return { id };
}

async function listHistoricalRaw(input: HistoricalSubmissionsQuery | HistoricalSubmissionsImportInput, userId: string) {
  const scope = await resolveScope(userId);
  const defs = await surveysRepository.listDefinitionsForHistorical(input.surveyDefinitionIds, scope);
  const all = (
    await Promise.all(
      defs.map(async (def) => {
        const filters = {
          ...(input.from ? { from: input.from } : {}),
          ...(input.to ? { to: input.to } : {}),
        };
        const submissions = def.apiKey
          ? await jotformClient.listSubmissions(def.jotformFormId, def.apiKey, filters)
          : await firstSuccessfulJotform((apiKey) => jotformClient.listSubmissions(def.jotformFormId, apiKey, filters));
        return submissions.map((submission) => ({ def, submission }));
      })
    )
  ).flat();
  return all.sort((a, b) => b.submission.created_at.localeCompare(a.submission.created_at));
}

export async function listHistoricalSubmissions(
  input: HistoricalSubmissionsQuery,
  userId: string
): Promise<HistoricalSubmissionDto[]> {
  const rows = await listHistoricalRaw(input, userId);
  const existing = await surveysRepository.existingSubmissionIds(rows.map((r) => r.submission.id));
  return rows.map(({ def, submission }) => ({
    id: submission.id,
    formId: def.jotformFormId,
    formTitle: def.formTitle,
    createdAt: toIsoDate(submission.created_at),
    alreadyImported: existing.has(submission.id),
  }));
}

export async function importHistoricalSubmissions(
  input: HistoricalSubmissionsImportInput,
  userId: string
): Promise<HistoricalImportResult> {
  const selected = input.submissionIds ? new Set(input.submissionIds) : null;
  const rows = (await listHistoricalRaw(input, userId)).filter((r) => !selected || selected.has(r.submission.id));
  const existing = await surveysRepository.existingSubmissionIds(rows.map((r) => r.submission.id));
  const result: HistoricalImportResult = { imported: 0, skipped: 0, processed: 0, pending: 0, errors: 0 };

  for (const { submission } of rows) {
    if (existing.has(submission.id)) {
      result.skipped++;
      continue;
    }
    const outcome = await surveysService.ingest(submission);
    result.imported++;
    if (outcome.status === "PROCESADO") result.processed++;
    else if (outcome.status === "PENDIENTE_CONFIGURACION") result.pending++;
    else result.errors++;
  }
  return result;
}

/**
 * Asocia un formID de Jotform a un sitio/tipo: descarga sus preguntas reales
 * (GET /form/:id/questions), separa las que son catálogo (CATALOG_DATA —
 * se guardan como CatalogField, no se ponderan) del resto, crea la
 * SurveyDefinition (v1) con esas preguntas, y reprocesa de inmediato
 * cualquier submission que ya hubiera llegado esperando esta configuración.
 */
export async function registerDefinition(
  input: RegisterDefinitionInput,
  userId: string
): Promise<{ definitionId: string } & ReprocessPendingResult> {
  await assertSiteAllowed(userId, input.siteId);

  const { scoredQuestions, catalogMatches } = await previewFormQuestions(input.jotformFormId);
  if (catalogMatches.length > 0) await catalogFieldsRepository.upsertMatches(catalogMatches);

  const def = await surveysRepository.createDefinitionWithQuestions({
    siteId: input.siteId,
    jotformFormId: input.jotformFormId,
    type: input.type,
    questions: scoredQuestions,
  });

  const submissions = await surveysRepository.listUnassignedSubmissions();
  const matching = submissions.filter(
    (s) => (s.rawJsonData as unknown as JotformPayload).formID === input.jotformFormId
  );

  let reprocessed = 0;
  let stillPending = 0;
  let errors = 0;
  for (const s of matching) {
    const outcome = await processSubmission(s.id);
    if (outcome.status === "PROCESADO") reprocessed++;
    else if (outcome.status === "ERROR") errors++;
    else stillPending++;
  }

  return { definitionId: def.id, reprocessed, stillPending, errors };
}

/** Cambia texto/tipo de una pregunta — necesario para corregir el tipo
 * inferido automáticamente al asociar un instrumento nuevo. */
export async function updateQuestion(questionId: string, input: UpdateQuestionInput, userId: string) {
  const site = await surveysRepository.findQuestionSite(questionId);
  await assertSiteAllowed(userId, site?.surveyDefinition?.siteId);
  return surveysRepository.updateQuestion(questionId, input);
}

/**
 * Reintenta todas las submissions PENDIENTE_CONFIGURACION/ERROR de una
 * encuesta — para usar después de completar sus ponderaciones o de
 * corregir lo que causó un error, sin tener que reprocesar una por una.
 */
export async function reprocessPending(
  surveyDefinitionId: string,
  userId: string
): Promise<ReprocessPendingResult> {
  const site = await surveysRepository.findDefinitionSite(surveyDefinitionId);
  await assertSiteAllowed(userId, site?.siteId);

  const subs = await surveysRepository.listPendingOrErrorForDefinition(surveyDefinitionId);
  let reprocessed = 0;
  let stillPending = 0;
  let errors = 0;
  for (const s of subs) {
    const outcome = await processSubmission(s.id);
    if (outcome.status === "PROCESADO") reprocessed++;
    else if (outcome.status === "ERROR") errors++;
    else stillPending++;
  }
  return { reprocessed, stillPending, errors };
}

/**
 * Toma una submission PENDIENTE_CONFIGURACION y la reprocesa con las reglas
 * recién configuradas por el admin. Reutiliza el mismo motor que el webhook.
 */
export async function reprocessSurvey(submissionId: string, userId: string): Promise<ProcessOutcome> {
  const site = await surveysRepository.findSubmissionSite(submissionId);
  // Si nunca matcheó ninguna definición aún no hay sitio que autorizar.
  if (site?.surveyDefinition) await assertSiteAllowed(userId, site.surveyDefinition.siteId);
  return processSubmission(submissionId);
}

// ── resumen por grupo y completado pre/post ──────────────────────────

/**
 * Resumen por grupo/escuela: cuántas encuestas pre y post hay, cuántos
 * alumnos y cuántas respuestas en blanco. Un grupo puede "completarse"
 * cuando existen ambas encuestas (pre y post) procesadas.
 */
export async function groupSummary(userId: string) {
  const scope = await resolveScope(userId);
  const subs = await surveysRepository.listForSummary(scope);
  const groups = new Map<
    string,
    { pre: number; post: number; students: Set<string>; blanks: number; statuses: string[] }
  >();

  for (const s of subs) {
    const g = s.participant?.groupName;
    if (!g) continue;
    let acc = groups.get(g);
    if (!acc) {
      acc = { pre: 0, post: 0, students: new Set(), blanks: 0, statuses: [] };
      groups.set(g, acc);
    }
    if (s.isPre === true) acc.pre++;
    else if (s.isPre === false) acc.post++;
    if (s.participantId) acc.students.add(s.participantId);
    acc.blanks += s._count.answers;
    acc.statuses.push(s.status);
  }

  return [...groups.entries()].map(([groupName, g]) => ({
    groupName,
    preCount: g.pre,
    postCount: g.post,
    students: g.students.size,
    blanks: g.blanks,
    completed: g.statuses.length > 0 && g.statuses.every((st) => st === "COMPLETADO"),
    canComplete: g.pre > 0 && g.post > 0,
  }));
}

/**
 * Marca como COMPLETADO todas las submissions procesadas de un grupo.
 * Requiere que existan ambas encuestas (pre y post): sin una de las dos
 * no se permite pasar al estado completado.
 */
export async function completeGroup(groupName: string, userId: string) {
  const scope = await resolveScope(userId);
  const subs = await surveysRepository.findGroupSubmissions(groupName, scope);
  const hasPre = subs.some((s) => s.isPre === true);
  const hasPost = subs.some((s) => s.isPre === false);
  if (!hasPre || !hasPost) {
    throw Object.assign(
      new Error("El grupo necesita encuestas pre y post procesadas para completarse"),
      { statusCode: 409, code: "INCOMPLETE_PRE_POST" }
    );
  }
  const ids = subs.filter((s) => s.status === "PROCESADO").map((s) => s.id);
  await surveysRepository.markCompleted(ids);
  return { completed: ids.length };
}

// ── alcance por sitio (org_admin/functionality_user/report_viewer) ───

// DB guarda el rol en mayúsculas (SYSTEM_ADMIN...); allowedSiteIds compara
// contra los valores en minúsculas del JWT/DTO — se normaliza acá.
async function resolveScope(userId: string): Promise<SurveyScope> {
  const user = await surveysRepository.findScopeUser(userId);
  if (!user) throw Object.assign(new Error("Usuario no encontrado"), { statusCode: 404 });
  const siteIds = await allowedSiteIds({
    role: user.role.toLowerCase(),
    organizationId: user.organizationId,
    excludedSiteIds: user.excludedSiteIds,
  });
  return { siteIds, excludedSurveyDefinitionIds: user.excludedSurveyDefinitionIds, organizationId: user.organizationId };
}

async function assertSiteAllowed(userId: string, siteId: string | null | undefined) {
  const scope = await resolveScope(userId);
  if (scope.siteIds === undefined) return; // system_admin: sin restricción
  if (!siteId || !scope.siteIds.includes(siteId)) {
    throw Object.assign(new Error("Fuera del alcance de tu organización"), {
      statusCode: 403,
      code: "FORBIDDEN",
    });
  }
}

// ── reportes (solo encuestas COMPLETADO) ─────────────────────────────

export async function reportResults(
  filters: {
    siteId?: string | undefined;
    type?: "LOCAL" | "VISITING" | undefined;
    school?: string | undefined;
    category?: string | undefined;
    from?: string | undefined;
    to?: string | undefined;
  },
  userId: string
) {
  const scope = await resolveScope(userId);
  let siteIds = scope.siteIds;
  if (filters.siteId) {
    if (siteIds && !siteIds.includes(filters.siteId)) return []; // fuera de su alcance
    siteIds = [filters.siteId];
  }

  const subs = await surveysRepository.completedWithResults({
    scope: { siteIds, excludedSurveyDefinitionIds: scope.excludedSurveyDefinitionIds },
    type: filters.type,
    school: filters.school,
    from: filters.from,
    to: filters.to,
  });

  return aggregateCategoryResults(subs, filters.category);
}

// % por (categoría, subcategoría): promedio de score/maxPossible por submission,
// separado en pre y post según la encuesta. Reutilizado por reportResults y
// por los resolvers de data de reportes asignados (report-data-resolvers.ts).
export function aggregateCategoryResults(
  subs: { results: { category: string; subcategory: string | null; calculatedScore: number; maxPossible: number; isPrePost: boolean }[] }[],
  categoryFilter?: string
) {
  const buckets = new Map<
    string,
    { category: string; subcategory: string | null; pre: number[]; post: number[] }
  >();
  for (const s of subs) {
    for (const r of s.results) {
      if (categoryFilter && r.category !== categoryFilter) continue;
      if (r.maxPossible <= 0) continue;
      const key = `${r.category}||${r.subcategory ?? ""}`;
      let acc = buckets.get(key);
      if (!acc) {
        acc = { category: r.category, subcategory: r.subcategory, pre: [], post: [] };
        buckets.set(key, acc);
      }
      const pct = (r.calculatedScore / r.maxPossible) * 100;
      (r.isPrePost ? acc.pre : acc.post).push(pct);
    }
  }

  const avg = (xs: number[]) =>
    xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null;

  return [...buckets.values()]
    .map((b) => {
      const pre = avg(b.pre);
      const post = avg(b.post);
      return {
        category: b.category,
        subcategory: b.subcategory,
        pre,
        post,
        change: pre !== null && post !== null ? Math.round((post - pre) * 10) / 10 : null,
      };
    })
    .sort((a, b) => a.category.localeCompare(b.category) || (a.subcategory ?? "").localeCompare(b.subcategory ?? ""));
}

/** Opciones para los dropdowns del dashboard (respetando el alcance del usuario). */
export async function reportFilterOptions(userId: string) {
  const scope = await resolveScope(userId);
  return surveysRepository.reportFilterOptions(scope.siteIds, scope.organizationId);
}

// ── helpers ──────────────────────────────────────────────────────────

// Los identificadores (pre/post, escuela, grupo, edad…) llegan como preguntas
// de la encuesta en Jotform: se detectan por el id del campo y se elevan al
// payload estructurado antes de validar.
const RESERVED = {
  isPre: ["pre_post", "prepost", "momento"],
  participantId: ["participant_id", "participante_id", "id_participante"],
  name: ["participant_name", "nombre"],
  age: ["age", "edad"],
  gender: ["gender", "genero"],
  school: ["school", "escuela"],
  group: ["group", "grupo", "grupo_escuela"],
} as const;

export function liftIdentifiers(body: unknown): unknown {
  if (!body || typeof body !== "object") return body;
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.answers)) return body;

  const byId = new Map<string, string>();
  for (const a of b.answers as { questionId?: unknown; value?: unknown }[]) {
    if (a && a.questionId != null && a.value != null) {
      byId.set(String(a.questionId).toLowerCase(), String(a.value).trim());
    }
  }
  const pick = (keys: readonly string[]) => {
    for (const k of keys) {
      const v = byId.get(k);
      if (v) return v;
    }
    return undefined;
  };

  const p = { ...((b.participant as Record<string, unknown>) ?? {}) };
  p.id ??= pick(RESERVED.participantId);
  p.name ??= pick(RESERVED.name);
  p.gender ??= pick(RESERVED.gender);
  p.school ??= pick(RESERVED.school);
  p.group ??= pick(RESERVED.group);
  if (p.age == null) {
    const age = Number(pick(RESERVED.age));
    if (Number.isInteger(age) && age > 0) p.age = age;
  }

  let isPrePost = b.isPrePost;
  if (isPrePost === undefined) {
    const raw = pick(RESERVED.isPre);
    if (raw) isPrePost = /post/i.test(raw) ? false : /pre/i.test(raw) ? true : undefined;
  }

  return { ...b, participant: p.id ? p : b.participant, isPrePost };
}

// Claves del rawRequest plano que no son respuestas a preguntas.
const NON_ANSWER_KEYS = new Set(["slug", "event_id", "formID", "submissionID", "buildDate"]);

// Webhook real de Jotform: rawRequest trae un objeto plano keyed por el
// `name` del campo (ej. { q3_dropdown1: "Grupo 1", q5_number3: "20" }).
function answersFromFlatWebhook(flat: Record<string, unknown>): { questionId: string; value: unknown }[] {
  return Object.entries(flat)
    .filter(([k, v]) => !NON_ANSWER_KEYS.has(k) && v !== undefined && v !== null)
    .map(([questionId, value]) => ({ questionId, value }));
}

type JotformSubmissionApiAnswer = { name?: unknown; answer?: unknown };

// GET /form/:id/submissions (importación histórica vía API, no el webhook):
// answers viene anidado, keyed por qid, cada uno con { name, text, type, answer }.
function answersFromSubmissionsApi(
  answers: Record<string, JotformSubmissionApiAnswer>
): { questionId: string; value: unknown }[] {
  return Object.values(answers)
    .filter((a) => typeof a?.name === "string" && a.answer !== undefined)
    .map((a) => ({ questionId: a.name as string, value: a.answer }));
}

// Jotform manda el crudo en dos formas según la vía de ingesta:
// - webhook real: `rawRequest` (string) con un objeto plano keyed por `name`.
// - importación vía API de submissions: `answers` ya viene en el body, pero
//   anidado por qid con { name, answer } en vez de nuestro answers[].
// Ambas se aplanan al mismo answers[] interno antes de validar.
export function normalizeJotform(body: unknown): unknown {
  if (!body || typeof body !== "object") return body;
  const b = { ...(body as Record<string, unknown>) };

  if (typeof b.form_id === "string" && b.answers && typeof b.answers === "object" && !Array.isArray(b.answers)) {
    return {
      formID: b.form_id,
      submissionID: b.id,
      answers: answersFromSubmissionsApi(b.answers as Record<string, JotformSubmissionApiAnswer>),
    };
  }

  if (typeof b.rawRequest === "string") {
    try {
      const parsed = JSON.parse(b.rawRequest) as Record<string, unknown>;
      if (Array.isArray(parsed.answers)) {
        return { ...b, ...parsed }; // ya viene en nuestro formato interno (tests/compat)
      }
      return { ...b, answers: answersFromFlatWebhook(parsed) };
    } catch {
      /* se deja el body tal cual; la validación decidirá */
    }
  }

  return b;
}

function receivedAtFromJotform(body: unknown): Date | undefined {
  if (!body || typeof body !== "object") return undefined;
  const raw = (body as Record<string, unknown>)["created_at"];
  if (typeof raw !== "string") return undefined;
  const date = new Date(raw.includes("T") ? raw : raw.replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function toIsoDate(value: string): string {
  const date = new Date(value.includes("T") ? value : value.replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function normalizeValue(value: string | number | unknown[]): string {
  if (Array.isArray(value)) return JSON.stringify(value);
  return String(value);
}

// ponytail: alerta = log estructurado por ahora. Conectar a email/cola cuando
// el admin necesite notificación push.
function alertAdmin(submissionId: string, reason: string) {
  console.warn(
    `[ADMIN ALERT] Submission ${submissionId} requiere configuración: ${reason}`
  );
}
