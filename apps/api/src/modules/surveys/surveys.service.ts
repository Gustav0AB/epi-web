import { relativeChange, learningContextIssues } from "@epi/shared";
import { assertSubmissionCourseEditable } from "./surveys.repository.js";
import { normalizeFormQuestions } from "./jotform-client.js";
import { questionVisibility } from "./question-visibility.js";
import { schoolCatalog } from "./school-catalog.js";
import { configuredActivityContext } from "./activity-context.js";
import { prisma } from "../../db/prisma.js";
import { schoolContext, configuredSchoolContext, originalSubmissionDay, schoolGroupingContext, resolvedStoredSchoolContext } from "./school-context.js";
import { resolveSurveyMoment } from "./survey-moment.js";
import { resolveParticipantIdentifier } from "./participant-identifier.js";
import { applySetupQuestions } from "./jotform-questions.js";
import { Prisma, type SurveyMoment } from "@prisma/client";
import { JotformPayloadSchema, type JotformPayload, type AnswerJson } from "./surveys.schema.js";
import { scoreAnswer, aggregate, overallImprovement, categoryQuestionResults, type QuestionType } from "./scoring.js";
import {
  instrumentQuestion,
  validScoringWeights,
  applyMatrixDefaults,
  analysisScoringReady,
  assistantScoringReady,
  analysisWeightsReady,
  WeightInputSchema,
  SchoolContextSchema,
  ActivityContextSchema,
  SubmissionContextReviewSchema,
  type SubmissionContextReviewInput,
  type JotformFormsQuery,
  type JotformFormsPage,
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
  type ReportDetail,
  type ReportFilters,
  type SurveyGroupSearch,
  type CourseExpectationInput,
  type CourseDetailQuery,
  type SubmissionStatus,
  type CourseSubmissionDto,
  type SurveyGroupSearchResult,
} from "@epi/shared";
import { parseCsv } from "./csv.js";
import {
  surveysRepository,
  scopeToDefinitionWhere,
  catalogFieldsRepository,
  persistResults,
  markPending,
  markError,
  type SurveyScope,
} from "./surveys.repository.js";
import { allowedSiteIds } from "../../shared/site-scope.js";
import { jotformClient } from "./jotform-client.js";
import { mapJotformQuestions, parseCatalogLabels } from "./jotform-questions.js";
import { configuredDemographics, responseFingerprint } from "./response-context.js";
import { expandMatrixAnswers } from "./matrix-answers.js";
import { getSurveySetup, validateSiteSetup, validateSetupQuestionCatalog } from "./survey-setup.service.js";
import { env } from "../../config/env.js";

type ProcessOutcome =
  | { status: "PROCESADO"; resultCount: number }
  | { status: "PENDIENTE_CONFIGURACION"; reason: string }
  | { status: "ERROR"; reason: string };

