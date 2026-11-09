import { selectCourseResultCategories } from "@epi/shared";
import { addCourseStandardDeviations } from "./course-standard-deviation.js";
import { z } from "zod";
import { complementaryResults } from "./complementary-results.js";
import { aggregatePublishedCourses } from "./published-report-aggregate.js";
import { aggregateCourseQuestions } from "./course-aggregation.js";
import { courseResultBases } from "./course-results.js";
import { courseResponseIssues } from "./course-context.js";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { buildCourseReportPreview, courseResponseCoverage, PublishCourseEditionSchema, type CourseReportPublication, CourseExpectationUpdateSchema, CourseReportDraftSchema, SaveCourseReportDraftSchema, type CourseReportDraftDto, AnalysisWeightsSchema, CourseResultsQuerySchema, CourseListQuerySchema, CourseResponseQuerySchema, CreateCourseEditionSchema, CourseInstrumentLinkSchema, CourseMembershipSchema, type CourseResultsDto, type CourseEditionDto, type CourseEditionDetailDto, type CourseResponseDto } from "@epi/shared";
import { prisma } from "../../db/prisma.js";
import { allowedSiteIds } from "../../shared/site-scope.js";
import { scopeToDefinitionWhere, surveysRepository } from "./surveys.repository.js";
import { schoolCatalog } from "./school-catalog.js";
import { responseGroupingContext } from "./response-context.js";

