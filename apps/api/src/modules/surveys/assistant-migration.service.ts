import type { Prisma } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { prisma } from "../../db/prisma.js";
import { z } from "zod";
import { AnswerJsonSchema } from "./surveys.schema.js";
import { JotformSubmissionSchema, jotformClient } from "./jotform-client.js";
import { groupMigratedCourseResponse } from "./course-editions.service.js";
import { surveysService } from "./surveys.service.js";

async function formResponses(formId: string) {
  const form = await prisma.jotformForm.findUnique({ where: { id: formId }, include: { account: true } });
  if (!form?.account) throw Object.assign(new Error("El formulario no tiene una cuenta Jotform disponible"), { statusCode: 400 });
  return jotformClient.listSubmissions(formId, form.account.apiKey, {});
}

export async function assistantResponseCount(formId: string) {
  return { total: (await formResponses(formId)).length };
}

const leaseMs = 120_000;
const syncIntervalMs = 6 * 60 * 60_000;
function dueImports(now: Date): Prisma.AssistantImportWhereInput {
  return { nextAttemptAt: { lte: now }, OR: [
    { status: { in: ["IDLE", "FINISHED"] }, autoSync: true },
    { status: "INTERRUPTED", autoAttempts: { lt: 5 } },
    { status: "RUNNING", autoAttempts: { lt: 5 }, leaseUntil: { lt: now } },
  ] };
}
const busy = () => Object.assign(new Error("La migración sigue en curso; consulta su avance"), { statusCode: 409 });

export async function assistantMigrationStatus(formId: string) {
  const definition = await prisma.surveyDefinition.findFirst({ where: { jotformFormId: formId }, orderBy: { version: "desc" }, select: { id: true } });
  if (!definition) throw Object.assign(new Error("Instrumento no encontrado"), { statusCode: 404 });
  const job = await prisma.assistantImport.findUnique({ where: { definitionId: definition.id }, select: { status: true, autoSync: true, autoAttempts: true, nextAttemptAt: true, leaseUntil: true, downloadComplete: true, total: true, updated: true, pending: true, errors: true, skipped: true } });
  return { definitionId: definition.id, autoSync: job?.autoSync ?? false, autoAttempts: job?.autoAttempts ?? 0, nextAttemptAt: job?.nextAttemptAt && (job.status === "FINISHED" ? job.autoSync : job.autoAttempts < 5) ? job.nextAttemptAt.toISOString() : null, phase: job?.downloadComplete ? "PROCESSING" : "DOWNLOADING", status: job?.status === "RUNNING" && (!job.leaseUntil || job.leaseUntil < new Date()) ? "INTERRUPTED" : job?.status ?? "IDLE", total: job?.total ?? 0, updated: job?.updated ?? 0, pending: job?.pending ?? 0, errors: job?.errors ?? 0, skipped: job?.skipped ?? 0 };
}

async function currentDefinition(definitionId: string) {
  const definition = await prisma.surveyDefinition.findUnique({ where: { id: definitionId }, select: { id: true, jotformFormId: true, instrumentKind: true } });
  if (!definition) throw Object.assign(new Error("Instrumento no encontrado"), { statusCode: 404 });
  const latest = await prisma.surveyDefinition.findFirst({ where: { jotformFormId: definition.jotformFormId }, orderBy: { version: "desc" }, select: { id: true } });
  if (latest?.id !== definitionId) throw Object.assign(new Error("El instrumento tiene una versión más reciente; revisa su configuración antes de migrar"), { statusCode: 409, code: "STALE_INSTRUMENT_VERSION" });
  return definition;
}

export async function setAssistantAutoSync(definitionId: string, autoSync: boolean) {
  await currentDefinition(definitionId);
  const nextAttemptAt = new Date();
  await prisma.assistantImport.upsert({ where: { definitionId }, create: { definitionId, autoSync, nextAttemptAt: autoSync ? nextAttemptAt : null }, update: { autoSync, ...(autoSync ? { nextAttemptAt, autoAttempts: 0 } : {}) } });
  return { autoSync };
}