export const surveysService = {
  async schoolCatalog(userId: string) {
    return schoolCatalog(await surveysRepository.schoolCatalogRows(await resolveScope(userId)));
  },
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
      isPreFromMoment(payload.surveyMoment),
      payload.surveyMoment,
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
  listUnregisteredForms,
  registerDefinition,
  updateQuestion,
  reprocessPending,
  syncJotformForms,
  listJotformForms,
  previewFormQuestions,
  definitionSourceContract,
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
  listGroups: (userId: string) => resolveScope(userId).then((scope) => surveysRepository.distinctGroups(scope)),
  getDefinitionFilters: (id: string, userId: string) =>
    resolveScope(userId).then((scope) => surveysRepository.getDefinitionFilters(id, scope)),
  referenceInstruments: async (userId: string) => {
    const actor = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { role: true, organizationId: true } });
    if (actor.role !== "SYSTEM_ADMIN" && (actor.role !== "ORG_ADMIN" || !actor.organizationId)) throw Object.assign(new Error("Sin permisos para consultar configuraciones"), { statusCode: 403 });
    return prisma.surveyDefinition.findMany({ where: actor.role === "SYSTEM_ADMIN" ? {} : { site: { organizationId: actor.organizationId } }, select: { id: true, instrumentName: true, jotformFormId: true, version: true, configurationVersion: true, site: { select: { id: true, name: true, organizationId: true } } }, orderBy: [{ instrumentName: "asc" }, { version: "desc" }] });
  },
  reusableConfiguration: async (id: string, userId: string) => {
    const actor = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { role: true, organizationId: true } });
    if (actor.role !== "SYSTEM_ADMIN" && (actor.role !== "ORG_ADMIN" || !actor.organizationId)) throw Object.assign(new Error("Sin permisos para consultar configuraciones"), { statusCode: 403 });
    const definition = await prisma.surveyDefinition.findFirst({ where: { id, ...(actor.role === "SYSTEM_ADMIN" ? {} : { site: { organizationId: actor.organizationId } }) }, select: { analysisWeights: true, questions: { include: { weight: true }, orderBy: { externalId: "asc" } } } });
    if (!definition) throw Object.assign(new Error("Instrumento no disponible"), { statusCode: 404 });
    return definition;
  },
  getDefinitionQuestions: (id: string, userId: string) =>
    resolveScope(userId).then((scope) => surveysRepository.getDefinitionQuestions(id, scope)),
  countSince: (from: Date, userId: string) =>
    resolveScope(userId).then((scope) => surveysRepository.countSince(from, scope)),
  groupSummary,
  groupSearch,
  saveCourseExpectation,
  courseDetail,
  setSubmissionExclusion,
  setSubmissionMoment,
  setSubmissionContext,
  completeGroup,
  reportResults,
  reportDetail,
  reportFilterOptions,

  /** Ponderación manual de una pregunta (upsert). */
  async setWeight(questionId: string, input: WeightInput, userId: string) {
    const question = await surveysRepository.findQuestion(questionId);
    if (!question) throw new Error(`Pregunta ${questionId} no encontrada`);
    const site = await surveysRepository.findQuestionSite(questionId);
    await assertSiteAllowed(userId, site?.surveyDefinition?.siteId);
    await assertLegacyConfigurationEditable(question.surveyDefinitionId);
    if ((question.role ?? "SCORED") !== "SCORED") throw Object.assign(new Error("Non-assessment questions cannot be weighted"), { statusCode: 400, code: "BAD_REQUEST" });
    return surveysRepository.upsertWeight(questionId, input);
  },

  async deleteWeight(questionId: string, userId: string) {
    const site = await surveysRepository.findQuestionSite(questionId);
    await assertSiteAllowed(userId, site?.surveyDefinition?.siteId);
    const question = await surveysRepository.findQuestion(questionId);
    if (question) await assertLegacyConfigurationEditable(question.surveyDefinitionId);
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

    await assertLegacyConfigurationEditable(surveyDefinitionId);
    const questions = await surveysRepository.getDefinitionQuestions(surveyDefinitionId);
    const byExternalId = new Map(questions.filter((q) => (q.role ?? "SCORED") === "SCORED").map((q) => [q.externalId, q.id]));

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

export async function updateOpenQuestionsSummary(
  surveyDefinitionId: string,
  input: UpdateOpenQuestionsSummaryInput,
  userId: string
) {
  const def = await surveysRepository.findDefinitionSite(surveyDefinitionId);
  await assertSiteAllowed(userId, def?.siteId);
  return surveysRepository.updateOpenQuestionsSummary(surveyDefinitionId, input.summary);
}

const savedForCourseReason = "Envío guardado. Los resultados se calculan desde la edición en Cursos.";

const categoryPendingReason = "La configuración de ponderaciones por categorías está guardada, pero su metodología sigue pendiente de aprobación e integración en el cálculo";
const analysisPendingReason = "La participación por análisis está guardada; faltan reglas y motor por análisis para calcular sin usar la ponderación global anterior";

function savedForCourse(row: { status: string; processingError?: string | null; surveyDefinition?: { configurationVersion?: number | null } | null }) {
  return row.surveyDefinition?.configurationVersion === 4 && row.status === "PENDIENTE_CONFIGURACION" &&
    [savedForCourseReason, categoryPendingReason, analysisPendingReason].some(reason => reason === row.processingError);
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

  let payload = submission.rawJsonData as unknown as JotformPayload;
  const def = submission.surveyDefinitionId ? await surveysRepository.findDefinitionForProcessing(submission.surveyDefinitionId) : await surveysRepository.findActiveDefinition(payload.formID);

  if (!def || def.questions.length === 0) {
    await markPending(submissionId);
    alertAdmin(submissionId, `Sin definición/preguntas para el form ${payload.formID}`);
    return { status: "PENDIENTE_CONFIGURACION", reason: "sin definición configurada" };
  }

  if (payload.unresolvedAnswers?.length) {
    const reason = `${payload.unresolvedAnswers.length} respuestas con identificador ausente, repetido o formato no reconocido; se conserva el origen para revisión`;
    await markPending(submissionId, def.id, reason);
    return { status: "PENDIENTE_CONFIGURACION", reason };
  }


  const matrixAnswers = expandMatrixAnswers(payload.answers, def.questions);
  payload = { ...payload, answers: matrixAnswers.answers };
  const context = configuredSchoolContext(payload.answers, def.questions);
  const activityContext = configuredActivityContext(payload.answers, def.questions);
  const demographicContext = configuredDemographics(payload.answers, def.questions);
  const hasContext = context !== undefined || activityContext !== undefined || demographicContext.gender.configured || demographicContext.age.configured;
  const contextSaved = await prisma.submission.updateMany({ where: { id: submissionId, contextRevision: submission.contextRevision }, data: {
    responseFingerprint: responseFingerprint(def.id, payload.answers),
    ...(hasContext ? { rawJsonData: {
      ...(submission.rawJsonData as Prisma.JsonObject),
      ...(context !== undefined ? { schoolContext: schoolGroupingContext(context, payload.created_at, def.configurationVersion === 4 ? null : def.timeZone) } : {}),
      ...(activityContext !== undefined ? { activityContext } : {}),
      ...(demographicContext.gender.configured || demographicContext.age.configured ? { demographicContext } : {}),
    } as Prisma.InputJsonValue } : {}),
  } });

  if (!contextSaved.count) return { status: "PENDIENTE_CONFIGURACION", reason: "La respuesta cambió durante el procesamiento; reintentar" };
  const detectedMoment = resolveSurveyMoment(payload, def.questions);
  const surveyMoment = submission.reviewMoment ?? (def.questions.some(question => question.role === "MOMENT") ? detectedMoment : def.instrumentKind === "FOLLOW_UP" ? "POST_POST" : def.instrumentKind === "CQS" ? "CQS" : detectedMoment);
  if (!(await surveysRepository.updateSubmissionMoment(submissionId, surveyMoment, isPreFromMoment(surveyMoment), submission.contextRevision)).count) return { status: "PENDIENTE_CONFIGURACION", reason: "La revisión cambió durante el procesamiento; reintentar" };
  if ((def.configurationVersion === 3 || def.configurationVersion === 4) || def.questions.some(question => question.classification != null) || def.analysisWeights != null || def.categoryWeights != null || def.subcategoryWeights != null || def.questions.some(question => question.analysisParticipation != null || question.analysisScoring != null)) {
    const reason = def.configurationVersion === 4 ? savedForCourseReason : def.categoryWeights != null || def.subcategoryWeights != null
      ? categoryPendingReason : analysisPendingReason;
    const byExternalId = new Map(def.questions.map(question => [question.externalId, question]));
    const answers = payload.answers.flatMap(answer => {
      const question = byExternalId.get(answer.questionId);
      return question ? [{ questionId: question.id, value: normalizeValue(answer.value), rawValue: answer.value === null ? Prisma.JsonNull : answer.value }] : [];
    });
    if (!await persistResults({ expectedRevision: submission.contextRevision, submissionId, surveyDefinitionId: def.id, participantId: undefined, isDuplicate: false, answers, results: [], pendingReason: matrixAnswers.warnings.length ? `${reason}; ${matrixAnswers.warnings.join("; ")}` : reason })) return { status: "PENDIENTE_CONFIGURACION", reason: "La revisión cambió durante el procesamiento; reintentar" };
    return { status: "PENDIENTE_CONFIGURACION", reason };
  }
  if (def.questions.some((question) => question.role === "MOMENT")) {
    if (surveyMoment === "UNKNOWN") {
      await markPending(submissionId, def.id);
      return { status: "PENDIENTE_CONFIGURACION", reason: "momento ausente, ambiguo o sin mapeo" };
    }
  }
  const externalParticipantId = resolveParticipantIdentifier(payload, def.questions);
  if (def.questions.some((question) => question.role === "IDENTIFIER") && !externalParticipantId) {
    await markPending(submissionId, def.id);
    return { status: "PENDIENTE_CONFIGURACION", reason: "identificador de participante ausente o ambiguo" };
  }

  // OPEN_TEXT no se pondera; se revisa manualmente y no exige Weight.
  const missing = def.questions
    .filter((q) => (q.role ?? "SCORED") === "SCORED" && q.type !== "OPEN_TEXT" && !q.weight)
    .map((q) => q.externalId);
  if (missing.length > 0) {
    // Se persiste el link a la definición aunque quede pendiente: así se
    // sabe a qué sitio/encuesta pertenece (autorización, listados) y se
    // puede reprocesar en bloque una vez completadas las ponderaciones.
    await markPending(submissionId, def.id);
    alertAdmin(submissionId, `Faltan ponderaciones (Weights): ${missing.join(", ")}`);
    return { status: "PENDIENTE_CONFIGURACION", reason: `faltan pesos: ${missing.join(", ")}` };
  }

  const structuredScored = payload.answers.some(answer => answer.value !== null && typeof answer.value !== "string" && typeof answer.value !== "number" && def.questions.some(question => question.externalId === answer.questionId && (question.role ?? "SCORED") === "SCORED" && question.type !== "OPEN_TEXT"));
  if (structuredScored) {
    await markPending(submissionId, def.id, "Respuesta estructurada sin regla de puntuación compatible");
    return { status: "PENDIENTE_CONFIGURACION", reason: "respuesta estructurada sin regla de puntuación compatible" };
  }

  // Reglas completas → calcular. Un fallo inesperado acá no debe perder el
  // dato: se guarda el detalle y queda en estado ERROR para revisión manual.
  try {
    const byExternalId = new Map(def.questions.map((q) => [q.externalId, q]));
    const answers: { questionId: string; value: string; rawValue: Prisma.InputJsonValue | typeof Prisma.JsonNull }[] = [];
    const scored = [];

    for (const a of payload.answers) {
      const q = byExternalId.get(a.questionId);
      if (!q) continue; // respuesta a un campo no configurado → se ignora
      const value = normalizeValue(a.value);
      answers.push({ questionId: q.id, value, rawValue: a.value === null ? Prisma.JsonNull : a.value }); // se guarda siempre (incl. OPEN_TEXT)
      // Las respuestas en blanco no cuentan para el cálculo (ni en el máximo).
      if ((q.role ?? "SCORED") === "SCORED" && q.type !== "OPEN_TEXT" && q.weight && value.trim() !== "") {
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
      isPrePost: surveyMoment === "PRE",
    }));

    const participantId = externalParticipantId
      ? (await surveysRepository.upsertParticipant(externalParticipantId, {})).id
      : undefined;

    // Duplicado = mismo participante + misma encuesta + mismo momento
    // (pre/post) ya procesado antes. No se bloquea: se marca para revisión.
    const isDuplicate = participantId
      ? Boolean(
          await surveysRepository.findProcessedSibling({
            participantId,
            surveyDefinitionId: def.id,
            surveyMoment,
            excludeSubmissionId: submissionId,
          })
        )
      : false;

    const persisted = await persistResults({
      expectedRevision: submission.contextRevision, submissionId,
      surveyDefinitionId: def.id,
      participantId,
      isDuplicate,
      answers,
      results,
    });

    if (!persisted) return { status: "PENDIENTE_CONFIGURACION", reason: "La revisión cambió durante el procesamiento; reintentar" };
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

export async function listJotformLabels(accountId: string) {
  const account = (await surveysRepository.listJotformAccounts()).find((item) => item.id === accountId);
  if (!account) throw Object.assign(new Error("Cuenta Jotform no encontrada"), { statusCode: 404 });
  return (await jotformClient.listLabels(account.apiKey)).filter(label => !(account.excludedLabelIds ?? []).includes(label.id));
}

/** GET /user/forms → guarda/actualiza el catálogo local y regresa el diff. */
export async function syncJotformForms(accountId?: string) {
  const accounts = await jotformAccountsForApi(accountId);
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
export async function listJotformForms(query: JotformFormsQuery): Promise<JotformFormsPage> {
  const { forms, meta } = await surveysRepository.listJotformForms(query);
  const registeredIds = await surveysRepository.registeredJotformFormIds(forms.map((form) => form.id));
  return {
    forms: forms.map((form) => ({
      id: form.id, title: form.title, status: form.status, labelIds: form.labelIds,
      createdAt: form.createdAt, updatedAt: form.updatedAt, submissionCount: form.submissionCount, lastSubmission: form.lastSubmission, url: form.url,
      accountName: form.account?.name ?? null,
      registered: registeredIds.has(form.id), hasDraft: form.setupDraft != null,
      syncedAt: form.syncedAt.toISOString(),
    })),
    meta,
  };
}

/** GET /form/:id/questions: preguntas configurables y opciones de catálogo reutilizables. */
async function readFormQuestions(formId: string) {
  const [source, properties] = await firstSuccessfulJotform(apiKey => Promise.all([jotformClient.getFormQuestionSource(formId, apiKey), jotformClient.getFormProperties(formId, apiKey)]));
  const questions = normalizeFormQuestions(source);
  const mapped = mapJotformQuestions(questions, parseCatalogLabels(env.CATALOG_DATA));
  const conditions = questionVisibility(questions, properties.conditions);
  return {
    ...mapped,
    skipped: mapped.skipped.map(question => ({ ...question, ...(conditions.visibility.get(question.externalId) ? { visibility: conditions.visibility.get(question.externalId)! } : {}) })),
    scoredQuestions: mapped.scoredQuestions.map(question => ({ ...question, ...(conditions.visibility.get(question.sourceContext?.matrix?.externalId ?? question.externalId) ? { visibility: conditions.visibility.get(question.sourceContext?.matrix?.externalId ?? question.externalId)! } : {}) })),
    conditionWarnings: conditions.warnings,
    conditionSource: conditions.original,
    sourceContract: { schemaVersion: 1, capturedAt: new Date().toISOString(), questionOrder: Object.keys(source), questions: source, properties },
  };
}

export async function previewFormQuestions(formId: string) {
  const { sourceContract: _source, ...preview } = await readFormQuestions(formId);
  return preview;
}

async function definitionSourceContract(definitionId: string, userId: string) {
  const scope = await resolveScope(userId);
  const source = await surveysRepository.definitionSourceContract(definitionId, scope);
  if (!source) throw Object.assign(new Error("Instrumento no encontrado"), { statusCode: 404 });
  return source;
}

function maskApiKey(apiKey: string) {
  return apiKey.length <= 4 ? "••••" : `••••${apiKey.slice(-4)}`;
}

async function jotformApiKeys() {
  return (await jotformAccountsForApi()).map((a) => a.apiKey);
}

async function jotformAccountsForApi(accountId?: string) {
  const accounts = await surveysRepository.listJotformAccounts();
  if (accounts.length === 0) throw new Error("No hay cuentas Jotform conectadas");
  const selected = accountId ? accounts.filter((a) => a.id === accountId) : accounts;
  if (selected.length === 0) throw new Error("Cuenta Jotform no encontrada");
  return selected.map((a) => ({ id: a.id, apiKey: a.apiKey }));
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
    excludedLabelIds: a.excludedLabelIds ?? [],
    createdAt: a.createdAt.toISOString(),
  }));
}

