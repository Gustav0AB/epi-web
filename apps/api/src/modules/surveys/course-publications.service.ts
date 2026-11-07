import { Prisma } from "@prisma/client";
import type { PublishCourseInput } from "@epi/shared";
import { prisma } from "../../db/prisma.js";
import { allowedSiteIds } from "../../shared/site-scope.js";
import { surveysRepository } from "./surveys.repository.js";
import { buildReportDetail, summarizeGroupSearchRows } from "./surveys.service.js";

type CourseKey = { siteId: string; school: string; date: string };
const failure = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode });

async function publicationAccess(userId: string, siteId: string, manage: boolean) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (manage && !["SYSTEM_ADMIN", "ORG_ADMIN"].includes(user.role)) throw failure("Only administrators can publish courses", 403);
  const siteIds = await allowedSiteIds({ ...user, role: user.role.toLowerCase() });
  if (siteIds && !siteIds.includes(siteId)) throw failure("Site outside your assigned scope", 403);
  return user;
}

export async function coursePublicationHistory(key: CourseKey, userId: string) {
  const user = await publicationAccess(userId, key.siteId, false);
  return prisma.coursePublication.findMany({
    where: { ...key, NOT: { surveyDefinitionIds: { hasSome: user.excludedSurveyDefinitionIds } } },
    orderBy: { version: "desc" },
  });
}

export async function publishCourse(input: PublishCourseInput, userId: string) {
  const user = await publicationAccess(userId, input.siteId, true);
  const key = { siteId: input.siteId, school: input.school, date: input.date };
  try {
    return await prisma.$transaction(async (tx) => {
      const latest = await tx.coursePublication.findFirst({ where: key, orderBy: { version: "desc" } });
      if ((latest?.version ?? 0) !== input.expectedVersion) throw failure("Publication changed; reload its history before publishing", 409);
      const courseRows = (await surveysRepository.groupSearchRows({ siteId: key.siteId, from: key.date, to: key.date, includeUnprocessed: true }, tx))
        .filter((row) => (row.participant?.school?.trim() || "Sin escuela") === key.school && !row.reviewExcluded);
      if (!courseRows.length) throw failure("Course has no usable submissions", 400);
      const definitionIds = [...new Set(courseRows.flatMap(row => row.surveyDefinition ? [row.surveyDefinition.id] : []))];
      if (definitionIds.some(id => user.excludedSurveyDefinitionIds.includes(id))) throw failure("Course contains instruments outside your scope", 403);
      if (await tx.surveyDefinition.count({ where: { id: { in: definitionIds }, configurationVersion: { gte: 3 } } })) throw failure("La publicación de instrumentos versionados requiere los resultados y condiciones aprobados de E5/E6; el flujo histórico no puede publicarlos", 409);
      if (courseRows.some(row => row.status !== "COMPLETADO")) throw failure("Complete or exclude pending course submissions before publication", 409);
      if (await tx.submission.count({ where: { id: { in: courseRows.map(row => row.id) }, isDuplicate: true } })) throw failure("Review or exclude duplicate submissions before publication", 409);
      const expectation = await tx.courseExpectation.findUnique({ where: { siteId_school_date: key } });
      const coverage = summarizeGroupSearchRows(courseRows, expectation ? [expectation] : []).rows[0]!;
      if (!coverage.meetsResponseCoverage) throw failure("Publication requires at least 80% separately in Pre, Post and CQS", 400);
      const answers = await surveysRepository.completedWithAnswers({ submissionIds: courseRows.map(row => row.id), scope: { siteIds: [key.siteId] } }, tx);
      const report = buildReportDetail(answers, { excludedQuestionIds: input.excludedQuestionIds });
      if (report.overallImprovement === null) throw failure("Publication requires at least one comparable included question", 400);
      return tx.coursePublication.create({ data: {
        ...key, version: input.expectedVersion + 1, actorId: userId, surveyDefinitionIds: definitionIds,
        snapshot: { schemaVersion: 1, coverage, report, excludedQuestionIds: input.excludedQuestionIds, cqsSatisfaction: null } as unknown as Prisma.InputJsonValue,
      } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) throw failure("Concurrent change; reload and retry publication", 409);
    throw error;
  }
}