const fail = (message: string, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const normalized = (value: string | null) => value?.trim().replace(/\s+/g, " ").toLowerCase() ?? "";
const responseInclude = { surveyDefinition: { select: { id: true, siteId: true, programName: true, instrumentKind: true, version: true, instrumentName: true, activityName: true } }, courseMembership: { include: { application: true } } } satisfies Prisma.SubmissionInclude;
type ResponseRow = Prisma.SubmissionGetPayload<{ include: typeof responseInclude }>;
type Course = Prisma.CourseEditionGetPayload<{ include: { primaryDefinition: true } }>;
async function access(userId: string) {
  const actor = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const siteIds = await allowedSiteIds({ role: actor.role.toLowerCase(), organizationId: actor.organizationId, siteIds: actor.siteIds });
  return { actor, scope: { siteIds, excludedSurveyDefinitionIds: actor.excludedSurveyDefinitionIds } };
}
function courseWhere(scope: Awaited<ReturnType<typeof access>>["scope"]): Prisma.CourseEditionWhereInput {
  return { primaryDefinition: scopeToDefinitionWhere(scope) ?? {} };
}
const courseDto = (course: Course): CourseEditionDto => ({ id: course.id, siteId: course.siteId, primaryDefinitionId: course.primaryDefinitionId, name: course.name, school: course.school, activity: course.activity, expectedParticipants: course.expectedParticipants, expectedParticipantsPre: course.expectedParticipantsPre, expectedParticipantsPost: course.expectedParticipantsPost, revision: course.revision, createdAt: course.createdAt.toISOString() });
async function audit(tx: Prisma.TransactionClient, actor: Awaited<ReturnType<typeof access>>["actor"], action: string, targetId: string, metadata: Prisma.InputJsonValue) {
  await tx.auditLog.create({ data: { actorId: actor.id, actorUsername: actor.username, actorRole: actor.role, actorOrganizationId: actor.organizationId, action, targetType: "CourseEdition", targetId, metadata } });
}
async function readCourse(id: string, scope: Awaited<ReturnType<typeof access>>["scope"], tx: Prisma.TransactionClient = prisma) {
  const course = await tx.courseEdition.findFirst({ where: { id, ...courseWhere(scope) }, include: { primaryDefinition: true } });
  if (!course) throw fail("Curso no disponible en tus sitios autorizados", 404);
  return course;
}
async function lockCourse(course: Course, expectedRevision: number, tx: Prisma.TransactionClient, scope: Awaited<ReturnType<typeof access>>["scope"]) {
  await tx.$queryRaw`SELECT "id" FROM "survey_definitions" WHERE "id" = ${course.primaryDefinitionId} FOR UPDATE`;
  if (course.status === "COMPLETED") throw fail("El curso está completado", 409);
  if (!(await tx.courseEdition.updateMany({ where: { id: course.id, revision: expectedRevision, ...courseWhere(scope) }, data: { revision: { increment: 1 } } })).count) throw fail("El curso cambió; recarga antes de guardar", 409);
}
async function relations(course: Course, tx: Prisma.TransactionClient = prisma) {
  return new Set((await tx.courseComplement.findMany({ where: { courseId: course.id } })).map(item => item.definitionId));
}

function responseDto(course: Course, row: ResponseRow, allowed: Set<string>, duplicates: Set<string> = new Set()): CourseResponseDto {
  const context = responseGroupingContext(row);
  const definition = row.surveyDefinition;
  const membership = row.courseMembership;
  const issues = courseResponseIssues({ ...course, programName: course.primaryDefinition.programName }, { definitionId: row.surveyDefinitionId, siteId: definition?.siteId ?? null, programName: definition?.programName ?? null, kind: definition?.instrumentKind ?? null, moment: row.surveyMoment, excluded: row.reviewExcluded, linkedCourseId: membership?.application.courseId ?? null, context }, allowed);
  const drift = membership?.application.courseId === course.id && (membership.application.date !== context.date || membership.application.moment !== row.surveyMoment || membership.application.definitionId !== row.surveyDefinitionId);
  if (["REVIEWED", "COMPLETED"].includes(course.status) && membership?.application.courseId === course.id) {
    const schoolIssue = issues.indexOf("Revisar escuela");
    if (schoolIssue >= 0) issues.splice(schoolIssue, 1);
  }
  if (drift) issues.push("El contexto cambió después de vincular; confirma de nuevo");
  return { id: row.id, remoteId: row.jotformSubmissionId, definitionId: row.surveyDefinitionId!, instrument: definition?.instrumentName || "Instrumento sin nombre", instrumentKind: definition?.instrumentKind ?? null, version: definition?.version ?? 0, contextRevision: row.contextRevision, context, moment: row.surveyMoment, status: row.status, reviewExcluded: row.reviewExcluded, possibleDuplicate: row.isDuplicate || duplicates.has(row.responseFingerprint ?? ""), receivedAt: row.receivedAt.toISOString(), linkedCourseId: membership?.application.courseId ?? null, issues, canLink: issues.filter(issue => !issue.startsWith("El contexto cambió")).length === 0 && (!membership || !!drift) };
}
export async function listCourseEditions(input: unknown, userId: string) {
  const query = CourseListQuerySchema.parse(input); const { scope } = await access(userId);
  const yearFrom = query.year ? `${query.year}-01-01` : undefined;
  const yearTo = query.year ? `${query.year}-12-31` : undefined;
  const from = [yearFrom, query.from].filter((value): value is string => !!value).sort().at(-1);
  const to = [yearTo, query.to].filter((value): value is string => !!value).sort()[0];
  const submission: Prisma.SubmissionWhereInput = {
    reviewExcluded: false, surveyDefinition: scopeToDefinitionWhere(scope) ?? {},
    ...(query.submittedOn ? { rawJsonData: { path: ["created_at"], string_starts_with: query.submittedOn } } : {}),
  };
  const applications: Prisma.CourseApplicationWhereInput = {
    moment: { in: ["PRE", "POST"] }, definition: { AND: [scopeToDefinitionWhere(scope) ?? {}, { instrumentKind: "LEARNING" }] },
    ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    memberships: { some: { submission } },
  };
  const where: Prisma.CourseEditionWhereInput = {
    ...courseWhere(scope), ...(query.status ? { status: query.status } : {}), ...(query.siteId ? { siteId: query.siteId } : {}),
    ...(query.school ? { school: { contains: query.school, mode: "insensitive" } } : {}),
    ...(query.activity ? { activity: { contains: query.activity, mode: "insensitive" } } : {}),
    ...(from || to || query.submittedOn || query.moment ? { OR: [
      { applications: { some: applications } },
      ...(!query.from && !query.to && !query.submittedOn && !query.moment && yearFrom && yearTo
        ? [{ applications: { none: { memberships: { some: {} } } }, createdAt: { gte: new Date(yearFrom), lt: new Date(Date.parse(yearTo) + 86400000) } }] : []),
    ] } : {}),
  };
  // shortcut: sort compact application summaries in memory; use indexed course dates if the annual catalog grows.
  const found = await prisma.courseEdition.findMany({ where, include: {
    primaryDefinition: true, site: { select: { name: true } },
    applications: { where: applications, select: { date: true, moment: true, _count: { select: { memberships: { where: { submission } } } } } },
  } });
  const rows = found.map(course => {
    const preResponses = course.applications.filter(app => app.moment === "PRE").reduce((n, app) => n + app._count.memberships, 0);
    const postResponses = course.applications.filter(app => app.moment === "POST").reduce((n, app) => n + app._count.memberships, 0);
    return { ...courseDto(course), siteName: course.site.name, applicationDate: course.applications.map(app => app.date).sort().at(-1) ?? null, preResponses, postResponses };
  }).filter(course => (!query.moment || query.moment === "POST" || course.preResponses > 0) && (!query.moment || query.moment === "PRE" || course.postResponses > 0))
    .sort((a, b) => (b.applicationDate ?? "").localeCompare(a.applicationDate ?? "") || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  return { rows: rows.slice((query.page - 1) * 25, query.page * 25), page: query.page, total: rows.length, totalPages: Math.ceil(rows.length / 25) };
}
export async function createCourseEdition(input: unknown, userId: string) {
  const data = CreateCourseEditionSchema.parse(input); const { actor, scope } = await access(userId);
  const definition = await prisma.surveyDefinition.findFirst({ where: { AND: [scopeToDefinitionWhere(scope) ?? {}, { id: data.primaryDefinitionId, siteId: data.siteId, instrumentKind: "LEARNING" }] }, include: { site: true } });
  if (!definition || definition.siteId !== data.siteId || !definition.site.isActive) throw fail("Selecciona una evaluación de aprendizaje de un sitio activo autorizado");
  const catalog = schoolCatalog(await surveysRepository.schoolCatalogRows({ ...scope, siteIds: [data.siteId] }));
  if (!catalog.schools.some(item => item.siteId === data.siteId && normalized(item.name) === normalized(data.school))) throw fail("La escuela debe provenir de respuestas recibidas o confirmadas");
  return prisma.$transaction(async tx => {
    const course = await tx.courseEdition.create({ data: { ...data, expectedParticipants: data.expectedParticipants ?? null, expectedParticipantsPre: data.expectedParticipantsPre === undefined ? data.expectedParticipants ?? null : data.expectedParticipantsPre, expectedParticipantsPost: data.expectedParticipantsPost === undefined ? data.expectedParticipants ?? null : data.expectedParticipantsPost, createdBy: actor.id }, include: { primaryDefinition: true } });
    await audit(tx, actor, "COURSE_EDITION_CREATE", course.id, { name: course.name, siteId: course.siteId, primaryDefinitionId: course.primaryDefinitionId, school: course.school, activity: course.activity, expectedParticipants: course.expectedParticipants, expectedParticipantsPre: course.expectedParticipantsPre, expectedParticipantsPost: course.expectedParticipantsPost });
    return courseDto(course);
  });
}
export async function setCourseExpectedParticipants(id: string, input: unknown, userId: string) {
  const data = CourseExpectationUpdateSchema.parse(input); const { actor, scope } = await access(userId);
  return prisma.$transaction(async tx => {
    const course = await readCourse(id, scope, tx); await lockCourse(course, data.expectedRevision, tx, scope);
    await tx.courseEdition.update({ where: { id }, data: { expectedParticipantsPre: data.expectedParticipantsPre, expectedParticipantsPost: data.expectedParticipantsPost } });
    await audit(tx, actor, "COURSE_EXPECTED_PARTICIPANTS_SAVE", id, { previous: { pre: course.expectedParticipantsPre, post: course.expectedParticipantsPost }, expectedParticipantsPre: data.expectedParticipantsPre, expectedParticipantsPost: data.expectedParticipantsPost, revision: data.expectedRevision + 1 });
    return { saved: true, revision: data.expectedRevision + 1 };
  });
}
export async function courseResponseCandidates(id: string, input: unknown, userId: string) {
  const query = CourseResponseQuerySchema.parse(input); const { scope } = await access(userId); const course = await readCourse(id, scope);
  const where: Prisma.SubmissionWhereInput = { ...(query.linked ? {courseMembership:{application:{courseId:id}}} : {}), surveyDefinition: { AND: [scopeToDefinitionWhere(scope) ?? {}, { siteId: course.siteId, programName: course.primaryDefinition.programName }, ...(query.definitionId ? [{ id: query.definitionId }] : [])] }, ...(query.from || query.to ? { receivedAt: { ...(query.from ? { gte: new Date(`${query.from}T00:00:00Z`) } : {}), ...(query.to ? { lt: new Date(new Date(`${query.to}T00:00:00Z`).getTime() + 86400000) } : {}) } } : {}) };
  const [total, rows, allowed] = await Promise.all([prisma.submission.count({ where }), prisma.submission.findMany({ where, include: responseInclude, orderBy: [{ receivedAt: "desc" }, { id: "asc" }], take: 50, skip: (query.page - 1) * 50 }), relations(course)]);
  const duplicates = await possibleDuplicates(rows, scope);
  return { rows: rows.map(row => responseDto(course, row, allowed, duplicates)), page: query.page, total, totalPages: Math.ceil(total / 50) };
}
export async function courseEditionDetail(id: string, page: number, userId: string): Promise<CourseEditionDetailDto> {
  const { scope } = await access(userId); const course = await readCourse(id, scope); const allowed = await relations(course);
  const where: Prisma.SubmissionWhereInput = { courseMembership: { application: { courseId: id } }, surveyDefinition: scopeToDefinitionWhere(scope) ?? {} };
  const [totalResponses, rows, applications, definitions] = await Promise.all([
    prisma.submission.count({ where }),
    prisma.submission.findMany({ where, include: responseInclude, orderBy: [{ receivedAt: "desc" }, { id: "asc" }], take: 50, skip: (page - 1) * 50 }),
    prisma.courseApplication.findMany({ where: { courseId: id, definition: scopeToDefinitionWhere(scope) ?? {}, memberships: { some: {} } }, include: { definition: { select: { instrumentName: true, version: true } }, memberships: { include: { submission: { include: responseInclude } } } }, orderBy: [{ date: "asc" }, { id: "asc" }] }),
    prisma.surveyDefinition.findMany({ where: { AND: [scopeToDefinitionWhere(scope) ?? {}, { siteId: course.siteId, programName: course.primaryDefinition.programName, instrumentKind: { in: ["CQS", "FOLLOW_UP"] } }] }, orderBy: [{ instrumentName: "asc" }, { version: "desc" }] }),
  ]);
  const duplicates = await possibleDuplicates(rows, scope);
  return { ...courseDto(course), totalResponses, responsePage: page, responsePages: Math.ceil(totalResponses / 50), responses: rows.map(row => responseDto(course, row, allowed, duplicates)),
    applications: applications.map(application => { const values = application.memberships.map(item => responseDto(course, item.submission, allowed)); return { id: application.id, definitionId: application.definitionId, instrument: application.definition.instrumentName || "Instrumento", version: application.definition.version, date: application.date, moment: application.moment, responseCount: values.length, validContextCount: values.filter(item => !item.issues.length).length, excludedCount: values.filter(item => item.reviewExcluded).length, reviewCount: values.filter(item => item.issues.some(issue => issue !== "Respuesta excluida")).length }; }),
    instruments: definitions.map(definition => ({ id: definition.id, title: definition.instrumentName || "Instrumento", version: definition.version, kind: definition.instrumentKind, linked: allowed.has(definition.id) })),
  };
}
export async function setCourseInstrument(id: string, input: unknown, userId: string) {
  const data = CourseInstrumentLinkSchema.parse(input); const { actor, scope } = await access(userId);
  return prisma.$transaction(async tx => {
    const course = await readCourse(id, scope, tx); await lockCourse(course, data.expectedRevision, tx, scope);
    const definition = await tx.surveyDefinition.findFirst({ where: { AND: [scopeToDefinitionWhere(scope) ?? {}, { id: data.definitionId, siteId: course.siteId, programName: course.primaryDefinition.programName, instrumentKind: { in: ["CQS", "FOLLOW_UP"] } }] } });
    if (!definition) throw fail("Instrumento complementario no disponible en el sitio/programa del curso", 404);
    const key = { courseId: course.id, definitionId: definition.id };
    if (data.linked) await tx.courseComplement.upsert({ where: { courseId_definitionId: key }, create: { ...key, createdBy: actor.id }, update: {} });
    else await tx.courseComplement.deleteMany({ where: key });
    await audit(tx, actor, "COURSE_INSTRUMENT_LINK", id, { ...key, linked: data.linked, revision: data.expectedRevision + 1 });
    return { saved: true, revision: data.expectedRevision + 1 };
  });
}
export async function setCourseMembership(id: string, input: unknown, userId: string) {
  const data = CourseMembershipSchema.parse(input); const { actor, scope } = await access(userId);
  return prisma.$transaction(async tx => {
    const course = await readCourse(id, scope, tx); await lockCourse(course, data.expectedRevision, tx, scope); const allowed = await relations(course, tx);
    for (const selected of [...data.responses].sort((a, b) => a.id.localeCompare(b.id))) {
      const where = { id: selected.id, contextRevision: selected.contextRevision, surveyDefinition: { AND: [scopeToDefinitionWhere(scope) ?? {}, { siteId: course.siteId }] } };
      if (!(await tx.submission.updateMany({ where, data: { contextRevision: { increment: 1 } } })).count) throw fail("Una respuesta cambió o ya no está disponible; recarga antes de confirmar", 409);
      const row = await tx.submission.findUniqueOrThrow({ where: { id: selected.id }, include: responseInclude });
      const value = responseDto(course, row, allowed);
      if (!data.linked) {
        if (row.courseMembership?.application.courseId !== id) throw fail("La respuesta no pertenece a este curso", 409);
        await tx.courseMembership.delete({ where: { submissionId: row.id } });
        await tx.submission.update({ where: { id: row.id }, data: { autoCourseDisabled: true } });
        continue;
      }
      const blocking = value.issues.filter(issue => !issue.startsWith("El contexto cambió"));
      if (blocking.length) throw fail(`${value.remoteId}: ${blocking.join("; ")}`, 409);
      const contextKey = createHash("sha256").update(JSON.stringify([row.surveyDefinitionId, value.context.date, row.surveyMoment])).digest("hex");
      const application = await tx.courseApplication.upsert({ where: { courseId_contextKey: { courseId: id, contextKey } }, create: { courseId: id, contextKey, definitionId: row.surveyDefinitionId!, date: value.context.date!, moment: row.surveyMoment }, update: {} });
      await tx.courseMembership.upsert({ where: { submissionId: row.id }, create: { submissionId: row.id, applicationId: application.id, contextRevision: row.contextRevision, createdBy: actor.id }, update: { applicationId: application.id, contextRevision: row.contextRevision, createdBy: actor.id } });
    }
    await audit(tx, actor, "COURSE_RESPONSES_LINK", id, { linked: data.linked, responseIds: data.responses.map(item => item.id), revision: data.expectedRevision + 1 });
    return { saved: true, revision: data.expectedRevision + 1 };
  }, { timeout: 15000 });
}

// Called in the same transaction as the import checkpoint.
export async function groupMigratedCourseResponse(tx: Prisma.TransactionClient, definitionId: string, remoteId: string) {
  await tx.$queryRaw`SELECT "id" FROM "survey_definitions" WHERE "id" = ${definitionId} FOR UPDATE`;
  const row = await tx.submission.findUnique({ where: { jotformSubmissionId: remoteId }, include: responseInclude });
  const definition = row?.surveyDefinition;
  if (!row || definition?.id !== definitionId || definition.instrumentKind !== "LEARNING" || !definition.siteId ||
      row.courseMembership || row.autoCourseDisabled || row.reviewExcluded || row.isDuplicate || !row.responseFingerprint ||
      (row.surveyMoment !== "PRE" && row.surveyMoment !== "POST")) return;
  const unresolved = (row.rawJsonData as Prisma.JsonObject | null)?.unresolvedAnswers;
  if (Array.isArray(unresolved) && unresolved.length) return;
  const { school, activity, date } = responseGroupingContext(row);
  if (!activity || !date || (school?.length ?? 0) > 200 || activity.length > 200) return;
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + (row.surveyMoment === "PRE" ? 5 : -5));
  const boundary = shifted.toISOString().slice(0, 10);
  const matching = await tx.courseEdition.findMany({
    where: { status: { in: ["DRAFT", "REVIEWED"] }, primaryDefinitionId: definitionId, siteId: definition.siteId, applications: { some: { definitionId,
      OR: [{ date }, { moment: row.surveyMoment === "PRE" ? "POST" : "PRE",
        date: { gte: row.surveyMoment === "PRE" ? date : boundary, lte: row.surveyMoment === "PRE" ? boundary : date } }],
    } } },
    select: { id: true, school: true, activity: true, status: true, applications: { select: { date: true } } },
  });
  const sameEdition = matching.filter(course => normalized(course.activity) === normalized(activity) &&
    (course.status === "REVIEWED" ? course.applications.some(application => application.date === date) : !!school && normalized(course.school) === normalized(school)));
  if (!sameEdition.length && !school) return;
  if (sameEdition.length > 1) return;
  const updated = await tx.submission.updateMany({
    where: { id: row.id, contextRevision: row.contextRevision, autoCourseDisabled: false, courseMembership: null },
    data: { contextRevision: { increment: 1 } },
  });
  if (!updated.count) return;
  const course = sameEdition[0] ?? await tx.courseEdition.create({
    data: { primaryDefinitionId: definitionId, siteId: definition.siteId, name: `${activity} · ${school} · ${date}`.slice(0, 200), school: school!, activity, createdBy: "system" },
  });
  const contextKey = createHash("sha256").update(JSON.stringify([definitionId, date, row.surveyMoment])).digest("hex");
  const application = await tx.courseApplication.upsert({
    where: { courseId_contextKey: { courseId: course.id, contextKey } },
    create: { courseId: course.id, definitionId, contextKey, date, moment: row.surveyMoment }, update: {},
  });
  await tx.courseMembership.create({ data: { submissionId: row.id, applicationId: application.id, contextRevision: row.contextRevision + 1, createdBy: "system" } });
  await tx.courseEdition.update({ where: { id: course.id }, data: { revision: { increment: 1 } } });
  await tx.auditLog.create({ data: { actorUsername: "Sistema", actorRole: "SYSTEM", action: "COURSE_AUTO_LINK", targetType: "CourseEdition", targetId: course.id, metadata: { submissionId: row.id, applicationId: application.id, created: sameEdition.length === 0 } } });
}

async function possibleDuplicates(rows: ResponseRow[], scope: Awaited<ReturnType<typeof access>>["scope"]) {
  const fingerprints = [...new Set(rows.flatMap(row => row.responseFingerprint ? [row.responseFingerprint] : []))];
  if (!fingerprints.length) return new Set<string>();
  const matches = await prisma.submission.groupBy({ by: ["responseFingerprint"], where: { responseFingerprint: { in: fingerprints }, surveyDefinition: scopeToDefinitionWhere(scope) ?? {} }, _count: { _all: true } });
  return new Set(matches.filter(row => row._count._all > 1).map(row => row.responseFingerprint!));
}
export async function courseOptions(userId: string) {
  const { scope } = await access(userId);
  const [sites, definitions, schools] = await Promise.all([
    prisma.site.findMany({ where: scope.siteIds ? { id: { in: scope.siteIds } } : {}, select: { id: true, name: true, isActive: true }, orderBy: { name: "asc" } }),
    prisma.surveyDefinition.findMany({ where: scopeToDefinitionWhere(scope) ?? {}, select: { id: true, siteId: true, instrumentName: true, instrumentKind: true, version: true, programName: true, jotformFormId: true }, orderBy: [{ instrumentName: "asc" }, { version: "desc" }] }),
    surveysRepository.schoolCatalogRows(scope),
  ]);
  return { sites, definitions: definitions.map(item => ({ id: item.id, siteId: item.siteId, title: item.instrumentName || item.jotformFormId, kind: item.instrumentKind, version: item.version, programName: item.programName })), schools: schoolCatalog(schools).schools.map(item => ({ siteId: item.siteId, name: item.name })) };
}


export async function courseResults(id: string, input: unknown, userId: string): Promise<CourseResultsDto> {
  const query = CourseResultsQuerySchema.parse(input); const { scope } = await access(userId);
  return prisma.$transaction(async tx => {
    const course = await readCourse(id, scope, tx);
    if (course.status === "COMPLETED") {
      const publication = await tx.courseEditionPublication.findFirst({ where: { courseId: id }, orderBy: { version: "desc" } });
      if (!publication || publication.surveyDefinitionIds.some(definitionId => scope.excludedSurveyDefinitionIds.includes(definitionId))) throw fail("Publicación no disponible en tu alcance", 403);
      return (publication.snapshot as unknown as CourseReportPublication["snapshot"]).result;
    }
    return calculateCourseResults(id, query, scope, tx);
  }, { isolationLevel: "RepeatableRead", timeout: 30000 });
}
async function calculateCourseResults(id: string, query: { from?: string | undefined; to?: string | undefined }, scope: Awaited<ReturnType<typeof access>>["scope"], tx: Prisma.TransactionClient): Promise<CourseResultsDto> {
    const course = await readCourse(id, scope, tx); const allowed = await relations(course, tx);
    const application = { courseId: id, ...(query.from || query.to ? { date: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } } : {}) };
    const [rows, definitions] = await Promise.all([
      tx.submission.findMany({ where: { courseMembership: { application }, surveyDefinition: scopeToDefinitionWhere(scope) ?? {} }, include: responseInclude, orderBy: { id: "asc" } }),
      tx.surveyDefinition.findMany({ where: { AND: [scopeToDefinitionWhere(scope) ?? {}, { OR: [{ id: course.primaryDefinitionId }, { submissions: { some: { courseMembership: { application } } } }] }] }, include: { questions: { include: { weight: { select: { factor: true } } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] } }, orderBy: { id: "asc" } }),
    ]);
    const schoolCounts = new Map<string | null, number>();
    for (const row of rows) {
      if (row.reviewExcluded) continue;
      const school = responseGroupingContext(row).school;
      schoolCounts.set(school, (schoolCounts.get(school) ?? 0) + 1);
    }
    const schoolDistribution = [...schoolCounts].map(([school, count]) => ({ school, count }));
    const byId = new Map(definitions.map(definition => [definition.id, definition]));
    const receipts = rows.map(row => ({ definition: byId.get(row.surveyDefinitionId!)!, rawJsonData: row.rawJsonData, moment: row.surveyMoment, gender: responseGroupingContext(row).gender, excluded: row.reviewExcluded, contextPending: responseDto(course, row, allowed).issues.some(issue => issue !== "Respuesta excluida") }));
    const bases = courseResultBases(receipts, definitions);
    const aggregates = addCourseStandardDeviations(aggregateCourseQuestions(bases.questions, definitions), receipts, definitions);
    return { schoolDistribution, courseId: course.id, name: course.name, school: course.school, siteId: course.siteId, activity: course.activity, revision: course.revision, expectedParticipants: course.expectedParticipants, expectedParticipantsPre: course.expectedParticipantsPre, expectedParticipantsPost: course.expectedParticipantsPost, calculatedAt: new Date().toISOString(), methodology: "approved_pre_post_v1", primaryDefinitionId: course.primaryDefinitionId, aggregates, coverageThreshold: 80, ...bases, distributions: definitions.filter(definition => definition.instrumentKind === "LEARNING").map(definition => { const parsed = AnalysisWeightsSchema.safeParse(definition.analysisWeights); const weights = parsed.success ? parsed.data.find(item => item.analysisType === "pre_post") : null; return { definitionId: definition.id, instrument: definition.instrumentName || "Instrumento", version: definition.version, standardDeviation: weights?.standardDeviation ?? "disabled", categoryWeights: weights?.categoryWeights ?? null, subcategoryWeights: weights?.subcategoryWeights ?? null }; }), pending: [
      "CQS y seguimiento se consultan por separado; no se incorporan a la comparación de aprendizaje.",
      "Resultados separados por versión; cambio = Post − Pre en puntos porcentuales, sin emparejar personas.",
      "Cobertura: envíos admitidos de cada momento / participantes esperados del curso para ese momento × 100; umbral 80%. Los conteos no identifican personas únicas ni autorizan publicación.",
      "CQS y seguimiento son complementarios y no intervienen en estas puntuaciones.",
    ] };
}