export async function createJotformAccount(input: CreateJotformAccountInput) {
  const labels = await jotformClient.listLabels(input.apiKey);
  if (input.excludedLabelIds.some(id => !labels.some(label => label.id === id))) throw Object.assign(new Error("Hay etiquetas que ya no existen en la cuenta"), { statusCode: 400 });
  await jotformClient.listForms(input.apiKey);
  const account = await surveysRepository.createJotformAccount(input);
  return {
    id: account.id,
    name: account.name,
    apiKeyPreview: maskApiKey(account.apiKey),
    excludedLabelIds: account.excludedLabelIds ?? [],
    createdAt: account.createdAt.toISOString(),
  };
}

export async function jotformAccountLabels(id: string) {
  const account = (await surveysRepository.listJotformAccounts()).find(item => item.id === id);
  if (!account) throw Object.assign(new Error("Cuenta Jotform no encontrada"), { statusCode: 404 });
  return { labels: await jotformClient.listLabels(account.apiKey), excludedLabelIds: account.excludedLabelIds ?? [] };
}
export async function updateJotformAccountLabels(id: string, excludedLabelIds: string[]) {
  const { labels } = await jotformAccountLabels(id);
  if (excludedLabelIds.some(value => !labels.some(label => label.id === value))) throw Object.assign(new Error("Hay etiquetas que ya no existen en la cuenta"), { statusCode: 400 });
  await surveysRepository.updateJotformAccountLabels(id, [...new Set(excludedLabelIds)]);
  return { saved: true };
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

  const setup = input.setupRevision === undefined ? undefined : await getSurveySetup(input.jotformFormId);
  if (setup && (setup.revision !== input.setupRevision || setup.draft.siteId !== input.siteId || setup.draft.type !== input.type)) {
    throw Object.assign(new Error("Configuration changed; reopen the form before registering"), { statusCode: 409, code: "CONFLICT" });
  }
  if (setup && (setup.draft.baseDefinitionId ?? undefined) !== input.baseDefinitionId) throw Object.assign(new Error("Confirma la versión base del borrador antes de activar"), { statusCode: 409 });
  if (setup && (!setup.draft.instrumentName || !setup.draft.activityName)) {
    throw Object.assign(new Error("Instrument and activity are required"), { statusCode: 400, code: "BAD_REQUEST" });
  }
  if (setup) {
    await validateSiteSetup(setup.draft);
    if ((setup.draft.scoringWeightsVersion === 4 || setup.draft.programName || setup.draft.instrumentKind) && (!setup.draft.programName || !setup.draft.instrumentKind || !setup.draft.activityType)) throw Object.assign(new Error("Selecciona tipo de instrumento y tipo de actividad"), { statusCode: 400 });
  }
  const { scoredQuestions, catalogMatches, skipped, conditionSource, sourceContract } = await readFormQuestions(input.jotformFormId);
  if (scoredQuestions.some(question => question.sourceContext?.matrix) && setup?.draft.scoringWeightsVersion !== 4) throw Object.assign(new Error("Configura las filas de matriz mediante el asistente antes de activar"), { statusCode: 400 });
  if (setup?.draft.scoringWeightsVersion === 4 && skipped.some(question => question.type === "control_matrix")) throw Object.assign(new Error("Hay matrices con filas u opciones ambiguas o tipos de celda pendientes; revisa el origen antes de activar"), { statusCode: 400 });
  const effectiveQuestions = applyMatrixDefaults(applySetupQuestions(scoredQuestions, setup?.draft.questions, setup?.draft.scoringWeightsVersion), setup?.draft.matrixDefaults);
  const configuredQuestions = setup?.draft.configurationMode === "instrument" ? effectiveQuestions.map(instrumentQuestion) : effectiveQuestions;
  if (setup?.draft.matrixDefaults?.some(group => !scoredQuestions.some(question => question.sourceContext?.matrix?.externalId === group.externalId))) throw Object.assign(new Error("Las matrices cambiaron; revisa sus reglas generales"), { statusCode: 409 });
  if (setup?.draft.scoringWeightsVersion === 4 && setup.draft.instrumentKind === "LEARNING") {
    const issues = learningContextIssues(configuredQuestions.filter(question => !question.sourceContext?.matrixParent));
    if (issues.length) throw Object.assign(new Error(issues.join(" ")), { statusCode: 400, code: "BAD_REQUEST" });
  }
  if (setup) await validateSetupQuestionCatalog(configuredQuestions, input.siteId, setup.draft.scoringWeightsVersion === 4);
  if (configuredQuestions.some(question => question.classification != null) && setup?.draft.scoringWeightsVersion !== 3 && setup?.draft.scoringWeightsVersion !== 4) throw Object.assign(new Error("La clasificación independiente requiere scoringWeightsVersion=3 o 4"), { statusCode: 400 });
  if ((setup?.draft.scoringWeightsVersion === 3 || setup?.draft.scoringWeightsVersion === 4) && setup.draft.instrumentKind !== "CQS" && configuredQuestions.some(question => (question.role ?? "SCORED") === "SCORED" && question.type !== "OPEN_TEXT" && question.analysisParticipation == null)) throw Object.assign(new Error("Configura la participación de cada pregunta evaluable, incluso si no participa en ningún análisis"), { statusCode: 400 });
  if (setup?.draft.scoringWeightsVersion === 4 && setup.draft.instrumentKind !== "CQS" && !assistantScoringReady(configuredQuestions)) throw Object.assign(new Error("Revisa las reglas: selecciona respuesta correcta y valor o escala con máximo e inversión, sin puntos parciales; confirma las opciones actuales"), { statusCode: 400 });
  if (setup?.draft.instrumentKind !== "CQS" && (setup?.draft.analysisWeights !== undefined || configuredQuestions.some(question => question.analysisScoring != null)) && !analysisScoringReady(configuredQuestions)) {
    throw Object.assign(new Error("Completa la puntuación de cada pregunta habilitada en cada análisis; revisa máximos, respuestas correctas, puntos por opción y rangos/dirección contra las preguntas actuales"), { statusCode: 400, code: "BAD_REQUEST" });
  }
  if (setup?.draft.instrumentKind !== "CQS" && setup?.draft.analysisWeights !== undefined && !analysisWeightsReady(configuredQuestions, setup.draft.analysisWeights, setup.draft.instrumentKind !== "FOLLOW_UP")) {
    throw Object.assign(new Error("Completa los pesos de cada análisis: subcategorías al 100% por categoría y categorías del IAA al 100% en aprendizaje"), { statusCode: 400, code: "BAD_REQUEST" });
  }
  if (setup?.draft.scoringWeightsVersion === 2 && !validScoringWeights(configuredQuestions, setup.draft.categoryWeights ?? [], setup.draft.subcategoryWeights ?? [], !["CQS", "FOLLOW_UP"].includes(setup.draft.instrumentKind ?? ""))) {
    throw Object.assign(new Error("Revisa las preguntas actuales y sus pesos: cada subcategoría debe sumar 100% y el IAA solo aplica a aprendizaje"), { statusCode: 400, code: "BAD_REQUEST" });
  }
  if (catalogMatches.length > 0) await catalogFieldsRepository.upsertMatches(catalogMatches);

  const def = await surveysRepository.createDefinitionWithQuestions({
    siteId: input.siteId,
    jotformFormId: input.jotformFormId,
    type: input.type,
    questions: configuredQuestions,
    sourceConditions: conditionSource,
    sourceContract,
    ...(setup ? { setup: { activatedBy: userId, baseDefinitionId: setup.draft.baseDefinitionId, ...(setup.draft.matrixDefaults ? { matrixDefaults: setup.draft.matrixDefaults as unknown as Prisma.InputJsonValue } : {}), configurationVersion: setup.draft.scoringWeightsVersion, programName: setup.draft.programName, instrumentKind: setup.draft.instrumentKind, revision: setup.revision, ...(setup.draft.analysisWeights !== undefined ? { analysisWeights: setup.draft.analysisWeights as unknown as Prisma.InputJsonValue } : {}), instrumentName: setup.draft.instrumentName, activityName: setup.draft.activityName, activityType: setup.draft.activityType, description: setup.draft.description, timeZone: setup.draft.timeZone, ...((setup.draft.scoringWeightsVersion === 2 || (setup.draft.scoringWeightsVersion === 3 || setup.draft.scoringWeightsVersion === 4) && (setup.draft.categoryWeights !== undefined || setup.draft.subcategoryWeights !== undefined)) ? { categoryWeights: (setup.draft.categoryWeights ?? []) as unknown as Prisma.InputJsonValue, subcategoryWeights: (setup.draft.subcategoryWeights ?? []) as unknown as Prisma.InputJsonValue } : {}) } } : {}),
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
  const question = await surveysRepository.findQuestion(questionId);
  if (question) await assertLegacyConfigurationEditable(question.surveyDefinitionId);
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
  // Only global administrators can reprocess a submission without an assigned site.
  await assertSiteAllowed(userId, site?.surveyDefinition?.siteId);
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
    { pre: number; post: number; cqs: number; students: Set<string>; blanks: number; statuses: string[] }
  >();

  for (const s of subs) {
    const g = s.participant?.groupName;
    if (!g) continue;
    let acc = groups.get(g);
    if (!acc) {
      acc = { pre: 0, post: 0, cqs: 0, students: new Set(), blanks: 0, statuses: [] };
      groups.set(g, acc);
    }
    if (s.surveyMoment === "PRE") acc.pre++;
    else if (s.surveyMoment === "POST") acc.post++;
    else if (s.surveyMoment === "CQS") acc.cqs++;
    if (s.participantId) acc.students.add(s.participantId);
    acc.blanks += s._count.answers;
    acc.statuses.push(s.status);
  }

  return [...groups.entries()].map(([groupName, g]) => ({
    groupName,
    preCount: g.pre,
    postCount: g.post,
    cqsCount: g.cqs,
    students: g.students.size,
    blanks: g.blanks,
    completed: g.statuses.length > 0 && g.statuses.every((st) => st === "COMPLETADO"),
    canComplete: g.pre > 0 && g.post > 0,
  }));
}

export async function groupSearch(input: SurveyGroupSearch, userId: string): Promise<SurveyGroupSearchResult> {
  const scope = await resolveScope(userId);
  const rows = await surveysRepository.groupSearchRows({
    includeUnprocessed: true, includeContext: true,
    questionId: input.questionId, answerValue: input.answerValue,
    scope,
    siteId: input.siteId,
    surveyDefinitionId: input.surveyDefinitionId,
    from: input.from,
    to: input.to,
  });
  const matchingRows = rows.filter(row => {
    const date = reviewGroupDate(row);
    return (!input.from || date >= input.from) && (!input.to || date <= input.to);
  });
  const grouped = summarizeGroupSearchRows(matchingRows, [], true);
  const expectations = await surveysRepository.courseExpectations(grouped.rows.flatMap((row) => row.siteId ? [{ siteId: row.siteId, school: row.school, date: row.date }] : []));
  const result = summarizeGroupSearchRows(matchingRows, expectations, true);
  const filtered = result.rows.filter(row => {
    if (input.entryType === "courses" && !row.courseId) return false;
    if (input.entryType === "individual" && row.courseId) return false;
    const status = row.courseStatus === "DRAFT" ? (row.errorCount ? "ERROR" : "PENDING") : row.courseStatus ?? (row.errorCount ? "ERROR" : "PENDING");
    return !input.reviewStatus || input.reviewStatus === status;
  });
  return { rows: filtered, totalGroups: filtered.length };
}

export async function setSubmissionContext(id: string, input: SubmissionContextReviewInput, userId: string) {
  const parsed = SubmissionContextReviewSchema.safeParse(input);
  if (!parsed.success) throw Object.assign(new Error("Invalid school/date review"), { statusCode: 400 });
  const scope = await resolveScope(userId);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  await prisma.$transaction(async (tx) => {
    const where = { id, surveyDefinition: scopeToDefinitionWhere(scope) ?? {} };
    const previous = await tx.submission.findFirst({ where, select: { reviewActivity: true, reviewSchool: true, reviewDate: true, reviewGender: true, reviewAge: true } });
    if (!previous) throw Object.assign(new Error("Submission not found in your accessible surveys"), { statusCode: 404 });
    await assertSubmissionCourseEditable(tx, id);
    const activity = parsed.data.context === null ? null : parsed.data.context.activity === undefined ? previous.reviewActivity : parsed.data.context.activity || null;
    const result = await tx.submission.updateMany({ where: { ...where, contextRevision: parsed.data.expectedRevision }, data: {
      reviewGender: parsed.data.context === null ? null : parsed.data.context.gender === undefined ? previous.reviewGender : parsed.data.context.gender || null, reviewAge: parsed.data.context === null ? null : parsed.data.context.age === undefined ? previous.reviewAge : parsed.data.context.age,
      reviewActivity: activity, reviewSchool: parsed.data.context?.school ?? null, reviewDate: parsed.data.context?.date ?? null,
      contextRevision: { increment: 1 }, reviewedBy: userId, reviewedAt: new Date(),
    } });
    if (!result.count) throw Object.assign(new Error("Context changed; reload before saving"), { statusCode: 409 });
    await tx.auditLog.create({ data: { actorId: user.id, actorUsername: user.username, actorRole: user.role, actorOrganizationId: user.organizationId, action: "SUBMISSION_CONTEXT_REVIEW", targetType: "Submission", targetId: id, metadata: { previous, context: parsed.data.context ? { ...parsed.data.context, activity } : null, revision: parsed.data.expectedRevision + 1 } } });
  });
  return { saved: true };
}

export async function setSubmissionMoment(id: string, moment: "PRE" | "POST" | "POST_POST" | "CQS" | null, userId: string, expectedRevision?: number) {
  await surveysRepository.setSubmissionMoment(id, moment, userId, await resolveScope(userId), expectedRevision);
  return { saved: true };
}

export async function setSubmissionExclusion(id: string, excluded: boolean, userId: string, expectedRevision?: number) {
  const scope = await resolveScope(userId);
  const result = await surveysRepository.setSubmissionExclusion(id, excluded, userId, scope, expectedRevision);
  if (!result.count) throw Object.assign(new Error("Submission not found in your accessible surveys"), { statusCode: 404 });
  return { saved: true };
}

export async function courseDetail(input: CourseDetailQuery, userId: string): Promise<CourseSubmissionDto[]> {
  await assertSiteAllowed(userId, input.siteId);
  const scope = await resolveScope(userId);
  const rows = await surveysRepository.groupSearchRows({ includeUnprocessed: true, includeContext: true, scope, siteId: input.siteId, surveyDefinitionId: input.surveyDefinitionId, from: input.date, to: input.date });
  const ids = rows.filter((row) => (input.groupId && row.courseMembership?.application.course.id === input.groupId ? true : reviewGroupDate(row) === input.date && (input.groupId ? reviewRowKey(row, true) === input.groupId : reviewGroupSchool(row) === input.school))).map((row) => row.id);
  if (!ids.length) return [];
  const details = await surveysRepository.courseSubmissionDetails(ids, scope);
  return details.map((row) => ({
    id: row.id, jotformSubmissionId: row.jotformSubmissionId, receivedAt: row.receivedAt.toISOString(),
    reviewMoment: row.reviewMoment, reviewExcluded: row.reviewExcluded, surveyMoment: row.surveyMoment, status: row.status, savedForCourse: savedForCourse(row), processingError: row.processingError, isDuplicate: row.isDuplicate, participantName: row.participant?.name ?? null, participantId: row.participantId,
    activityContext: ActivityContextSchema.safeParse((row.rawJsonData as Prisma.JsonObject | null)?.activityContext).data ?? null,
    contextRevision: row.contextRevision,
    confirmedContext: row.reviewSchool && row.reviewDate ? { school: row.reviewSchool, date: row.reviewDate, activity: row.reviewActivity, gender: row.reviewGender, age: row.reviewAge } : null,
    schoolContext: resolvedStoredSchoolContext((row.rawJsonData as Prisma.JsonObject | null)?.schoolContext) ?? null,
    submittedAt: resolvedStoredSchoolContext((row.rawJsonData as Prisma.JsonObject | null)?.schoolContext)?.originalSubmittedAt ?? (typeof (row.rawJsonData as Prisma.JsonObject | null)?.created_at === "string" ? (row.rawJsonData as Prisma.JsonObject).created_at as string : null),
    answers: row.answers.map((answer) => ({ questionId: answer.questionId, text: answer.question.text, value: answer.value })),
  }));
}

export async function saveCourseExpectation(input: CourseExpectationInput, userId: string) {
  await assertSiteAllowed(userId, input.siteId);
  const scope = await resolveScope(userId);
  const rows = await surveysRepository.groupSearchRows({ includeUnprocessed: true, includeContext: true, scope, siteId: input.siteId, from: input.date, to: input.date });
  if (!summarizeGroupSearchRows(rows, [], true).rows.some((row) => row.school === input.school && row.date === input.date)) {
    throw Object.assign(new Error("Course not found in your accessible surveys"), { statusCode: 404 });
  }
  await surveysRepository.saveCourseExpectation(input, userId);
  return { saved: true };
}

function reviewGroupSchool(row: { participant: { school: string | null } | null; reviewSchool?: string | null; rawJsonData?: unknown; surveyDefinition?: { configurationVersion?: number | null } | null }) {
  if (row.surveyDefinition?.configurationVersion !== 4) return row.participant?.school?.trim() || "Sin escuela";
  const detected = resolvedStoredSchoolContext((row.rawJsonData as Prisma.JsonObject | null)?.schoolContext);
  return row.reviewSchool?.trim() || detected?.school?.trim() || row.participant?.school?.trim() || "Sin escuela";
}

function reviewGroupDate(row: { receivedAt: Date; reviewDate?: string | null; rawJsonData?: unknown; surveyDefinition?: { configurationVersion?: number | null } | null }) {
  const received = row.receivedAt.toISOString().slice(0, 10);
  if (row.surveyDefinition?.configurationVersion !== 4) return received;
  const raw = row.rawJsonData as Prisma.JsonObject | null;
  const detected = resolvedStoredSchoolContext(raw?.schoolContext);
  return row.reviewDate ?? detected?.groupingDate ?? detected?.extractedDate ?? originalSubmissionDay(raw?.created_at) ?? received;
}

function reviewRowKey(row: { receivedAt: Date; participant: { school: string | null } | null; reviewSchool?: string | null; reviewDate?: string | null; reviewActivity?: string | null; rawJsonData?: unknown; surveyDefinition: { siteId: string; configurationVersion?: number | null } | null }, reviewContext: boolean) {
  const date = reviewContext ? reviewGroupDate(row) : row.receivedAt.toISOString().slice(0, 10);
  const school = reviewContext ? reviewGroupSchool(row) : row.participant?.school?.trim() || "Sin escuela";
  const siteId = row.surveyDefinition?.siteId ?? null;
  return JSON.stringify(reviewContext && row.surveyDefinition?.configurationVersion === 4 ? [siteId, row.surveyDefinition && "id" in row.surveyDefinition ? row.surveyDefinition.id : null, row.reviewActivity ?? ActivityContextSchema.safeParse((row.rawJsonData as Prisma.JsonObject | null)?.activityContext).data?.activity ?? (row.surveyDefinition && "activityName" in row.surveyDefinition ? row.surveyDefinition.activityName : null), date, school.trim().replace(/\s+/g, " ").toLocaleLowerCase()] : [siteId, date, school]);
}

export function summarizeGroupSearchRows(
  rows: {
    courseMembership?: { application: { course: { id: string; status: string; name: string; school?: string; isOpenPublic?: boolean; expectedParticipants?: number | null } } } | null;
    reviewExcluded: boolean;
    status: SubmissionStatus;
    receivedAt: Date;
    surveyDefinition: { siteId: string; configurationVersion?: number | null } | null;
    reviewSchool?: string | null; reviewDate?: string | null; rawJsonData?: unknown; processingError?: string | null;
    surveyMoment: SurveyMoment;
    participantId: string | null;
    participant: { school: string | null } | null;
    results: { calculatedScore: number; maxPossible: number }[];
  }[],
  expectations: { siteId: string; school: string; date: string; expectedParticipants: number }[] = [],
  reviewContext = false,
): SurveyGroupSearchResult {
  const groups = new Map<
    string,
    {
      isOpenPublic?: boolean; courseId?: string; courseStatus?: "DRAFT" | "REVIEWED" | "COMPLETED"; courseName?: string; courseSchool?: string; confirmedParticipants?: number | null; dates: Set<string>;
      siteId: string | null;
      school: string;
      date: string;
      students: Set<string>;
      schools: Map<string, number>;
      excludedCount: number;
      pendingCount: number;
      versioned: boolean; savedCount: number;
      errorCount: number;
      preCount: number;
      postCount: number;
      cqsCount: number;
      pre: number[];
      post: number[];
    }
  >();

  for (const row of rows) {
    const date = reviewContext ? reviewGroupDate(row) : row.receivedAt.toISOString().slice(0, 10);
    const school = reviewContext ? reviewGroupSchool(row) : row.participant?.school?.trim() || "Sin escuela";
    const siteId = row.surveyDefinition?.siteId ?? null;
    const course = reviewContext ? row.courseMembership?.application.course : null;
    const isCourse = course?.status === "DRAFT" || course?.status === "REVIEWED" || course?.status === "COMPLETED";
    const key = isCourse ? course.id : reviewRowKey(row, reviewContext);
    let acc = groups.get(key);
    if (!acc) {
      acc = { ...(isCourse ? { courseId: course.id, courseStatus: course.status as "DRAFT" | "REVIEWED" | "COMPLETED", courseName: course.name, isOpenPublic: course.isOpenPublic, courseSchool: course.isOpenPublic ? "Abierto al público" : course.school, confirmedParticipants: course.expectedParticipants } : {}), dates: new Set(), siteId, school, date, students: new Set(), schools: new Map(), excludedCount: 0, pendingCount: 0, versioned: false, savedCount: 0, errorCount: 0, preCount: 0, postCount: 0, cqsCount: 0, pre: [], post: [] };
      groups.set(key, acc);
    }
    acc.dates.add(date);
    if (date > acc.date) acc.date = date;
    if (!row.reviewExcluded) acc.schools.set(school, (acc.schools.get(school) ?? 0) + 1);
    if (reviewContext && row.surveyDefinition?.configurationVersion === 4) acc.versioned = true;
    if (row.reviewExcluded) { acc.excludedCount++; continue; }
    if (row.status === "PENDIENTE_CONFIGURACION" && !(reviewContext && savedForCourse(row))) { acc.pendingCount++; continue; }
    if (reviewContext && savedForCourse(row)) acc.savedCount++;
    if (row.status === "ERROR") { acc.errorCount++; continue; }
    if (row.participantId) acc.students.add(row.participantId);
    if (row.surveyMoment === "PRE") acc.preCount++;
    else if (row.surveyMoment === "POST") acc.postCount++;
    else if (row.surveyMoment === "CQS") acc.cqsCount++;

    if (row.surveyMoment !== "PRE" && row.surveyMoment !== "POST") continue;
    const scored = row.results.filter((r) => r.maxPossible > 0);
    if (scored.length === 0) continue;
    const pct =
      scored.reduce((sum, r) => sum + (r.calculatedScore / r.maxPossible) * 100, 0) / scored.length;
    (row.surveyMoment === "PRE" ? acc.pre : acc.post).push(pct);
  }

  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const rounded = (n: number) => Math.round(n * 10) / 10;
  const expectedByCourse = new Map(expectations.map((item) => [JSON.stringify([item.siteId, item.date, item.school]), item.expectedParticipants]));
  const resultRows = [...groups.entries()].map(([id, g]) => {
    const pre = avg(g.pre);
    const post = avg(g.post);
    const manualExpectedParticipants = expectedByCourse.get(id) ?? null;
    const expected = manualExpectedParticipants ?? g.preCount;
    return {
      ...(g.courseId ? { isOpenPublic: g.isOpenPublic ?? false, courseId: g.courseId, courseStatus: g.courseStatus, courseName: g.courseName, confirmedParticipants: g.confirmedParticipants, dates: [...g.dates].sort() } : {}),
      ...(g.versioned ? { versioned: true, savedCount: g.savedCount } : {}),
      ...(reviewContext ? { contextNeedsReview: g.schools.size > 1 || g.schools.has("Sin escuela") } : {}),
      excludedCount: g.excludedCount,
      pendingCount: g.pendingCount,
      errorCount: g.errorCount,
      manualExpectedParticipants,
      id,
      siteId: g.siteId,
      school: g.courseSchool ?? (reviewContext ? [...new Map([...g.schools.keys()].filter(school => school !== "Sin escuela").map(school => [school.toLocaleLowerCase(), school])).values()].sort((a, b) => a.localeCompare(b)).join(", ") || "Sin escuela" : g.school),
      date: g.date,
      studentsResponded: reviewContext ? Math.max(g.preCount, g.postCount) : g.students.size,
      expectedParticipants: expected,
      meetsResponseCoverage: expected > 0 && [g.preCount, g.postCount, g.cqsCount].every((count) => count * 100 >= expected * 80),
      preResponsePercent: expected > 0 ? rounded(g.preCount / expected * 100) : null,
      postResponsePercent: expected > 0 ? rounded(g.postCount / expected * 100) : null,
      cqsResponsePercent: expected > 0 ? rounded(g.cqsCount / expected * 100) : null,
      manager: null,
      preCount: g.preCount,
      postCount: g.postCount,
      cqsCount: g.cqsCount,
      improvementPercent: !g.versioned && relativeChange(pre, post) !== null ? rounded(relativeChange(pre, post)!) : null,
    };
  });

  return { totalGroups: resultRows.length, rows: resultRows.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id)) };
}

