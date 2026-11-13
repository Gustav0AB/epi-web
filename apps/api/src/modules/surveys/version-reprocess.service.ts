import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { learningContextIssues } from "@epi/shared";
import { prisma } from "../../db/prisma.js";
import { JotformPayloadSchema } from "./surveys.schema.js";
import { expandMatrixAnswers } from "./matrix-answers.js";
import { configuredSchoolContext, schoolGroupingContext } from "./school-context.js";
import { configuredActivityContext } from "./activity-context.js";
import { configuredDemographics, responseFingerprint } from "./response-context.js";
import { resolveSurveyMoment } from "./survey-moment.js";

export async function versionReprocessProgress(formId: string) {
  const latest = await prisma.auditLog.findFirst({ where: { action: "SURVEY_VERSION_REPROCESS_PROGRESS", targetType: "JotformForm", targetId: formId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { metadata: true, createdAt: true } });
  if (!latest) return null;
  const progress = latest.metadata as { state: "RUNNING" | "FINISHED" | "INTERRUPTED"; runId: string; processed: number; total: number; updated: number; inCourse: number; published: number; pending: number; errors: number };
  return { ...progress, lastUpdate: latest.createdAt.toISOString() };
}

// A publication does not retain membership history; protect its entire source version.
export async function reprocessEarlierVersions(formId: string, actorId: string) {
  const actor = await prisma.user.findUniqueOrThrow({ where: { id: actorId } });
  if (actor.role !== "SYSTEM_ADMIN") throw Object.assign(new Error("Solo el administrador del sistema puede actualizar respuestas históricas"), { statusCode: 403 });
  const target = await prisma.surveyDefinition.findFirst({ where: { jotformFormId: formId }, orderBy: { version: "desc" }, include: { questions: true } });
  if (!target || target.configurationVersion !== 4 || target.version < 2) throw Object.assign(new Error("Se necesita una versión nueva del instrumento para actualizar respuestas"), { statusCode: 400 });
  if (!target.questions.length) throw Object.assign(new Error("La versión activa no tiene preguntas configuradas"), { statusCode: 400 });
  if (target.instrumentKind === "LEARNING") {
    const issues = learningContextIssues(target.questions.filter(question => !(question.sourceContext as { matrixParent?: boolean } | null)?.matrixParent).map(question => ({ externalId: question.externalId, text: question.text, type: question.type, role: question.role, options: question.options, momentMappings: Array.isArray(question.momentMappings) ? question.momentMappings as { value: string; moment: "PRE" | "POST" | "POST_POST" }[] : [] })));
    if (issues.length) throw Object.assign(new Error(issues.join(" ")), { statusCode: 400 });
  }
  const sources = await prisma.surveyDefinition.findMany({ where: { jotformFormId: formId, siteId: target.siteId, version: { lt: target.version } }, select: { id: true } });
  const sourceIds = sources.map(source => source.id);
  const total = await prisma.submission.count({ where: { surveyDefinitionId: { in: sourceIds } } });
  const result = { total, updated: 0, inCourse: 0, published: 0, pending: 0, errors: 0 };
  let cursor = "";
  let processed = 0;
  const runId = randomUUID();
  const auditActor = { actorId: actor.id, actorUsername: actor.username, actorRole: actor.role, actorOrganizationId: actor.organizationId };
  let lastProgressAt = 0;
  const progress = async (state: "RUNNING" | "FINISHED" | "INTERRUPTED") => {
    lastProgressAt = Math.max(Date.now(), lastProgressAt + 1);
    await prisma.auditLog.create({ data: { ...auditActor, createdAt: new Date(lastProgressAt), action: "SURVEY_VERSION_REPROCESS_PROGRESS", targetType: "JotformForm", targetId: formId, metadata: { runId, state, processed, ...result } } });
  };
  await progress("RUNNING");
  try {
  while (true) {
    const batch = await prisma.submission.findMany({ where: { surveyDefinitionId: { in: sourceIds }, id: { gt: cursor } }, orderBy: { id: "asc" }, take: 100, select: { id: true } });
    if (!batch.length) break;
    for (const item of batch) {
      try {
        const outcome = await prisma.$transaction(async tx => {
          const current = await tx.submission.findUnique({ where: { id: item.id }, select: { surveyDefinitionId: true } });
          if (!current?.surveyDefinitionId || !sourceIds.includes(current.surveyDefinitionId)) return "pending" as const;
          await tx.$queryRaw`SELECT "id" FROM "survey_definitions" WHERE "id" = ${current.surveyDefinitionId} FOR UPDATE`;
          const latest = await tx.surveyDefinition.findFirst({ where: { jotformFormId: formId }, orderBy: { version: "desc" }, select: { id: true } });
          if (latest?.id !== target.id) throw new Error("La versión activa cambió durante la actualización");
          const published = await tx.coursePublication.count({ where: { surveyDefinitionIds: { has: current.surveyDefinitionId } } }) || await tx.courseEditionPublication.count({ where: { surveyDefinitionIds: { has: current.surveyDefinitionId } } });
          if (published) return "published" as const;
          const locked = await tx.submission.updateMany({ where: { id: item.id, surveyDefinitionId: current.surveyDefinitionId, courseMembership: null, status: { not: "COMPLETADO" } }, data: { contextRevision: { increment: 1 } } });
          if (!locked.count) {
            const row = await tx.submission.findUnique({ where: { id: item.id }, select: { courseMembership: { select: { submissionId: true } }, status: true } });
            return row?.courseMembership ? "inCourse" as const : row?.status === "COMPLETADO" ? "published" as const : "pending" as const;
          }
          const row = await tx.submission.findUniqueOrThrow({ where: { id: item.id } });
          const parsed = JotformPayloadSchema.safeParse(row.rawJsonData);
          if (!parsed.success || parsed.data.unresolvedAnswers?.length) throw new Error("La respuesta original requiere revisión");
          const payload = parsed.data;
          const expanded = expandMatrixAnswers(payload.answers, target.questions);
          const school = configuredSchoolContext(expanded.answers, target.questions);
          const activity = configuredActivityContext(expanded.answers, target.questions);
          const demographics = configuredDemographics(expanded.answers, target.questions);
          const detected = resolveSurveyMoment({ ...payload, answers: expanded.answers }, target.questions);
          const moment = row.reviewMoment ?? (target.questions.some(question => question.role === "MOMENT") ? detected : target.instrumentKind === "FOLLOW_UP" ? "POST_POST" : target.instrumentKind === "CQS" ? "CQS" : detected);
          const raw = row.rawJsonData as Prisma.JsonObject;
          const byExternalId = new Map(target.questions.map(question => [question.externalId, question]));
          const answers = expanded.answers.flatMap(answer => {
            const question = byExternalId.get(answer.questionId);
            if (!question) return [];
            return [{ submissionId: row.id, questionId: question.id, value: answer.value === null ? "" : typeof answer.value === "object" ? JSON.stringify(answer.value) : String(answer.value), rawValue: answer.value === null ? Prisma.JsonNull : answer.value }];
          });
          await tx.answer.deleteMany({ where: { submissionId: row.id } });
          await tx.aggregatedResult.deleteMany({ where: { submissionId: row.id } });
          await tx.answer.createMany({ data: answers });
          await tx.submission.update({ where: { id: row.id }, data: {
            surveyDefinitionId: target.id, surveyMoment: moment, isPre: moment === "PRE" ? true : moment === "POST" ? false : null,
            status: "PENDIENTE_CONFIGURACION", processedAt: null,
            processingError: expanded.warnings.length ? `Envío guardado. Los resultados se calculan desde la edición en Cursos.; ${expanded.warnings.join("; ")}` : "Envío guardado. Los resultados se calculan desde la edición en Cursos.",
            responseFingerprint: responseFingerprint(target.id, expanded.answers),
            rawJsonData: { ...raw, ...(school !== undefined ? { schoolContext: schoolGroupingContext(school, payload.created_at, null) } : {}), ...(activity !== undefined ? { activityContext: activity } : {}), ...(demographics.gender.configured || demographics.age.configured ? { demographicContext: demographics } : {}) } as Prisma.InputJsonValue,
          } });
          await tx.auditLog.create({ data: { actorId: actor.id, actorUsername: actor.username, actorRole: actor.role, actorOrganizationId: actor.organizationId, action: "SURVEY_VERSION_REPROCESS", targetType: "Submission", targetId: row.id, metadata: { sourceDefinitionId: current.surveyDefinitionId, targetDefinitionId: target.id } } });
          return moment === "UNKNOWN" || expanded.warnings.length ? "pendingUpdated" as const : "updated" as const;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 });
        if (outcome === "pendingUpdated") { result.updated++; result.pending++; } else result[outcome]++;
      } catch (error) {
        result.errors++;
        await prisma.auditLog.create({ data: { ...auditActor, action: "SURVEY_VERSION_REPROCESS_ERROR", targetType: "Submission", targetId: item.id, metadata: { runId, formId, targetDefinitionId: target.id, reason: error instanceof Error && error.message === "La respuesta original requiere revisión" ? "ORIGINAL_REQUIRES_REVIEW" : "PROCESSING_FAILED" } } });
        console.warn(JSON.stringify({ event: "survey_version_reprocess_failed", submissionId: item.id, targetDefinitionId: target.id }));
      }
      processed++;
      if (processed % 10 === 0) await progress("RUNNING");
    }
    cursor = batch[batch.length - 1]!.id;
  }
  await progress("FINISHED");
  } catch (error) {
    await progress("INTERRUPTED").catch(() => {});
    throw error;
  }
  return result;
}