function reportDraftDto(course: Course): CourseReportDraftDto {
  const stored = course.reportDraft as { draft?: unknown; savedAt?: unknown } | null;
  const parsed = CourseReportDraftSchema.safeParse(stored?.draft);
  if (stored && !parsed.success) throw fail("El borrador de reporte requiere revisión; no se reemplazó su contenido", 409);
  return { courseId: course.id, revision: course.revision, draft: parsed.success ? parsed.data : { templateKey: "course-impacts-general", textContent: {} }, savedAt: typeof stored?.savedAt === "string" ? stored.savedAt : null };
}
export async function getCourseReportDraft(id: string, userId: string) {
  const { scope } = await access(userId); return reportDraftDto(await readCourse(id, scope));
}
export async function saveCourseReportDraft(id: string, input: unknown, userId: string) {
  const data = SaveCourseReportDraftSchema.parse(input); const { actor, scope } = await access(userId);
  return prisma.$transaction(async tx => {
    const course = await readCourse(id, scope, tx); await lockCourse(course, data.expectedRevision, tx, scope);
    if (data.draft.categories) {
      const result = await calculateCourseResults(id, {}, scope, tx);
      try { selectCourseResultCategories(result, data.draft.categories); }
      catch (error) { throw fail(error instanceof Error ? error.message : "Selección de categorías inválida"); }
    }
    const savedAt = new Date().toISOString();
    const saved = await tx.courseEdition.update({ where: { id }, data: { reportDraft: { draft: data.draft, savedAt } as Prisma.InputJsonValue }, include: { primaryDefinition: true } });
    await audit(tx, actor, "COURSE_REPORT_DRAFT_SAVE", id, { templateKey: data.draft.templateKey, revision: saved.revision, categories: data.draft.categories ?? null });
    return reportDraftDto(saved);
  });
}