/**
 * Marca como COMPLETADO todas las submissions procesadas de un grupo.
 * Requiere que existan ambas encuestas (pre y post): sin una de las dos
 * no se permite pasar al estado completado.
 */
export async function completeGroup(groupName: string, userId: string) {
  const scope = await resolveScope(userId);
  const subs = await surveysRepository.findGroupSubmissions(groupName, scope);
  const hasPre = subs.some((s) => s.surveyMoment === "PRE");
  const hasPost = subs.some((s) => s.surveyMoment === "POST");
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
    siteIds: user.siteIds,
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
  filters: ReportFilters,
  userId: string
) {
  if (filters.courseDate || filters.excludedQuestionIds?.length) return (await reportDetail(filters, userId)).categories;
  const scope = await resolveScope(userId);
  if (filters.surveyDefinitionId && scope.excludedSurveyDefinitionIds?.includes(filters.surveyDefinitionId)) return [];
  let siteIds = scope.siteIds;
  if (filters.siteId) {
    if (siteIds && !siteIds.includes(filters.siteId)) return []; // fuera de su alcance
    siteIds = [filters.siteId];
  }

  const subs = await surveysRepository.completedWithResults({
    scope: { siteIds, excludedSurveyDefinitionIds: scope.excludedSurveyDefinitionIds },
    surveyDefinitionId: filters.surveyDefinitionId,
    type: filters.type,
    school: filters.school,
    from: filters.from,
    to: filters.to,
  });

  return aggregateCategoryResults(subs, filters.category);
}

