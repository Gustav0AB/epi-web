import { prisma } from "../../db/prisma.js";
import type { Prisma, QuestionType } from "@prisma/client";
import type { SurveyFilters, WeightInput } from "@epi/shared";

// Alcance de un usuario sobre encuestas: sitios permitidos (ya sin los
// excluidos, ver site-scope.ts) + encuestas puntuales excluidas aunque su
// sitio sí esté permitido. undefined/[] = sin restricción en ese eje.
export type SurveyScope = {
  siteIds?: string[] | undefined;
  excludedSurveyDefinitionIds?: string[] | undefined;
  organizationId?: string | null | undefined;
};

export function scopeToDefinitionWhere(scope?: SurveyScope): Prisma.SurveyDefinitionWhereInput | undefined {
  if (!scope) return undefined;
  const where: Prisma.SurveyDefinitionWhereInput = {};
  if (scope.siteIds) where.siteId = { in: scope.siteIds };
  if (scope.excludedSurveyDefinitionIds?.length) where.id = { notIn: scope.excludedSurveyDefinitionIds };
  return Object.keys(where).length ? where : undefined;
}

export const surveysRepository = {
  // Idempotente: reenvíos del mismo webhook no duplican la submission.
  upsertSubmission(jotformSubmissionId: string, rawJsonData: Prisma.InputJsonValue, isPre: boolean) {
    return prisma.submission.upsert({
      where: { jotformSubmissionId },
      create: { jotformSubmissionId, rawJsonData, isPre },
      update: { rawJsonData, isPre },
    });
  },

  upsertParticipant(
    externalId: string,
    data: {
      name?: string | undefined;
      age?: number | undefined;
      gender?: string | undefined;
      school?: string | undefined;
      groupName?: string | undefined;
    }
  ) {
    // strip undefined: exactOptionalPropertyTypes rechaza claves con undefined
    const clean = Object.fromEntries(
      Object.entries(data).filter(([, v]) => v !== undefined)
    ) as Prisma.ParticipantUpdateInput;
    return prisma.participant.upsert({
      where: { externalId },
      create: { externalId, ...clean } as Prisma.ParticipantCreateInput,
      update: clean,
    });
  },

  findSubmission(id: string) {
    return prisma.submission.findUnique({ where: { id } });
  },

  // Sitio de la definición ya vinculada a la submission (puede ser null si
  // nunca matcheó ninguna) — usado para autorizar el reproceso.
  findSubmissionSite(id: string) {
    return prisma.submission.findUnique({
      where: { id },
      select: { surveyDefinition: { select: { siteId: true } } },
    });
  },

  // La definición activa para un formID = la versión más alta configurada,
  // con sus preguntas y los pesos (reglas de ponderación).
  findActiveDefinition(jotformFormId: string) {
    return prisma.surveyDefinition.findFirst({
      where: { jotformFormId },
      orderBy: { version: "desc" },
      include: { questions: { include: { weight: true } } },
    });
  },

  listPending(scope?: SurveyScope) {
    const definition = scopeToDefinitionWhere(scope);
    return prisma.submission.findMany({
      where: {
        status: "PENDIENTE_CONFIGURACION",
        ...(definition ? { surveyDefinition: definition } : {}),
      },
      orderBy: { receivedAt: "asc" },
    });
  },

  // Listado con filtros (grupo, encuesta, sitio, tipo, escuela, pre/post,
  // status, rango de fecha) + paginación. `scope` acota el alcance del
  // usuario (undefined = sin restricción).
  listSubmissions(filters: SurveyFilters, scope?: SurveyScope) {
    const where: Prisma.SubmissionWhereInput = {};
    if (filters.status) where.status = filters.status;
    if (filters.surveyDefinitionId) where.surveyDefinitionId = filters.surveyDefinitionId;
    if (filters.isPre !== undefined) where.isPre = filters.isPre;
    const participant: Prisma.ParticipantWhereInput = {};
    if (filters.groupName) participant.groupName = filters.groupName;
    if (filters.school) participant.school = filters.school;
    if (Object.keys(participant).length) where.participant = participant;
    const definition: Prisma.SurveyDefinitionWhereInput = {};
    if (filters.siteId) definition.siteId = filters.siteId;
    else if (scope?.siteIds) definition.siteId = { in: scope.siteIds };
    if (filters.type) definition.type = filters.type;
    if (scope?.excludedSurveyDefinitionIds?.length) definition.id = { notIn: scope.excludedSurveyDefinitionIds };
    if (Object.keys(definition).length) where.surveyDefinition = definition;
    if (filters.from || filters.to) {
      const receivedAt: Prisma.DateTimeFilter = {};
      if (filters.from) receivedAt.gte = new Date(filters.from);
      if (filters.to) receivedAt.lte = new Date(filters.to);
      where.receivedAt = receivedAt;
    }
    return prisma.submission.findMany({
      where,
      orderBy: { receivedAt: "desc" },
      take: filters.limit ?? 50,
      skip: filters.offset ?? 0,
      include: {
        participant: { select: { name: true, groupName: true, school: true } },
        surveyDefinition: { select: { id: true, jotformFormId: true, type: true, siteId: true } },
      },
    });
  },

  countSince(from: Date, scope?: SurveyScope) {
    const definition = scopeToDefinitionWhere(scope);
    return prisma.submission.count({
      where: {
        receivedAt: { gt: from },
        ...(definition ? { surveyDefinition: definition } : {}),
      },
    });
  },

  // Base del resumen por grupo: submissions procesadas/completadas con su
  // grupo y el número de respuestas en blanco.
  listForSummary(scope?: SurveyScope) {
    const definition = scopeToDefinitionWhere(scope);
    return prisma.submission.findMany({
      where: {
        status: { in: ["PROCESADO", "COMPLETADO"] },
        participant: { isNot: null },
        ...(definition ? { surveyDefinition: definition } : {}),
      },
      select: {
        id: true,
        isPre: true,
        status: true,
        participantId: true,
        participant: { select: { groupName: true } },
        _count: { select: { answers: { where: { value: "" } } } },
      },
    });
  },

  findGroupSubmissions(groupName: string, scope?: SurveyScope) {
    const definition = scopeToDefinitionWhere(scope);
    return prisma.submission.findMany({
      where: {
        participant: { groupName },
        status: { in: ["PROCESADO", "COMPLETADO"] },
        ...(definition ? { surveyDefinition: definition } : {}),
      },
      select: { id: true, isPre: true, status: true },
    });
  },

  markCompleted(ids: string[]) {
    return prisma.submission.updateMany({
      where: { id: { in: ids } },
      data: { status: "COMPLETADO" },
    });
  },

  // ── consultas para reportes / alcance por sitio ───────────────────────

  findScopeUser(id: string) {
    return prisma.user.findUnique({
      where: { id },
      select: { role: true, organizationId: true, excludedSiteIds: true, excludedSurveyDefinitionIds: true },
    });
  },

  completedWithResults(args: {
    scope?: SurveyScope | undefined;
    type?: "LOCAL" | "VISITING" | undefined;
    school?: string | undefined;
  }) {
    const where: Prisma.SubmissionWhereInput = { status: "COMPLETADO" };
    const definition: Prisma.SurveyDefinitionWhereInput = {};
    if (args.scope?.siteIds) definition.siteId = { in: args.scope.siteIds };
    if (args.scope?.excludedSurveyDefinitionIds?.length) definition.id = { notIn: args.scope.excludedSurveyDefinitionIds };
    if (args.type) definition.type = args.type;
    if (Object.keys(definition).length) where.surveyDefinition = definition;
    if (args.school) where.participant = { school: args.school };
    return prisma.submission.findMany({
      where,
      select: {
        id: true,
        results: {
          select: {
            category: true,
            subcategory: true,
            calculatedScore: true,
            maxPossible: true,
            isPrePost: true,
          },
        },
      },
    });
  },

  async reportFilterOptions(siteIds: string[] | undefined, organizationId?: string | null) {
    const [sites, schools, categories] = await Promise.all([
      prisma.site.findMany({
        where: siteIds ? { id: { in: siteIds } } : {},
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.participant.findMany({
        where: { school: { not: null } },
        distinct: ["school"],
        select: { school: true },
        orderBy: { school: "asc" },
      }),
      prisma.category.findMany({
        where: organizationId ? { organizationId } : {},
        orderBy: [{ name: "asc" }, { subcategory: "asc" }],
        select: { name: true, subcategory: true },
      }),
    ]);
    return {
      sites,
      schools: schools.map((s) => s.school).filter((s): s is string => s !== null),
      categories,
    };
  },

  async listDefinitions(scope?: SurveyScope) {
    const defs = await prisma.surveyDefinition.findMany({
      where: scopeToDefinitionWhere(scope) ?? {},
      orderBy: [{ jotformFormId: "asc" }, { version: "desc" }],
      select: { id: true, jotformFormId: true, type: true, version: true, site: { select: { organizationId: true } } },
    });
    if (defs.length === 0) return [];

    // JotformForm.title es un caché aparte (GET /user/forms), unido acá por
    // jotformFormId para que el frontend muestre un nombre, no el id crudo.
    const forms = await prisma.jotformForm.findMany({
      where: { id: { in: [...new Set(defs.map((d) => d.jotformFormId))] } },
      select: { id: true, title: true },
    });
    const titleByFormId = new Map(forms.map((f) => [f.id, f.title]));

    return defs.map((d) => ({
      id: d.id,
      jotformFormId: d.jotformFormId,
      type: d.type,
      version: d.version,
      title: titleByFormId.get(d.jotformFormId) ?? `${d.jotformFormId} (v${d.version})`,
      organizationId: d.site.organizationId,
    }));
  },

  findDefinition(id: string) {
    return prisma.surveyDefinition.findUnique({ where: { id } });
  },

  // Sitio de una definición — usado para autorizar mutaciones de ponderación.
  findDefinitionSite(id: string) {
    return prisma.surveyDefinition.findUnique({ where: { id }, select: { siteId: true } });
  },

  // Sitio de la definición dueña de una pregunta — idem, para setWeight/analyze.
  findQuestionSite(questionId: string) {
    return prisma.question.findUnique({
      where: { id: questionId },
      select: { surveyDefinition: { select: { siteId: true } } },
    });
  },

  async distinctGroups() {
    const rows = await prisma.participant.findMany({
      where: { groupName: { not: null } },
      distinct: ["groupName"],
      select: { groupName: true },
      orderBy: { groupName: "asc" },
    });
    return rows.map((r) => r.groupName).filter((g): g is string => g !== null);
  },

  getDefinitionQuestions(surveyDefinitionId: string, scope?: SurveyScope) {
    const definition = scopeToDefinitionWhere(scope);
    return prisma.question.findMany({
      where: {
        surveyDefinitionId,
        ...(definition ? { surveyDefinition: definition } : {}),
      },
      orderBy: { externalId: "asc" },
      include: { weight: true, insight: true },
    });
  },

  findQuestion(id: string) {
    return prisma.question.findUnique({ where: { id } });
  },

  upsertWeight(questionId: string, data: WeightInput) {
    return prisma.weight.upsert({
      where: { questionId },
      create: { questionId, ...data },
      update: data,
    });
  },

  getQuestionWithAnswers(questionId: string) {
    return prisma.question.findUnique({
      where: { id: questionId },
      include: { answers: { select: { value: true } }, insight: { select: { summary: true } } },
    });
  },

  upsertInsight(questionId: string, data: { summary: string; bestAnswers: Prisma.InputJsonValue; model: string }) {
    return prisma.questionInsight.upsert({
      where: { questionId },
      create: { questionId, ...data },
      update: { ...data, generatedAt: new Date() },
    });
  },

  // Submissions PENDIENTE_CONFIGURACION que nunca matchearon ninguna
  // SurveyDefinition — el crudo es la única fuente para saber qué formID es
  // y qué campos trae, hasta que un admin lo asocie.
  listUnassignedSubmissions() {
    return prisma.submission.findMany({
      where: { status: "PENDIENTE_CONFIGURACION", surveyDefinitionId: null },
      select: { id: true, rawJsonData: true, receivedAt: true },
      orderBy: { receivedAt: "asc" },
    });
  },

  createDefinitionWithQuestions(data: {
    siteId: string;
    jotformFormId: string;
    type: "LOCAL" | "VISITING";
    questions: { externalId: string; text: string; type: QuestionType; options: string[] }[];
  }) {
    return prisma.surveyDefinition.create({
      data: {
        siteId: data.siteId,
        jotformFormId: data.jotformFormId,
        type: data.type,
        questions: { create: data.questions },
      },
    });
  },

  updateQuestion(id: string, data: { text?: string | undefined; type?: QuestionType | undefined }) {
    const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
    return prisma.question.update({ where: { id }, data: clean });
  },

  // Submissions de una definición que quedaron sin procesar correctamente —
  // candidatas a reprocesar en bloque tras completar la configuración.
  listPendingOrErrorForDefinition(surveyDefinitionId: string) {
    return prisma.submission.findMany({
      where: { surveyDefinitionId, status: { in: ["PENDIENTE_CONFIGURACION", "ERROR"] } },
      select: { id: true },
    });
  },

  // ¿Ya existe una respuesta procesada del mismo participante, para la misma
  // encuesta y el mismo momento (pre/post)? Señal de posible duplicado.
  findProcessedSibling(args: {
    participantId: string;
    surveyDefinitionId: string;
    isPre: boolean | null;
    excludeSubmissionId: string;
  }) {
    return prisma.submission.findFirst({
      where: {
        id: { not: args.excludeSubmissionId },
        participantId: args.participantId,
        surveyDefinitionId: args.surveyDefinitionId,
        isPre: args.isPre,
        status: { in: ["PROCESADO", "COMPLETADO"] },
      },
      select: { id: true },
    });
  },

  // ── catálogo de formularios de Jotform (GET /user/forms cacheado) ────

  listJotformForms() {
    return prisma.jotformForm.findMany({ orderBy: { title: "asc" } });
  },

  // Upsert en bloque + diff: qué ids son nuevos frente a lo ya guardado.
  async upsertJotformForms(forms: { id: string; title: string; status: string }[]) {
    const existingIds = new Set(
      (await prisma.jotformForm.findMany({ select: { id: true } })).map((f) => f.id)
    );
    if (forms.length > 0) {
      await prisma.$transaction(
        forms.map((f) =>
          prisma.jotformForm.upsert({
            where: { id: f.id },
            create: { id: f.id, title: f.title, status: f.status },
            update: { title: f.title, status: f.status },
          })
        )
      );
    }
    return { added: forms.filter((f) => !existingIds.has(f.id)).map((f) => f.id), total: forms.length };
  },

  // formIDs que ya tienen al menos una SurveyDefinition — para marcar en el
  // catálogo cuáles ya están dados de alta.
  async registeredJotformFormIds(): Promise<Set<string>> {
    const rows = await prisma.surveyDefinition.findMany({
      distinct: ["jotformFormId"],
      select: { jotformFormId: true },
    });
    return new Set(rows.map((r) => r.jotformFormId));
  },
};

// ── catálogo de campos-dimensión (CATALOG_DATA: Grupo/Grado/...) ───────

export const catalogFieldsRepository = {
  list() {
    return prisma.catalogField.findMany({ orderBy: { label: "asc" } });
  },

  // Combina (dedup) las opciones nuevas con las ya guardadas — distintos
  // formularios pueden compartir la misma pregunta de catálogo.
  async upsertMatches(matches: { key: string; label: string; options: string[] }[]) {
    for (const m of matches) {
      const existing = await prisma.catalogField.findUnique({ where: { key: m.key } });
      const options = [...new Set([...(existing?.options ?? []), ...m.options])];
      await prisma.catalogField.upsert({
        where: { key: m.key },
        create: { key: m.key, label: m.label, options },
        update: { label: m.label, options },
      });
    }
  },
};

/** Escribe answers + resultados y marca PROCESADO en una sola transacción. */
export function persistResults(args: {
  submissionId: string;
  surveyDefinitionId: string;
  participantId: string | undefined;
  isDuplicate: boolean;
  answers: { questionId: string; value: string }[];
  results: { category: string; subcategory: string | null; calculatedScore: number; maxPossible: number; isPrePost: boolean }[];
}) {
  const submissionData: Prisma.SubmissionUncheckedUpdateInput = {
    status: "PROCESADO",
    surveyDefinitionId: args.surveyDefinitionId,
    processingError: null,
    isDuplicate: args.isDuplicate,
    processedAt: new Date(),
  };
  if (args.participantId) submissionData.participantId = args.participantId;

  return prisma.$transaction([
    // Reprocesar es idempotente: limpiamos derivados previos.
    prisma.answer.deleteMany({ where: { submissionId: args.submissionId } }),
    prisma.aggregatedResult.deleteMany({ where: { submissionId: args.submissionId } }),
    prisma.answer.createMany({
      data: args.answers.map((a) => ({ submissionId: args.submissionId, ...a })),
    }),
    prisma.aggregatedResult.createMany({
      data: args.results.map((r) => ({ submissionId: args.submissionId, ...r })),
    }),
    prisma.submission.update({
      where: { id: args.submissionId },
      data: submissionData,
    }),
  ]);
}

// surveyDefinitionId se persiste cuando SÍ hubo match (solo faltan pesos);
// se deja null cuando el formID no está registrado — así el listado de
// "instrumentos sin configurar" puede distinguir un caso del otro.
export function markPending(submissionId: string, surveyDefinitionId?: string) {
  return prisma.submission.update({
    where: { id: submissionId },
    data: {
      status: "PENDIENTE_CONFIGURACION",
      processingError: null,
      ...(surveyDefinitionId ? { surveyDefinitionId } : {}),
    },
  });
}

export function markError(submissionId: string, message: string) {
  return prisma.submission.update({
    where: { id: submissionId },
    data: { status: "ERROR", processingError: message.slice(0, 2000) },
  });
}