export async function migrateAssistantResponses(definitionId: string, automatic = false) {
  const definition = await currentDefinition(definitionId);
  await prisma.assistantImport.upsert({ where: { definitionId }, create: { definitionId }, update: {} });
  const owner = randomUUID();
  const claimedJob = await prisma.$transaction(async tx => {
    const claimed = await tx.assistantImport.updateMany({ where: { definitionId, OR: [{ owner: null }, { leaseUntil: { lt: new Date() } }], ...(automatic ? { AND: [dueImports(new Date())] } : {}) }, data: { owner, leaseUntil: new Date(Date.now() + leaseMs), nextAttemptAt: new Date(Date.now() + leaseMs), autoAttempts: automatic ? { increment: 1 } : 0 } });
    if (!claimed.count) throw busy();
    const previous = await tx.assistantImport.findUniqueOrThrow({ where: { definitionId } });
    await tx.assistantImport.updateMany({ where: { definitionId, owner }, data: { status: "RUNNING" } });
    return previous;
  });
  let lostLease = false;
  let autoAttempts = automatic ? 1 : 0;
  const heartbeat = setInterval(() => {
    void prisma.assistantImport.updateMany({ where: { definitionId, owner }, data: { leaseUntil: new Date(Date.now() + leaseMs) } }).then(result => { if (!result.count) lostLease = true; }).catch(() => { lostLease = true; });
  }, leaseMs / 4);
  heartbeat.unref();
  try {
    let job = claimedJob;
    autoAttempts = job.autoAttempts;
    const resume = Boolean(job.runId) && job.status !== "FINISHED";
    const runId = resume ? job.runId! : randomUUID();
    const started = await prisma.assistantImport.updateMany({ where: { definitionId, owner }, data: {
      status: "RUNNING", runId, updated: 0, errors: 0, pending: 0, skipped: 0,
      ...(!resume ? { total: 0, downloadOffset: 0, downloadComplete: false, lastPageIds: [] } : {}),
    } });
    if (!started.count || lostLease) throw busy();
    job = await prisma.assistantImport.findUniqueOrThrow({ where: { definitionId } });
    if (!job.downloadComplete) {
      const form = await prisma.jotformForm.findUnique({ where: { id: definition.jotformFormId }, include: { account: true } });
      if (!form?.account) throw Object.assign(new Error("El formulario no tiene una cuenta Jotform disponible"), { statusCode: 400 });
      let offset = job.downloadOffset;
      if (offset > 0) {
        const boundary = await jotformClient.listSubmissionPage(definition.jotformFormId, form.account.apiKey, { offset: offset - job.lastPageIds.length });
        // shortcut: boundary checks cannot detect every concurrent remote edit; run a fresh reconciliation after the import finishes.
        if (JSON.stringify(boundary.map(row => row.id)) !== JSON.stringify(job.lastPageIds)) {
          offset = 0;
          await prisma.$transaction(async tx => {
            const reset = await tx.assistantImport.updateMany({ where: { definitionId, owner }, data: { downloadOffset: 0, lastPageIds: [], total: 0 } });
            if (!reset.count) throw busy();
            await tx.assistantImportItem.updateMany({ where: { definitionId, runId }, data: { runId: null } });
          });
        }
      }
      while (true) {
        if (lostLease) throw busy();
        const rows = await jotformClient.listSubmissionPage(definition.jotformFormId, form.account.apiKey, { offset });
        if (rows.length === 0) {
          const done = await prisma.assistantImport.updateMany({ where: { definitionId, owner }, data: { downloadComplete: true } });
          if (!done.count) throw busy();
          break;
        }
        const ids = [...new Set(rows.map(row => row.id))];
        await prisma.$transaction(async tx => {
          const owned = await tx.assistantImport.updateMany({ where: { definitionId, owner }, data: { leaseUntil: new Date(Date.now() + leaseMs) } });
          if (!owned.count || lostLease) throw busy();
          const seen = await tx.assistantImportItem.count({ where: { definitionId, runId, submissionId: { in: ids } } });
          if (seen === ids.length) throw Object.assign(new Error("Jotform submissions: la paginación no avanza"), { statusCode: 502 });
          for (const row of rows) {
            const key = { definitionId, submissionId: row.id };
            const sourceJson = z.record(AnswerJsonSchema).parse(row);
            await tx.assistantImportItem.upsert({ where: { definitionId_submissionId: key },
              create: { ...key, runId, sourceJson, fingerprint: "", outcome: "downloaded" }, update: { runId, sourceJson } });
          }
          const total = await tx.assistantImportItem.count({ where: { definitionId, runId } });
          await tx.assistantImport.updateMany({ where: { definitionId, owner }, data: { downloadOffset: offset + rows.length, lastPageIds: rows.map(row => row.id), total } });
        }, { timeout: 60_000 });
        offset += rows.length;
      }
    }
    const total = await prisma.assistantImportItem.count({ where: { definitionId, runId } });
    const result = { total, updated: 0, errors: 0, pending: 0, skipped: 0 };
    let after = "";
    while (true) {
      const batch = await prisma.assistantImportItem.findMany({ where: { definitionId, runId, submissionId: { gt: after } }, orderBy: { submissionId: "asc" }, take: 100 });
      if (!batch.length) break;
      for (const previous of batch) {
        const row = JotformSubmissionSchema.parse(previous.sourceJson);
        if (lostLease) throw busy();
        const fingerprint = createHash("sha256").update(JSON.stringify(row)).digest("hex");
        const key = { definitionId, submissionId: row.id };
        let outcome: "updated" | "pending" | "errors" | "skipped";
        try {
          const existing = await prisma.submission.findUnique({ where: { jotformSubmissionId: row.id }, select: { status: true, surveyDefinitionId: true } });
          // Completed responses may already support published results; preserve them.
          if (existing?.status === "COMPLETADO" || (existing?.surveyDefinitionId && existing.surveyDefinitionId !== definitionId)) outcome = "skipped";
          else if (existing?.status === "PROCESADO" && previous?.fingerprint === fingerprint && previous.outcome === "updated") outcome = "updated";
          else {
            const processed = await surveysService.ingest(row);
            outcome = processed.status === "PROCESADO" ? "updated" : processed.status === "PENDIENTE_CONFIGURACION" ? "pending" : "errors";
          }
        } catch { outcome = "errors"; }
        result[outcome]++;
        // Persist the checkpoint only while we still own the lease. Ingest itself is idempotent after a crash.
        await prisma.$transaction(async tx => {
          const owned = await tx.assistantImport.updateMany({ where: { definitionId, owner }, data: { ...result, leaseUntil: new Date(Date.now() + leaseMs) } });
          if (!owned.count) throw busy();
          if (definition.instrumentKind === "LEARNING" && (outcome === "updated" || outcome === "pending")) await groupMigratedCourseResponse(tx, definitionId, row.id);
          await tx.assistantImportItem.upsert({ where: { definitionId_submissionId: key }, create: { ...key, fingerprint, outcome }, update: { fingerprint, outcome } });
        });
      }
      after = batch[batch.length - 1]!.submissionId;
    }
    const finished = await prisma.assistantImport.updateMany({ where: { definitionId, owner }, data: { status: "FINISHED", owner: null, leaseUntil: null, autoAttempts: 0, nextAttemptAt: new Date(Date.now() + syncIntervalMs) } });
    if (!finished.count) throw busy();
    return result;
  } catch (error) {
    await prisma.assistantImport.updateMany({ where: { definitionId, owner }, data: { status: "INTERRUPTED", owner: null, leaseUntil: null, nextAttemptAt: autoAttempts >= 5 ? null : new Date(Date.now() + 2 ** autoAttempts * 60_000) } });
    throw error;
  } finally { clearInterval(heartbeat); }
}

export async function reconcileDueAssistantImport() {
  const job = await prisma.assistantImport.findFirst({ where: dueImports(new Date()), orderBy: { nextAttemptAt: "asc" }, select: { definitionId: true } });
  if (!job) return;
  try { await migrateAssistantResponses(job.definitionId, true); }
  catch (error) {
    const failure = error as { code?: string; statusCode?: number };
    if (failure.code === "STALE_INSTRUMENT_VERSION") {
      await prisma.assistantImport.updateMany({ where: { definitionId: job.definitionId, OR: [{ owner: null }, { leaseUntil: { lt: new Date() } }] }, data: { autoSync: false, nextAttemptAt: null } });
    } else if (failure.statusCode !== 409) {
      console.warn("Assistant import deferred", { definitionId: job.definitionId, statusCode: failure.statusCode ?? 500 });
    }
  }
}