export async function reportDetail(filters: Parameters<typeof reportResults>[0], userId: string): Promise<ReportDetail> {
  const scope = await resolveScope(userId);
  if (filters.surveyDefinitionId && scope.excludedSurveyDefinitionIds?.includes(filters.surveyDefinitionId)) {
    return { overallImprovement: null, total: emptyReportRow("Total"), categories: [], questions: [] };
  }
  if (filters.siteId && scope.siteIds && !scope.siteIds.includes(filters.siteId)) {
    return { overallImprovement: null, total: emptyReportRow("Total"), categories: [], questions: [] };
  }
  const courseRows = filters.courseDate ? await surveysRepository.groupSearchRows({
    scope, siteId: filters.siteId, surveyDefinitionId: filters.surveyDefinitionId,
    from: filters.courseDate, to: filters.courseDate,
  }) : undefined;
  const courseSubmissionIds = courseRows?.filter((row) => (row.participant?.school?.trim() || "Sin escuela") === filters.school).map((row) => row.id);
  const subs = await surveysRepository.completedWithAnswers({
    scope: { siteIds: filters.siteId ? [filters.siteId] : scope.siteIds, excludedSurveyDefinitionIds: scope.excludedSurveyDefinitionIds },
    surveyDefinitionId: filters.surveyDefinitionId,
    type: filters.type,
    submissionIds: courseSubmissionIds,
    school: filters.courseDate ? undefined : filters.school,
    from: filters.from,
    to: filters.to,
  });
  return buildReportDetail(subs, filters);
}