function publicationWhere(scope: Awaited<ReturnType<typeof access>>["scope"]): Prisma.CourseEditionPublicationWhereInput {
  return { course: courseWhere(scope), NOT: { surveyDefinitionIds: { hasSome: scope.excludedSurveyDefinitionIds } } };
}
const publicationInclude = { course: { select: { siteId: true } } } satisfies Prisma.CourseEditionPublicationInclude;
type PublicationRow = Prisma.CourseEditionPublicationGetPayload<{ include: typeof publicationInclude }>;
function publicationSummary(row: PublicationRow) { return { id: row.id, courseId: row.courseId, version: row.version, createdAt: row.createdAt.toISOString(), name: row.name, school: row.school, siteId: row.course.siteId }; }
function publicationDto(row: PublicationRow): CourseReportPublication {
  const snapshot = row.snapshot as unknown as CourseReportPublication["snapshot"];
  if (snapshot?.schemaVersion !== 1 || snapshot.component !== "learning" || !snapshot.document?.template || !snapshot.document.data) throw fail("La publicación requiere revisión; no se recalculará su contenido", 409);
  return { ...publicationSummary(row), snapshot };
}
export async function publishedReportFilterOptions(userId: string) {
  const { scope } = await access(userId);
  const [sites, definitions, publications] = await Promise.all([
    prisma.site.findMany({
      where: scope.siteIds ? { id: { in: scope.siteIds } } : {},
      select: { id: true, name: true, programs: true },
      orderBy: { name: "asc" },
    }),
    prisma.surveyDefinition.findMany({
      where: scopeToDefinitionWhere(scope) ?? {},
      select: { id: true, siteId: true, instrumentName: true, instrumentKind: true, version: true, programName: true },
      orderBy: [{ instrumentName: "asc" }, { version: "desc" }],
    }),
    prisma.courseEditionPublication.findMany({
      where: publicationWhere(scope),
      select: {
        id: true, name: true, school: true, version: true, createdAt: true,
        course: { select: { id: true, siteId: true, primaryDefinitionId: true, applications: { select: { date: true } } } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    }),
  ]);
  return {
    sites,
    definitions: definitions.map(definition => ({
      id: definition.id, siteId: definition.siteId, name: definition.instrumentName || "Instrumento",
      kind: definition.instrumentKind, version: definition.version, program: definition.programName,
    })),
    publications: publications.map(item => ({
      id: item.id, name: item.name, school: item.school, version: item.version,
      courseId: item.course.id, siteId: item.course.siteId, definitionId: item.course.primaryDefinitionId,
      dates: [...new Set(item.course.applications.map(application => application.date))],
    })),
  };
}

export async function publishedReportAggregate(input: unknown, userId: string) {
  const filters = z.object({
    definitionId: z.string().uuid(), siteId: z.string().uuid().optional(),
    program: z.string().max(200).optional(), from: z.string().date(), to: z.string().date(),
  }).strict().refine(value => value.from <= value.to, "Rango de fechas inválido").parse(input);
  const { scope } = await access(userId);
  const rows = await prisma.courseEditionPublication.findMany({
    where: { ...publicationWhere(scope), course: { AND: [
      courseWhere(scope),
      { primaryDefinitionId: filters.definitionId, status: "COMPLETED" },
      ...(filters.siteId ? [{ siteId: filters.siteId }] : []),
      ...(filters.program ? [{ primaryDefinition: { programName: filters.program } }] : []),
    ] } },
    include: { course: { select: { siteId: true, applications: { where: { definitionId: filters.definitionId, moment: { in: ["PRE", "POST"] } }, select: { date: true } } } } },
    orderBy: [{ version: "desc" }, { createdAt: "desc" }],
  });
  const latest = new Map<string, typeof rows[number]>();
  for (const row of rows) if (!latest.has(row.courseId)) latest.set(row.courseId, row);
  const matching = [...latest.values()].filter(row => row.course.applications.some(app => app.date >= filters.from && app.date <= filters.to));
  if (!matching.length) return null;
  if (matching.some(row => row.course.applications.some(app => app.date < filters.from || app.date > filters.to))) {
    throw fail("El rango incluye parcialmente un curso publicado. Amplía las fechas para incluir todas sus aplicaciones.", 400);
  }
  try {
    return aggregatePublishedCourses(matching.map(row => publicationDto(row).snapshot.result));
  } catch (error) {
    throw fail(error instanceof Error ? error.message : "No se pudo calcular el reporte", 400);
  }
}

export async function listPublishedCourseReports(input: unknown, userId: string) {
  const query = CourseListQuerySchema.parse(input); const { scope } = await access(userId);
  const where: Prisma.CourseEditionPublicationWhereInput = { ...publicationWhere(scope), ...(query.school ? { school: { contains: query.school, mode: "insensitive" } } : {}) };
  const [total, rows] = await prisma.$transaction([prisma.courseEditionPublication.count({ where }), prisma.courseEditionPublication.findMany({ where, select: { id: true, courseId: true, version: true, createdAt: true, name: true, school: true, course: publicationInclude.course }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 25, skip: (query.page - 1) * 25 })]);
  return { rows: rows.map(({ course, ...row }) => ({ ...row, createdAt: row.createdAt.toISOString(), siteId: course.siteId })), page: query.page, total, totalPages: Math.ceil(total / 25) };
}
export async function publishedCourseReport(id: string, userId: string) {
  const { scope } = await access(userId); const row = await prisma.courseEditionPublication.findFirst({ where: { id, ...publicationWhere(scope) }, include: publicationInclude });
  if (!row) throw fail("Publicación no disponible en tu alcance", 404);
  return publicationDto(row);
}
export async function courseReportHistory(courseId: string, input: unknown, userId: string) {
  const query = CourseListQuerySchema.parse(input); const { scope } = await access(userId); await readCourse(courseId, scope);
  const where = { ...publicationWhere(scope), courseId };
  const [total, rows] = await prisma.$transaction([prisma.courseEditionPublication.count({ where }), prisma.courseEditionPublication.findMany({ where, select: { id: true, courseId: true, version: true, createdAt: true, name: true, school: true, course: publicationInclude.course }, orderBy: { version: "desc" }, take: 25, skip: (query.page - 1) * 25 })]);
  return { rows: rows.map(row => ({ id: row.id, courseId: row.courseId, version: row.version, createdAt: row.createdAt.toISOString(), name: row.name, school: row.school, siteId: row.course.siteId })), page: query.page, total, totalPages: Math.ceil(total / 25) };
}
export async function publishCourseEdition(courseId: string, input: unknown, userId: string, complete = false) {
  const data = PublishCourseEditionSchema.parse(input); const { actor, scope } = await access(userId);
  if (!["SYSTEM_ADMIN", "ORG_ADMIN"].includes(actor.role)) throw fail("Solo administradores pueden publicar reportes", 403);
  try {
    return await prisma.$transaction(async tx => {
      const course = await readCourse(courseId, scope, tx);
      await tx.$queryRaw`SELECT "id" FROM "survey_definitions" WHERE "id" = ${course.primaryDefinitionId} FOR UPDATE`;
      if (course.status === "COMPLETED") throw fail("El curso ya está completado", 409);
      if (complete && course.status !== "REVIEWED") throw fail("Confirma el curso antes de completarlo", 409);
      if (course.revision !== data.expectedRevision) throw fail("El curso cambió; revisa y genera la vista previa de nuevo", 409);
      const latest = await tx.courseEditionPublication.findFirst({ where: { courseId }, orderBy: { version: "desc" }, select: { version: true } });
      if ((latest?.version ?? 0) !== data.expectedVersion) throw fail("El historial cambió; recarga antes de publicar", 409);
      const draft = reportDraftDto(course);
      if (data.categories) draft.draft = { ...draft.draft, categories: data.categories };
      if (complete) {
        draft.draft = { ...draft.draft, from: undefined, to: undefined };
        draft.savedAt = new Date().toISOString();
        await tx.courseEdition.update({ where: { id: courseId }, data: { reportDraft: { draft: draft.draft, savedAt: draft.savedAt } as unknown as Prisma.InputJsonValue } });
      } else if (!draft.savedAt) throw fail("Guarda el borrador antes de publicar");
      const definitions = await tx.surveyDefinition.findMany({ where: { OR: [{ id: course.primaryDefinitionId }, { submissions: { some: { courseMembership: { application: { courseId } } } } }] }, select: { id: true } });
      if (definitions.some(definition => scope.excludedSurveyDefinitionIds.includes(definition.id))) throw fail("El curso contiene instrumentos fuera de tu alcance", 403);
      let result = await calculateCourseResults(courseId, draft.draft, scope, tx);
      try { result = selectCourseResultCategories(result, draft.draft.categories); }
      catch (error) { throw fail(error instanceof Error ? error.message : "Selección de categorías inválida"); }
      if (!courseResponseCoverage(result.preReceipts, result.expectedParticipantsPre).meetsThreshold || !courseResponseCoverage(result.postReceipts, result.expectedParticipantsPost).meetsThreshold) throw fail("Se requiere cobertura de al menos 80% en Pre y Post sobre participantes esperados");
      if (result.contextPendingReceipts || result.sourcePendingReceipts || result.unsupportedVersionReceipts) throw fail("Revisa o excluye las respuestas pendientes antes de publicar", 409);
      if (await tx.submission.count({ where: { courseMembership: { application: { courseId } }, reviewExcluded: false, isDuplicate: true } })) throw fail("Revisa o excluye los envíos marcados como duplicados", 409);
      if (result.questions.some(question => !question.configurationReady || [question.pre, question.post].some(base => base.invalid || base.configurationPending || base.zeroMaximum || base.valid && (base.points === null || base.applicableMaximum === null)))) throw fail("Revisa las reglas y respuestas no válidas antes de publicar", 409);
      const index = result.aggregates.find(row => row.level === "index" && row.definitionId === course.primaryDefinitionId);
      if (!index || index.change === null || result.aggregates.some(row => row.issue)) throw fail("Se requieren resultados Pre/Post y distribuciones completas para publicar");
      const snapshot: CourseReportPublication["snapshot"] = { schemaVersion: 1, component: "learning", result, draft: draft.draft, document: buildCourseReportPreview(result, draft.draft, true) };
      const row = await tx.courseEditionPublication.create({ data: { courseId, version: data.expectedVersion + 1, actorId: actor.id, name: result.name, school: result.school, surveyDefinitionIds: definitions.map(definition => definition.id), snapshot: snapshot as unknown as Prisma.InputJsonValue }, include: publicationInclude });
      if (complete) {
        await tx.courseEdition.update({ where: { id: courseId }, data: { status: "COMPLETED", revision: { increment: 1 } } });
        await audit(tx, actor, "COURSE_COMPLETE", courseId, { publicationId: row.id, revision: course.revision + 1 });
      }
      await audit(tx, actor, "COURSE_REPORT_PUBLISH", courseId, { publicationId: row.id, version: row.version, revision: course.revision, component: "learning", categories: result.categorySelection ?? null });
      return publicationDto(row);
    }, { isolationLevel: "Serializable", timeout: 30000 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) throw fail("Hubo un cambio simultáneo; recarga y vuelve a publicar", 409);
    throw error;
  }
}

export async function courseComplementResults(courseId: string, definitionId: string, userId: string) {
 const {scope}=await access(userId);
 return prisma.$transaction(async tx=>{
  const course=await readCourse(courseId,scope,tx);const allowed=await relations(course,tx);
  if(!allowed.has(definitionId))throw fail("Vincula primero el instrumento a esta edición",404);
  const definition=await tx.surveyDefinition.findFirst({where:{AND:[scopeToDefinitionWhere(scope) ?? {},{id:definitionId,siteId:course.siteId,programName:course.primaryDefinition.programName,instrumentKind:{in:["CQS","FOLLOW_UP"]}}]},include:{questions:{include:{weight:{select:{factor:true}}},orderBy:[{createdAt:"asc"},{id:"asc"}]}}});
  if(!definition)throw fail("Instrumento complementario no disponible",404);
  const rows=await tx.submission.findMany({where:{surveyDefinitionId:definitionId,courseMembership:{application:{courseId}}},include:responseInclude,orderBy:{id:"asc"}});
  const primary=await calculateCourseResults(courseId,{},scope,tx);
  return complementaryResults(primary,definition,rows.map(row=>({definition,rawJsonData:row.rawJsonData,moment:row.surveyMoment,excluded:row.reviewExcluded,contextPending:responseDto(course,row,allowed).issues.some(issue=>issue!=="Respuesta excluida")})));
 },{isolationLevel:"RepeatableRead",timeout:30000});
}

export async function splitCourseApplication(id: string, applicationId: string, input: unknown, userId: string) {
  const data = z.object({ expectedRevision: z.number().int().nonnegative() }).strict().parse(input);
  const { actor, scope } = await access(userId);
  return prisma.$transaction(async tx => {
    const course = await readCourse(id, scope, tx);
    await lockCourse(course, data.expectedRevision, tx, scope);
    const application = await tx.courseApplication.findFirst({ where: { id: applicationId, courseId: id,
      definition: scopeToDefinitionWhere(scope) ?? {}, memberships: { some: {} } } });
    if (!application) throw fail("Aplicación no disponible en este curso", 404);
    const separated = await tx.courseEdition.create({ data: {
      siteId: course.siteId, primaryDefinitionId: course.primaryDefinitionId,
      school: course.school, activity: course.activity,
      name: `${course.activity} · ${application.date} · ${application.moment}`.slice(0, 200),
      createdBy: actor.id,
    } });
    const members = await tx.courseMembership.findMany({ where: { applicationId }, select: { submissionId: true } });
    await tx.submission.updateMany({ where: { id: { in: members.map(row => row.submissionId) } }, data: { autoCourseDisabled: true } });
    await tx.courseApplication.update({ where: { id: applicationId }, data: { courseId: separated.id } });
    await tx.courseComplement.createMany({ data: (await tx.courseComplement.findMany({ where: { courseId: id } })).map(item => ({
      courseId: separated.id, definitionId: item.definitionId, createdBy: actor.id,
    })) });
    await audit(tx, actor, "COURSE_APPLICATION_SPLIT", id, { applicationId, destinationCourseId: separated.id, responseCount: members.length });
    return { saved: true, courseId: separated.id };
  }, { timeout: 15000 });
}

export async function confirmCourseSelection(input: unknown, userId: string) {
  const data = z.object({
    participants: z.number().int().min(1).max(2147483647),
    responses: z.array(z.object({ id: z.string().uuid(), contextRevision: z.number().int().nonnegative() }).strict()).min(1).max(2000)
      .refine(rows => new Set(rows.map(row => row.id)).size === rows.length, "Respuestas repetidas"),
  }).strict().parse(input);
  const { actor, scope } = await access(userId);
  return prisma.$transaction(async tx => {
    const ids = data.responses.map(row => row.id);
    const initial = await tx.submission.findMany({ where: { id: { in: ids }, surveyDefinition: scopeToDefinitionWhere(scope) ?? {} }, select: { surveyDefinitionId: true } });
    if (initial.length !== ids.length || new Set(initial.map(row => row.surveyDefinitionId)).size !== 1 || !initial[0]?.surveyDefinitionId) throw fail("Selecciona respuestas de un mismo instrumento autorizado");
    const definitionId = initial[0].surveyDefinitionId;
    await tx.$queryRaw`SELECT "id" FROM "survey_definitions" WHERE "id" = ${definitionId} FOR UPDATE`;
    const rows = await tx.submission.findMany({ where: { id: { in: ids }, surveyDefinition: scopeToDefinitionWhere(scope) ?? {} },
      include: { ...responseInclude, courseMembership: { include: { application: { include: { course: true } } } } } });
    const definition = rows[0]?.surveyDefinition;
    if (definition?.instrumentKind !== "LEARNING") throw fail("Selecciona una evaluación de aprendizaje");
    const version = await tx.surveyDefinition.findUniqueOrThrow({ where: { id: definitionId }, select: { configurationVersion: true } });
    if (version.configurationVersion !== 4) throw fail("La confirmación requiere un instrumento configurado con el asistente actual");
    const contexts = rows.map(row => responseGroupingContext(row));
    const dates = new Set(contexts.map(context => context.date));
    const activities = new Set(contexts.map(context => normalized(context.activity)));
    if (dates.has(null) || dates.size > 2 || activities.size !== 1 || activities.has("")) throw fail("Selecciona una o dos fechas con la misma actividad");
    if (!rows.some(row => !row.reviewExcluded && row.surveyMoment === "PRE") || !rows.some(row => !row.reviewExcluded && row.surveyMoment === "POST")) throw fail("El curso requiere respuestas Pre y Post");
    if (rows.some(row => !["PRE", "POST"].includes(row.surveyMoment))) throw fail("Corrige los momentos antes de confirmar");
    const schools = new Map<string, number>();
    for (const context of contexts) if (context.school) schools.set(context.school, (schools.get(context.school) ?? 0) + 1);
    const school = [...schools].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
    if (!school) throw fail("Revisa la escuela antes de confirmar");
    for (const row of rows) {
      const membership = row.courseMembership;
      const unresolved = (row.rawJsonData as Prisma.JsonObject | null)?.unresolvedAnswers;
      if (row.status === "ERROR" || row.status === "COMPLETADO" || row.isDuplicate || Array.isArray(unresolved) && unresolved.length) throw fail("Revisa errores, duplicados y respuestas de origen antes de confirmar");
      if (membership && (membership.createdBy !== "system" || membership.application.course.status !== "DRAFT")) throw fail("Hay respuestas ya confirmadas o vinculadas manualmente; recarga y revisa", 409);
      const expected = data.responses.find(item => item.id === row.id)!;
      if (row.contextRevision !== expected.contextRevision) throw fail("Una respuesta cambió; recarga antes de confirmar", 409);
    }
    const activity = contexts[0]!.activity!;
    const course = await tx.courseEdition.create({ data: {
      siteId: definition.siteId, primaryDefinitionId: definitionId, status: "REVIEWED",
      name: `${activity} · ${[...dates].sort().join(" / ")}`.slice(0, 200), school, activity,
      expectedParticipants: data.participants, expectedParticipantsPre: data.participants, expectedParticipantsPost: data.participants, createdBy: actor.id,
    } });
    for (const row of rows) {
      const changed = await tx.submission.updateMany({ where: { id: row.id, contextRevision: row.contextRevision }, data: { contextRevision: { increment: 1 } } });
      if (!changed.count) throw fail("Una respuesta cambió; recarga antes de confirmar", 409);
      const date = responseGroupingContext(row).date!;
      const contextKey = createHash("sha256").update(JSON.stringify([definitionId, date, row.surveyMoment])).digest("hex");
      const application = await tx.courseApplication.upsert({ where: { courseId_contextKey: { courseId: course.id, contextKey } }, create: { courseId: course.id, definitionId, contextKey, date, moment: row.surveyMoment }, update: {} });
      await tx.courseMembership.upsert({ where: { submissionId: row.id }, create: { submissionId: row.id, applicationId: application.id, contextRevision: row.contextRevision + 1, createdBy: actor.id }, update: { applicationId: application.id, contextRevision: row.contextRevision + 1, createdBy: actor.id } });
      if (row.courseMembership) await tx.courseEdition.update({ where: { id: row.courseMembership.application.courseId }, data: { revision: { increment: 1 } } });
    }
    await audit(tx, actor, "COURSE_CONFIRM", course.id, { responseIds: ids, participants: data.participants, dates: [...dates] });
    return { saved: true, courseId: course.id };
  }, { timeout: 30000 });
}
