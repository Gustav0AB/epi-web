import { createHash } from "node:crypto";
import { resolveSurveyMoment } from "./survey-moment.js";
import { JotformPayloadSchema } from "./surveys.schema.js";
import { OptionLabelsSchema, type SurveyFilterField } from "@epi/shared";
import type { MappedQuestion } from "./jotform-questions.js";
import { prisma } from "../../db/prisma.js";
import { Prisma, type QuestionType, type SurveyMoment } from "@prisma/client";
import type { JotformFormDto, JotformFormsQuery, SurveyFilters, WeightInput } from "@epi/shared";

// Sitios asignados y encuestas puntuales excluidas. Para siteIds,
// undefined = acceso global; [] = ningún sitio permitido.
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
  schoolCatalogRows(scope: SurveyScope) {
    return prisma.submission.findMany({
      where: { surveyDefinition: { is: scopeToDefinitionWhere(scope) ?? {} } },
      select: { id: true, reviewSchool: true, rawJsonData: true, surveyDefinition: { select: { site: { select: { id: true, name: true } } } } },
      orderBy: { id: "asc" },
    });
  },
  // Idempotente: reenvíos del mismo webhook no duplican la submission.
  upsertSubmission(
    jotformSubmissionId: string,
    rawJsonData: Prisma.InputJsonValue,
    isPre: boolean | null,
    surveyMoment: SurveyMoment,
    receivedAt?: Date
  ) {
    return prisma.submission.upsert({
      where: { jotformSubmissionId },
      create: { jotformSubmissionId, rawJsonData, isPre, surveyMoment, ...(receivedAt ? { receivedAt } : {}) },
      update: { contextRevision: { increment: 1 }, rawJsonData, isPre, surveyMoment, ...(receivedAt ? { receivedAt } : {}) },
    });
  },

  async existingSubmissionIds(ids: string[]) {
    const rows = await prisma.submission.findMany({
      where: { jotformSubmissionId: { in: ids } },
      select: { jotformSubmissionId: true },
    });
    return new Set(rows.map((r) => r.jotformSubmissionId));
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
      select: { id: true, instrumentKind: true, timeZone: true, configurationVersion: true, categoryWeights: true, subcategoryWeights: true, analysisWeights: true, questions: { include: { weight: true } } },
    });
  },

  findDefinitionForProcessing(id: string) {
    return prisma.surveyDefinition.findUnique({ where: { id }, select: { id: true, instrumentKind: true, timeZone: true, configurationVersion: true, categoryWeights: true, subcategoryWeights: true, analysisWeights: true, questions: { include: { weight: true } } } });
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
    if (filters.questionId && filters.answerValue !== undefined) where.answers = { some: { questionId: filters.questionId, value: filters.answerValue, question: { OR: [{ isFilter: true }, { role: "FILTER" }] } } };
    if (filters.surveyDefinitionId) where.surveyDefinitionId = filters.surveyDefinitionId;
    if (filters.isPre !== undefined) where.isPre = filters.isPre;
    if (filters.surveyMoment) where.surveyMoment = filters.surveyMoment;
    const participant: Prisma.ParticipantWhereInput = {};
    if (filters.groupName) participant.groupName = filters.groupName;
    if (filters.school) participant.school = filters.school;
    if (Object.keys(participant).length) where.participant = participant;
    const definition: Prisma.SurveyDefinitionWhereInput = {};
    if (filters.siteId) definition.siteId = scope?.siteIds ? { in: scope.siteIds.filter((id) => id === filters.siteId) } : filters.siteId;
    else if (scope?.siteIds) definition.siteId = { in: scope.siteIds };
    if (filters.type) definition.type = filters.type;
    if (scope?.excludedSurveyDefinitionIds?.length) definition.id = { notIn: scope.excludedSurveyDefinitionIds };
    if (filters.weightedOnly) {
      definition.questions = { every: { OR: [{ role: { in: ["INFORMATIONAL", "IDENTIFIER", "MOMENT", "FILTER", "SCHOOL_GROUP", "ACTIVITY", "GENDER", "AGE", "EXCLUDED"] } }, { type: "OPEN_TEXT" }, { weight: { isNot: null } }] } };
    }
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
    const definition = scopeToDefinitionWhere(scope) ?? {};
    definition.questions = { every: { OR: [{ role: { in: ["INFORMATIONAL", "IDENTIFIER", "MOMENT", "FILTER", "SCHOOL_GROUP", "ACTIVITY", "GENDER", "AGE", "EXCLUDED"] } }, { type: "OPEN_TEXT" }, { weight: { isNot: null } }] } };
    return prisma.submission.findMany({
      where: {
        reviewExcluded: false,
        status: { in: ["PROCESADO", "COMPLETADO"] },
        participant: { isNot: null },
        surveyDefinition: definition,
      },
      select: {
        id: true,
        isPre: true,
        surveyMoment: true,
        status: true,
        participantId: true,
        participant: { select: { groupName: true } },
        _count: { select: { answers: { where: { value: "" } } } },
      },
    });
  },

  findGroupSubmissions(groupName: string, scope?: SurveyScope) {
    const definition = scopeToDefinitionWhere(scope) ?? {};
    definition.questions = { every: { OR: [{ role: { in: ["INFORMATIONAL", "IDENTIFIER", "MOMENT", "FILTER", "SCHOOL_GROUP", "ACTIVITY", "GENDER", "AGE", "EXCLUDED"] } }, { type: "OPEN_TEXT" }, { weight: { isNot: null } }] } };
    return prisma.submission.findMany({
      where: {
        participant: { groupName },
        reviewExcluded: false,
        status: { in: ["PROCESADO", "COMPLETADO"] },
        surveyDefinition: definition,
      },
      select: { id: true, isPre: true, surveyMoment: true, status: true },
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
      select: { role: true, organizationId: true, siteIds: true, excludedSurveyDefinitionIds: true },
    });
  },

  completedWithResults(args: {
    scope?: SurveyScope | undefined;
    surveyDefinitionId?: string | undefined;
    type?: "LOCAL" | "VISITING" | "OTHER" | undefined;
    school?: string | undefined;
    groupName?: string | undefined;
    from?: string | undefined;
    to?: string | undefined;
  }) {
    const where: Prisma.SubmissionWhereInput = { reviewExcluded: false, status: "COMPLETADO", surveyMoment: { in: ["PRE", "POST"] } };
    const definition = scopeToDefinitionWhere(args.scope) ?? {};
    if (args.surveyDefinitionId) definition.AND = [{ id: args.surveyDefinitionId }];
    if (args.type) definition.type = args.type;
    if (Object.keys(definition).length) where.surveyDefinition = definition;
    if (args.school || args.groupName) where.participant = { ...(args.school ? { school: args.school } : {}), ...(args.groupName ? { groupName: args.groupName } : {}) };
    if (args.from || args.to) {
      where.receivedAt = {
        ...(args.from ? { gte: new Date(args.from) } : {}),
        ...(args.to ? { lte: new Date(args.to) } : {}),
      };
    }
    return prisma.submission.findMany({
      where,
      select: {
        id: true,
        participantId: true,
        surveyDefinitionId: true,
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

  completedWithAnswers(args: {
    submissionIds?: string[] | undefined;
    scope?: SurveyScope | undefined;
    surveyDefinitionId?: string | undefined;
    type?: "LOCAL" | "VISITING" | "OTHER" | undefined;
    school?: string | undefined;
    from?: string | undefined;
    to?: string | undefined;
  }, db: Prisma.TransactionClient = prisma) {
    const definition = scopeToDefinitionWhere(args.scope) ?? {};
    if (args.surveyDefinitionId) definition.AND = [{ id: args.surveyDefinitionId }];
    if (args.type) definition.type = args.type;
    const where: Prisma.SubmissionWhereInput = {
      ...(args.submissionIds ? { id: { in: args.submissionIds } } : {}),
      reviewExcluded: false,
      status: "COMPLETADO",
      surveyMoment: { in: ["PRE", "POST"] },
      ...(Object.keys(definition).length ? { surveyDefinition: definition } : {}),
      ...(args.school ? { participant: { school: args.school } } : {}),
      ...(args.from || args.to ? { receivedAt: { ...(args.from ? { gte: new Date(args.from) } : {}), ...(args.to ? { lte: new Date(args.to) } : {}) } } : {}),
    };
    return db.submission.findMany({
      where,
      select: {
        id: true,
        surveyMoment: true,
        answers: { where: { value: { not: "" } }, select: { questionId: true, value: true, question: { select: { id: true, text: true, type: true, role: true, weight: true } } } },
      },
    });
  },

  setSubmissionMoment(id: string, moment: "PRE" | "POST" | "POST_POST" | "CQS" | null, userId: string, scope: SurveyScope, expectedRevision?: number) {
    return prisma.$transaction(async (tx) => {
      const submission = await tx.submission.findFirst({ where: { id, surveyDefinition: scopeToDefinitionWhere(scope) ?? {} }, include: { surveyDefinition: { select: { questions: { select: { externalId: true, role: true, momentMappings: true } } } } } });
      if (!submission) throw Object.assign(new Error("Submission not found in your accessible surveys"), { statusCode: 404 });
      if (submission.surveyDefinitionId) await tx.$queryRaw`SELECT "id" FROM "survey_definitions" WHERE "id" = ${submission.surveyDefinitionId} FOR UPDATE`;
      const membership = await tx.courseMembership.findUnique({ where: { submissionId: id }, include: { application: { include: { course: true } } } });
      if (membership?.application.course.status === "COMPLETED") throw Object.assign(new Error("El curso está completado"), { statusCode: 409 });
      let effectiveMoment: SurveyMoment;
      if (moment !== null) effectiveMoment = moment;
      else {
        const payload = JotformPayloadSchema.safeParse(submission.rawJsonData);
        if (!payload.success) throw Object.assign(new Error("Original submission cannot be interpreted"), { statusCode: 400 });
        effectiveMoment = resolveSurveyMoment(payload.data, submission.surveyDefinition?.questions ?? []);
      }
      if (membership?.application.course.status === "REVIEWED" && effectiveMoment !== "PRE" && effectiveMoment !== "POST") throw Object.assign(new Error("El curso de aprendizaje requiere Pre o Post"), { statusCode: 400 });
      const sibling = submission.participantId && submission.surveyDefinitionId ? await tx.submission.findFirst({ where: {
        id: { not: id }, participantId: submission.participantId, surveyDefinitionId: submission.surveyDefinitionId,
        surveyMoment: effectiveMoment, reviewExcluded: false, status: { in: ["PROCESADO", "COMPLETADO"] },
      }, select: { id: true } }) : null;
      const changed = await tx.submission.updateMany({ where: { id, contextRevision: expectedRevision ?? submission.contextRevision }, data: {
        contextRevision: { increment: 1 }, reviewMoment: moment, surveyMoment: effectiveMoment, isPre: effectiveMoment === "PRE" ? true : effectiveMoment === "POST" ? false : null,
        reviewedBy: userId, reviewedAt: new Date(), isDuplicate: Boolean(sibling),
      } });
      if (!changed.count) throw Object.assign(new Error("La revisión cambió; recarga antes de guardar"), { statusCode: 409 });
      const actor = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      await tx.auditLog.create({ data: { actorId: actor.id, actorUsername: actor.username, actorRole: actor.role, actorOrganizationId: actor.organizationId, action: "SUBMISSION_MOMENT_REVIEW", targetType: "Submission", targetId: id, metadata: { previous: submission.surveyMoment, moment: effectiveMoment } } });
      await tx.aggregatedResult.updateMany({ where: { submissionId: id }, data: { isPrePost: effectiveMoment === "PRE" } });
      if (membership?.application.course.status === "REVIEWED") {
        const previous = membership.application;
        const contextKey = createHash("sha256").update(JSON.stringify([previous.definitionId, previous.date, effectiveMoment])).digest("hex");
        const application = await tx.courseApplication.upsert({ where: { courseId_contextKey: { courseId: previous.courseId, contextKey } }, create: { courseId: previous.courseId, definitionId: previous.definitionId, date: previous.date, moment: effectiveMoment, contextKey }, update: {} });
        await tx.courseMembership.update({ where: { submissionId: id }, data: { applicationId: application.id, contextRevision: submission.contextRevision + 1 } });
        await tx.courseEdition.update({ where: { id: previous.courseId }, data: { revision: { increment: 1 } } });
      }
    });
  },

  setSubmissionExclusion(id: string, excluded: boolean, userId: string, scope: SurveyScope, expectedRevision?: number) {
    return prisma.$transaction(async tx => {
      const where = { id, surveyDefinition: scopeToDefinitionWhere(scope) ?? {} };
      const previous = await tx.submission.findFirst({ where });
      if (!previous) return { count: 0 };
      await assertSubmissionCourseEditable(tx, id);
      const changed = await tx.submission.updateMany({ where: { ...where, contextRevision: expectedRevision ?? previous.contextRevision }, data: { reviewExcluded: excluded, contextRevision: { increment: 1 }, reviewedBy: userId, reviewedAt: new Date() } });
      if (!changed.count) throw Object.assign(new Error("La revisión cambió; recarga antes de guardar"), { statusCode: 409 });
      const actor = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      await tx.auditLog.create({ data: { actorId: actor.id, actorUsername: actor.username, actorRole: actor.role, actorOrganizationId: actor.organizationId, action: "SUBMISSION_EXCLUSION_REVIEW", targetType: "Submission", targetId: id, metadata: { previous: previous.reviewExcluded, excluded } } });
      return changed;
    });
  },

  courseSubmissionDetails(ids: string[], scope: SurveyScope) {
    return prisma.submission.findMany({
      where: { id: { in: ids }, surveyDefinition: scopeToDefinitionWhere(scope) ?? {} },
      orderBy: [{ receivedAt: "desc" }, { id: "asc" }],
      select: { reviewGender: true, reviewAge: true, reviewActivity: true, reviewSchool: true, reviewDate: true, contextRevision: true, rawJsonData: true, id: true, jotformSubmissionId: true, receivedAt: true, surveyMoment: true, status: true, processingError: true, isDuplicate: true, reviewExcluded: true, reviewMoment: true,
        participant: { select: { name: true } }, surveyDefinition: { select: { configurationVersion: true } },
        answers: { orderBy: { questionId: "asc" }, select: { questionId: true, value: true, question: { select: { text: true } } } },
      },
    });
  },

  courseExpectations(keys: { siteId: string; school: string; date: string }[]) {
    return keys.length ? prisma.courseExpectation.findMany({ where: { OR: keys } }) : Promise.resolve([]);
  },

  async saveCourseExpectation(input: { siteId: string; school: string; date: string; expectedParticipants: number | null }, userId: string) {
    const { expectedParticipants, ...key } = input;
    if (expectedParticipants === null) await prisma.courseExpectation.deleteMany({ where: key });
    else await prisma.courseExpectation.upsert({ where: { siteId_school_date: key }, create: { ...key, expectedParticipants, updatedBy: userId }, update: { expectedParticipants, updatedBy: userId } });
  },

  groupSearchRows(args: { questionId?: string | undefined; answerValue?: string | undefined; includeUnprocessed?: boolean; includeContext?: boolean; siteId?: string | undefined; surveyDefinitionId?: string | undefined; scope?: SurveyScope | undefined; from?: string | undefined; to?: string | undefined }, db: Prisma.TransactionClient = prisma) {
    const definition = scopeToDefinitionWhere(args.scope) ?? {};
    const where: Prisma.SubmissionWhereInput = {
      ...(args.includeUnprocessed ? {} : { status: { in: ["PROCESADO", "COMPLETADO"] as const } }),
      surveyDefinition: { AND: [definition, ...(args.siteId ? [{ siteId: args.siteId }] : []), ...(args.surveyDefinitionId ? [{ id: args.surveyDefinitionId }] : [])] },
    };
    if (args.questionId && args.answerValue !== undefined) where.answers = { some: {
      questionId: args.questionId, value: args.answerValue, question: { OR: [{ isFilter: true }, { role: "FILTER" }] },
    } };
    if (args.from || args.to) {
      const receivedAt = {
        ...(args.from ? { gte: new Date(args.from) } : {}),
        // Include the entire UTC end date, including fractional seconds.
        ...(args.to ? { lt: new Date(new Date(args.to).getTime() + 86_400_000) } : {}),
      };
      // shortcut: effective dates live in source JSON; filter versioned rows in the service until indexed.
      if (args.includeContext) where.OR = [{ receivedAt }, { surveyDefinition: { configurationVersion: 4 } }];
      else where.receivedAt = receivedAt;
    }
    return db.submission.findMany({
      where,
      orderBy: { receivedAt: "desc" },
      select: {
        id: true,
        reviewExcluded: true,
        status: true,
        receivedAt: true,
        surveyMoment: true,
        participantId: true,
        surveyDefinition: { select: { id: true, siteId: true, activityName: true, configurationVersion: true } },
        ...(args.includeContext ? { rawJsonData: true, reviewSchool: true, reviewDate: true, processingError: true } : {}),
        courseMembership: { select: { application: { select: { course: { select: { id: true, status: true, name: true, expectedParticipants: true } } } } } },
        participant: { select: { school: true } },
        results: {
          select: {
            calculatedScore: true,
            maxPossible: true,
          },
        },
      },
    });
  },

  async reportFilterOptions(scope: SurveyScope) {
    const { siteIds, organizationId } = scope;
    const [sites, schools, categories] = await Promise.all([
      prisma.site.findMany({
        where: siteIds ? { id: { in: siteIds } } : {},
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.participant.findMany({
        where: { school: { not: null }, submissions: { some: { surveyDefinition: scopeToDefinitionWhere(scope) ?? {} } } },
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
      schools: schools.map((s) => s.school).filter((s): s is string => s !== null && s.trim().length > 0),
      categories,
    };
  },

  async listDefinitions(scope?: SurveyScope) {
    const defs = await prisma.surveyDefinition.findMany({
      where: scopeToDefinitionWhere(scope) ?? {},
      orderBy: [{ jotformFormId: "asc" }, { version: "desc" }],
      select: {
        id: true,
        siteId: true,
        jotformFormId: true,
        type: true,
        version: true,
        openQuestionsSummary: true,
        instrumentKind: true,
        configurationVersion: true,
        site: { select: { organizationId: true } },
        questions: { select: { type: true, role: true, weight: { select: { id: true } } } },
      },
    });
    if (defs.length === 0) return [];

    // JotformForm.title es un caché aparte (GET /user/forms), unido acá por
    // jotformFormId para que el frontend muestre un nombre, no el id crudo.
    const forms = await prisma.jotformForm.findMany({
      where: { id: { in: [...new Set(defs.map((d) => d.jotformFormId))] } },
      select: { id: true, title: true, account: { select: { name: true } } },
    });
    const titleByFormId = new Map(forms.map((f) => [f.id, f.title]));
    const accountByFormId = new Map(forms.map((f) => [f.id, f.account?.name ?? null]));

    return defs.map((d) => ({
      id: d.id,
      siteId: d.siteId,
      jotformFormId: d.jotformFormId,
      type: d.type,
      version: d.version,
      title: titleByFormId.get(d.jotformFormId) ?? `${d.jotformFormId} (v${d.version})`,
      organizationId: d.site.organizationId,
      instrumentKind: d.instrumentKind,
      configurationVersion: d.configurationVersion,
      accountName: accountByFormId.get(d.jotformFormId) ?? null,
      isWeighted: d.questions.every((q) => (q.role ?? "SCORED") !== "SCORED" || q.type === "OPEN_TEXT" || q.weight !== null),
      openQuestionsSummary: d.openQuestionsSummary,
    }));
  },

  findDefinition(id: string) {
    return prisma.surveyDefinition.findUnique({ where: { id } });
  },

  async listDefinitionsForHistorical(ids: string[], scope?: SurveyScope) {
    const defs = await prisma.surveyDefinition.findMany({
      where: { id: { in: ids }, ...(scopeToDefinitionWhere(scope) ?? {}) },
      select: { id: true, jotformFormId: true },
    });
    const forms = await prisma.jotformForm.findMany({
      where: { id: { in: [...new Set(defs.map((d) => d.jotformFormId))] } },
      select: { id: true, title: true, account: { select: { apiKey: true } } },
    });
    const formById = new Map(forms.map((f) => [f.id, f]));
    return defs.map((d) => ({
      ...d,
      formTitle: formById.get(d.jotformFormId)?.title ?? d.jotformFormId,
      apiKey: formById.get(d.jotformFormId)?.account?.apiKey ?? null,
    }));
  },

  // Sitio de una definición — usado para autorizar mutaciones de ponderación.
  findDefinitionSite(id: string) {
    return prisma.surveyDefinition.findUnique({ where: { id }, select: { siteId: true } });
  },

  updateOpenQuestionsSummary(id: string, summary: string) {
    return prisma.surveyDefinition.update({
      where: { id },
      data: { openQuestionsSummary: summary },
      select: { openQuestionsSummary: true },
    });
  },

  async distinctGroups(scope: SurveyScope) {
    const rows = await prisma.participant.findMany({
      where: { groupName: { not: null }, submissions: { some: { surveyDefinition: scopeToDefinitionWhere(scope) ?? {} } } },
      distinct: ["groupName"],
      select: { groupName: true },
      orderBy: { groupName: "asc" },
    });
    return rows.map((r) => r.groupName).filter((g): g is string => g !== null);
  },

  async getDefinitionQuestions(surveyDefinitionId: string, scope?: SurveyScope) {
    const definition = scopeToDefinitionWhere(scope);
    const questions = await prisma.question.findMany({
      where: {
        surveyDefinitionId,
        ...(definition ? { surveyDefinition: definition } : {}),
      },
      orderBy: { externalId: "asc" },
      include: { weight: true, answers: { select: { value: true } } },
    });
    return questions.map(({ answers, ...question }) => ({
      ...question,
      answers: answers.map(({ value }) => value).filter(Boolean),
    }));
  },

  updateSubmissionMoment(id: string, surveyMoment: SurveyMoment, isPre: boolean | null, contextRevision: number) {
    return prisma.submission.updateMany({ where: { id, contextRevision }, data: { surveyMoment, isPre } });
  },

  definitionSourceContract(id: string, scope: SurveyScope) {
    return prisma.surveyDefinition.findFirst({ where: { AND: [{ id }, scopeToDefinitionWhere(scope) ?? {}] }, select: { id: true, version: true, jotformFormId: true, sourceContract: true } });
  },

  async getDefinitionFilters(surveyDefinitionId: string, scope: SurveyScope): Promise<SurveyFilterField[]> {
    const questions = await prisma.question.findMany({
      where: { surveyDefinitionId, OR: [{ isFilter: true }, { role: "FILTER" }], surveyDefinition: scopeToDefinitionWhere(scope) ?? {} },
      select: { id: true, text: true, options: true, optionLabels: true },
      orderBy: { externalId: "asc" },
    });
    return questions.map((question) => {
      const labels = OptionLabelsSchema.parse(question.optionLabels);
      return { id: question.id, label: question.text, options: question.options.map((value) => ({ value, label: labels.find((item) => item.value === value)?.label ?? value })) };
    });
  },

  findQuestion(id: string) {
    return prisma.question.findUnique({ where: { id } });
  },

  findQuestionSite(questionId: string) {
    return prisma.question.findUnique({
      where: { id: questionId },
      select: { surveyDefinition: { select: { siteId: true } } },
    });
  },

  upsertWeight(questionId: string, data: WeightInput) {
    const { factor, ...values } = data;
    return prisma.weight.upsert({
      where: { questionId },
      create: { questionId, ...values, factor: factor ?? 1 },
      update: { ...values, ...(factor === undefined ? {} : { factor }) },
    });
  },

  deleteWeight(questionId: string) {
    return prisma.weight.deleteMany({ where: { questionId } });
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
    type: "LOCAL" | "VISITING" | "OTHER";
    questions: MappedQuestion[];
    sourceConditions?: string;
    sourceContract?: Prisma.InputJsonValue;
    setup?: { activatedBy?: string; baseDefinitionId?: string | null | undefined; matrixDefaults?: Prisma.InputJsonValue | undefined; configurationVersion?: number | undefined; programName?: string | undefined; instrumentKind?: string | undefined; revision: number; instrumentName: string; activityName: string; activityType?: string | undefined; description?: string | undefined; timeZone?: string | undefined; categoryWeights?: Prisma.InputJsonValue | undefined; subcategoryWeights?: Prisma.InputJsonValue | undefined; analysisWeights?: Prisma.InputJsonValue | undefined };
  }) {
    return prisma.$transaction(async (tx) => {
      if (data.setup) {
        const updated = await tx.jotformForm.updateMany({
          where: { id: data.jotformFormId, setupRevision: data.setup.revision },
          data: { setupRevision: { increment: 1 } },
        });
        if (updated.count !== 1) throw Object.assign(new Error("Configuration changed; reopen the form before registering"), { statusCode: 409, code: "CONFLICT" });
      }
      if (!data.setup) {
        // Legacy registration must not silently discard an existing draft.
        const locked = await tx.jotformForm.updateMany({
          where: { id: data.jotformFormId, setupDraft: { equals: Prisma.DbNull } },
          data: { setupRevision: { increment: 1 } },
        });
        if (!locked.count && await tx.jotformForm.findUnique({ where: { id: data.jotformFormId }, select: { id: true } })) {
          throw Object.assign(new Error("Resume the saved draft before registering this form"), { statusCode: 409, code: "CONFLICT" });
        }
      }
      const latest = await tx.surveyDefinition.findFirst({ where: { jotformFormId: data.jotformFormId }, orderBy: { version: "desc" }, select: { id: true, version: true, siteId: true, type: true } });
      if (latest ? latest.id !== data.setup?.baseDefinitionId || latest.siteId !== data.siteId : !!data.setup?.baseDefinitionId) throw Object.assign(new Error("La versión activa cambió; reabre el borrador antes de activar"), { statusCode: 409, code: "CONFLICT" });
      const definition = await tx.surveyDefinition.create({
      data: {
        version: (latest?.version ?? 0) + 1,
        siteId: data.siteId,
        jotformFormId: data.jotformFormId,
        sourceConditions: data.sourceConditions ?? null,
        ...(data.sourceContract ? { sourceContract: data.sourceContract } : {}),
        type: data.type,
        ...(data.setup ? { configurationVersion: data.setup.configurationVersion ?? null, ...(data.setup.matrixDefaults ? { matrixDefaults: data.setup.matrixDefaults } : {}), programName: data.setup.programName || null, instrumentKind: data.setup.instrumentKind || null, instrumentName: data.setup.instrumentName, activityName: data.setup.activityName, activityType: data.setup.activityType || null, description: data.setup.description || null, timeZone: data.setup.timeZone || null, ...(data.setup.analysisWeights ? { analysisWeights: data.setup.analysisWeights } : {}), ...(data.setup.categoryWeights ? { categoryWeights: data.setup.categoryWeights } : {}), ...(data.setup.subcategoryWeights ? { subcategoryWeights: data.setup.subcategoryWeights } : {}) } : {}),
        questions: { create: data.questions.map(({ weight, visibility, sourceContext, matrixOverride, classification, analysisScoring, analysisParticipation, isFilter, externalId, text, type, role, options, momentMappings, optionLabels }) => ({ externalId, text, type, ...(role ? { role } : {}), options, momentMappings: momentMappings ?? [], optionLabels: optionLabels ?? [], matrixOverride: matrixOverride ?? false, ...(sourceContext ? { sourceContext } : {}), ...(classification != null ? { classification } : {}), ...(analysisScoring != null ? { analysisScoring } : {}), ...(analysisParticipation != null ? { analysisParticipation } : {}), ...(visibility ? { visibility } : {}), isFilter: isFilter ?? false, ...(weight ? { weight: { create: { ...weight, factor: weight.factor ?? 1 } } } : {}) })) },
      },
      });
      if (data.setup?.activatedBy) {
        const actor = await tx.user.findUniqueOrThrow({ where: { id: data.setup.activatedBy } });
        await tx.auditLog.create({ data: { actorId: actor.id, actorUsername: actor.username, actorRole: actor.role.toLowerCase(), actorOrganizationId: actor.organizationId, action: "SURVEY_CONFIGURATION_ACTIVATE", targetType: "SurveyDefinition", targetId: definition.id, metadata: { version: definition.version, previousDefinitionId: latest?.id ?? null, formId: data.jotformFormId } } });
      }
      return definition;
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
    surveyMoment: SurveyMoment;
    excludeSubmissionId: string;
  }) {
    return prisma.submission.findFirst({
      where: {
        id: { not: args.excludeSubmissionId },
        participantId: args.participantId,
        surveyDefinitionId: args.surveyDefinitionId,
        surveyMoment: args.surveyMoment,
        reviewExcluded: false,
        status: { in: ["PROCESADO", "COMPLETADO"] },
      },
      select: { id: true },
    });
  },

  // ── catálogo de formularios de Jotform (GET /user/forms cacheado) ────

  async listJotformForms(query: JotformFormsQuery) {
    const where: Prisma.JotformFormWhereInput = {
      ...(query.labelId ? { labelIds: { has: query.labelId } } : query.withoutLabels ? { labelIds: { isEmpty: true } } : {}),
      ...(query.accountId ? { accountId: query.accountId } : {}),
      ...(query.search ? { OR: [
        { title: { contains: query.search, mode: "insensitive" } },
        { id: { contains: query.search } },
      ] } : {}),
    };
    return prisma.$transaction(async (tx) => {
      const total = await tx.jotformForm.count({ where });
      const pageSize = 5;
      const totalPages = Math.ceil(total / pageSize);
      const page = Math.min(query.page, Math.max(1, totalPages));
      const forms = await tx.jotformForm.findMany({
        where, skip: (page - 1) * pageSize, take: pageSize,
        orderBy: [{ title: "asc" }, { id: "asc" }],
        include: { account: { select: { name: true } } },
      });
      return { forms, meta: { total, page, pageSize, totalPages } };
    }, { isolationLevel: "RepeatableRead" });
  },

  // Upsert en bloque + diff: qué ids son nuevos frente a lo ya guardado.
  async upsertJotformForms(forms: ({ id: string; title: string; status: string; labelIds?: string[]; accountId?: string | null } & Partial<Pick<JotformFormDto, "createdAt" | "updatedAt" | "submissionCount" | "lastSubmission" | "url">>)[]) {
    const existingIds = new Set(
      (await prisma.jotformForm.findMany({ select: { id: true } })).map((f) => f.id)
    );
    if (forms.length > 0) {
      await prisma.$transaction(
        forms.map((f) =>
          prisma.jotformForm.upsert({
            where: { id: f.id },
            create: { id: f.id, title: f.title, status: f.status, ...(f.createdAt !== undefined ? { createdAt: f.createdAt } : {}), ...(f.updatedAt !== undefined ? { updatedAt: f.updatedAt } : {}), ...(f.submissionCount !== undefined ? { submissionCount: f.submissionCount } : {}), ...(f.lastSubmission !== undefined ? { lastSubmission: f.lastSubmission } : {}), ...(f.url !== undefined ? { url: f.url } : {}), labelIds: f.labelIds ?? [], accountId: f.accountId ?? null },
            update: { title: f.title, status: f.status, ...(f.createdAt !== undefined ? { createdAt: f.createdAt } : {}), ...(f.updatedAt !== undefined ? { updatedAt: f.updatedAt } : {}), ...(f.submissionCount !== undefined ? { submissionCount: f.submissionCount } : {}), ...(f.lastSubmission !== undefined ? { lastSubmission: f.lastSubmission } : {}), ...(f.url !== undefined ? { url: f.url } : {}), labelIds: f.labelIds ?? [], accountId: f.accountId ?? null, syncedAt: new Date() },
          })
        )
      );
    }
    return { added: forms.filter((f) => !existingIds.has(f.id)).map((f) => f.id), total: forms.length };
  },

  // formIDs que ya tienen al menos una SurveyDefinition — para marcar en el
  // catálogo cuáles ya están dados de alta.
  async registeredJotformFormIds(formIds: string[]): Promise<Set<string>> {
    const rows = await prisma.surveyDefinition.findMany({
      where: { jotformFormId: { in: formIds } },
      distinct: ["jotformFormId"],
      select: { jotformFormId: true },
    });
    return new Set(rows.map((r) => r.jotformFormId));
  },

  listJotformAccounts() {
    return prisma.jotformAccount.findMany({ orderBy: { createdAt: "desc" } });
  },

  createJotformAccount(data: { name: string; apiKey: string }) {
    return prisma.jotformAccount.upsert({
      where: { apiKey: data.apiKey },
      create: data,
      update: { name: data.name },
    });
  },

  deleteJotformAccount(id: string) {
    return prisma.jotformAccount.delete({ where: { id } });
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
  expectedRevision?: number;
  pendingReason?: string;
  submissionId: string;
  surveyDefinitionId: string;
  participantId: string | undefined;
  isDuplicate: boolean;
  answers: { questionId: string; value: string; rawValue: Prisma.InputJsonValue | typeof Prisma.JsonNull }[];
  results: { category: string; subcategory: string | null; calculatedScore: number; maxPossible: number; isPrePost: boolean }[];
}) {
  const submissionData: Prisma.SubmissionUncheckedUpdateInput = {
    status: args.pendingReason === undefined ? "PROCESADO" : "PENDIENTE_CONFIGURACION",
    surveyDefinitionId: args.surveyDefinitionId,
    processingError: args.pendingReason ?? null,
    isDuplicate: args.isDuplicate,
    processedAt: args.pendingReason === undefined ? new Date() : null,
  };
  if (args.participantId) submissionData.participantId = args.participantId;

  return prisma.$transaction(async tx => {
    const changed = await tx.submission.updateMany({ where: { id: args.submissionId, ...(args.expectedRevision !== undefined ? { contextRevision: args.expectedRevision } : {}) }, data: submissionData });
    if (!changed.count) return false;
    await tx.answer.deleteMany({ where: { submissionId: args.submissionId } });
    await tx.aggregatedResult.deleteMany({ where: { submissionId: args.submissionId } });
    await tx.answer.createMany({ data: args.answers.map(answer => ({ submissionId: args.submissionId, ...answer })) });
    await tx.aggregatedResult.createMany({ data: args.results.map(result => ({ submissionId: args.submissionId, ...result })) });
    return true;
  });
}

// surveyDefinitionId se persiste cuando SÍ hubo match (solo faltan pesos);
// se deja null cuando el formID no está registrado — así el listado de
// "instrumentos sin configurar" puede distinguir un caso del otro.
export function markPending(submissionId: string, surveyDefinitionId?: string, reason?: string) {
  return prisma.submission.update({
    where: { id: submissionId },
    data: {
      status: "PENDIENTE_CONFIGURACION",
      processingError: reason ?? null,
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

export async function assertSubmissionCourseEditable(tx: Prisma.TransactionClient, id: string) {
  const row = await tx.submission.findUnique({ where: { id }, select: { surveyDefinitionId: true } });
  if (row?.surveyDefinitionId) await tx.$queryRaw`SELECT "id" FROM "survey_definitions" WHERE "id" = ${row.surveyDefinitionId} FOR UPDATE`;
  const membership = await tx.courseMembership.findUnique({ where: { submissionId: id }, select: { application: { select: { course: { select: { id: true, status: true } } } } } });
  if (membership?.application.course.status === "REVIEWED") await tx.courseEdition.update({ where: { id: membership.application.course.id }, data: { revision: { increment: 1 } } });
  if (membership?.application.course.status === "COMPLETED") throw Object.assign(new Error("El curso está completado"), { statusCode: 409 });
}