export function buildReportDetail(subs: Awaited<ReturnType<typeof surveysRepository.completedWithAnswers>>, filters: ReportFilters): ReportDetail {
  const rows = subs.flatMap((s) => s.answers
    .filter((a) => (a.question.role ?? "SCORED") === "SCORED" && a.question.weight && a.question.type !== "OPEN_TEXT")
    .map((a) => ({
      submissionId: s.id,
      questionId: a.question.id,
      text: a.question.text,
      category: a.question.weight!.category,
      subcategory: a.question.weight!.subcategory,
      score: scoreAnswer({ type: a.question.type as QuestionType, value: a.value, maxScore: a.question.weight!.maxScore, correctAnswer: a.question.weight!.correctAnswer }),
      max: a.question.weight!.maxScore,
      pre: s.surveyMoment === "PRE",
    })));
  const excluded = new Set(filters.excludedQuestionIds);
  const questionRows = filters.category ? rows.filter((r) => r.category === filters.category) : rows;
  const filteredRows = questionRows.filter((r) => !excluded.has(r.questionId));
  const totalRows = [...filteredRows.reduce((map, r) => {
    const existing = map.get(r.submissionId) ?? { pre: r.pre, score: 0, max: 0 };
    existing.score += r.score; existing.max += r.max; map.set(r.submissionId, existing); return map;
  }, new Map<string, { pre: boolean; score: number; max: number }>()).values()];
  const questions = [...new Map(questionRows.map((r) => [r.questionId, r])).values()].map((r) => {
    const answers = questionRows.filter((x) => x.questionId === r.questionId && x.max > 0);
    const result = makeDetailRow(r.text, answers);
    return { ...result, category: r.category, subcategory: r.subcategory, questionId: r.questionId, text: r.text, preCount: answers.filter((x) => x.pre).length, postCount: answers.filter((x) => !x.pre).length, excluded: excluded.has(r.questionId), comparable: result.pre !== null && result.post !== null };
  });
  return { overallImprovement: overallImprovement(questions), total: makeDetailRow("Total", totalRows), categories: categoryQuestionResults(questions), questions };
}

function emptyReportRow(name: string) { return { category: name, subcategory: null, pre: null, post: null, change: null }; }
export function makeDetailRow(name: string, rows: { pre: boolean; score: number; max: number }[]) {
  const average = (pre: boolean) => { const values = rows.filter((r) => r.pre === pre && r.max > 0); return values.length ? Math.round(values.reduce((sum, r) => sum + (r.score / r.max) * 100, 0) / values.length * 10) / 10 : null; };
  const pre = average(true), post = average(false);
  return { category: name, subcategory: null, pre, post, change: relativeChange(pre, post) !== null ? Math.round(relativeChange(pre, post)! * 10) / 10 : null };
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
        change: relativeChange(pre, post) !== null ? Math.round(relativeChange(pre, post)! * 10) / 10 : null,
      };
    })
    .sort((a, b) => a.category.localeCompare(b.category) || (a.subcategory ?? "").localeCompare(b.subcategory ?? ""));
}

/** Opciones para los dropdowns del dashboard (respetando el alcance del usuario). */
export async function reportFilterOptions(userId: string) {
  const scope = await resolveScope(userId);
  return surveysRepository.reportFilterOptions(scope);
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
    if (a && a.questionId != null && (typeof a.value === "string" || typeof a.value === "number" || (typeof a.value === "boolean" && (RESERVED.isPre as readonly string[]).includes(String(a.questionId).toLowerCase())))) {
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

  const surveyMoment = momentFromRaw(b.surveyMoment ?? b.isPrePost ?? pick(RESERVED.isPre));
  const isPrePost = surveyMoment === "PRE" ? true : surveyMoment === "POST" ? false : undefined;

  const schoolAnswer = (b.answers as { questionId?: unknown; value?: unknown }[]).find(answer =>
    answer && typeof answer.questionId === "string" && (RESERVED.school as readonly string[]).includes(answer.questionId.toLowerCase())
  );
  const context = schoolContext((b.participant as Record<string, unknown> | undefined)?.school ?? schoolAnswer?.value);
  return { ...b, schoolContext: context, participant: p.id ? p : b.participant, isPrePost, surveyMoment };
}

function momentFromRaw(value: unknown): SurveyMoment {
  if (value === true) return "PRE";
  if (value === false) return "POST";
  const raw = String(value ?? "").trim();
  if (/^pre$/i.test(raw)) return "PRE";
  if (/^post$/i.test(raw)) return "POST";
  if (/^post[_ -]post$/i.test(raw)) return "POST_POST";
  if (/cqs|satisf/i.test(raw)) return "CQS";
  return "UNKNOWN";
}

function isPreFromMoment(moment: SurveyMoment): boolean | null {
  if (moment === "PRE") return true;
  if (moment === "POST") return false;
  return null;
}

// Claves del rawRequest plano que no son respuestas a preguntas.
const NON_ANSWER_KEYS = new Set(["slug", "event_id", "formID", "submissionID", "buildDate"]);

// Webhook real de Jotform: rawRequest trae un objeto plano keyed por el
// `name` del campo (ej. { q3_dropdown1: "Grupo 1", q5_number3: "20" }).
function answersFromFlatWebhook(flat: Record<string, unknown>): { questionId: string; value: unknown }[] {
  return Object.entries(flat)
    .filter(([k, v]) => !NON_ANSWER_KEYS.has(k) && v !== undefined)
    .map(([questionId, value]) => ({ questionId, value }));
}

// Preserve the qid-keyed source; only unambiguous names enter the scoring pipeline.
function answersFromSubmissionsApi(source: Record<string, unknown>) {
  const answers: { questionId: string; value: unknown }[] = [];
  const unresolvedAnswers: { sourceId: string; reason: "MISSING_NAME" | "DUPLICATE_NAME" | "INVALID_ENTRY" }[] = [];
  const named: { sourceId: string; name: string; value: unknown }[] = [];
  for (const [sourceId, raw] of Object.entries(source)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      unresolvedAnswers.push({ sourceId, reason: "INVALID_ENTRY" });
      continue;
    }
    const entry = raw as Record<string, unknown>;
    // Structural controls can lack an answer; retain their metadata without inventing a response.
    if (!Object.hasOwn(entry, "answer")) continue;
    if (typeof entry.name !== "string" || !entry.name.trim()) {
      unresolvedAnswers.push({ sourceId, reason: "MISSING_NAME" });
      continue;
    }
    named.push({ sourceId, name: entry.name, value: entry.answer });
  }
  const counts = new Map<string, number>();
  for (const entry of named) counts.set(entry.name, (counts.get(entry.name) ?? 0) + 1);
  for (const entry of named) {
    if (counts.get(entry.name)! > 1) unresolvedAnswers.push({ sourceId: entry.sourceId, reason: "DUPLICATE_NAME" });
    else answers.push({ questionId: entry.name, value: entry.value });
  }
  return { answers, ...(unresolvedAnswers.length ? { unresolvedAnswers } : {}) };
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
      ...(typeof b.created_at === "string" ? { created_at: b.created_at } : {}),
      formID: b.form_id,
      submissionID: b.id,
      sourceAnswers: b.answers,
      ...answersFromSubmissionsApi(b.answers as Record<string, unknown>),
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

function normalizeValue(value: AnswerJson): string {
  if (value === null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

// ponytail: alerta = log estructurado por ahora. Conectar a email/cola cuando
// el admin necesite notificación push.
function alertAdmin(submissionId: string, reason: string) {
  console.warn(
    `[ADMIN ALERT] Submission ${submissionId} requiere configuración: ${reason}`
  );
}

async function assertLegacyConfigurationEditable(definitionId: string) {
  const definition = await surveysRepository.findDefinition(definitionId);
  if (definition && ((definition.configurationVersion ?? 0) >= 3 || await prisma.surveyDefinition.count({ where: { jotformFormId: definition.jotformFormId, version: { gt: definition.version } } }) > 0)) throw Object.assign(new Error("Esta configuración está versionada. Abre una nueva versión desde el asistente; la versión activa no se modifica directamente."), { statusCode: 409, code: "CONFLICT" });
}
