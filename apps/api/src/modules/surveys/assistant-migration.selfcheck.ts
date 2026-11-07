import assert from "node:assert/strict";
import { prisma } from "../../db/prisma.js";
import { jotformClient } from "./jotform-client.js";
import { surveysService } from "./surveys.service.js";
import { assistantMigrationStatus, assistantResponseCount, migrateAssistantResponses } from "./assistant-migration.service.js";
import { validateSiteSetup } from "./survey-setup.service.js";
import { CreateSiteSchema, SurveySetupDraftSchema, AssistantSyncSettingsSchema } from "@epi/shared";

prisma.jotformForm.findUnique = (async () => ({ id: "form", account: { apiKey: "test-key" } })) as unknown as typeof prisma.jotformForm.findUnique;
prisma.surveyDefinition.findUnique = (async () => ({ id: "definition", jotformFormId: "form" })) as unknown as typeof prisma.surveyDefinition.findUnique;
prisma.surveyDefinition.findFirst = (async () => ({ id: "definition" })) as unknown as typeof prisma.surveyDefinition.findFirst;
// A small persistence fake exercises restart/retry behavior without a database.
let job: any = null;
const checkpoints = new Map<string, any>();
prisma.assistantImport.upsert = (async () => { job ??= { owner: null, status: "IDLE", runId: null, downloadOffset: 0, downloadComplete: false, lastPageIds: [], total: 0, autoSync: false, autoAttempts: 0, nextAttemptAt: null }; return job; }) as unknown as typeof prisma.assistantImport.upsert;
prisma.assistantImport.updateMany = (async ({ where, data }: any) => {
  if (!job || (where.owner && job.owner !== where.owner) || (where.OR && job.owner && job.leaseUntil >= new Date())) return { count: 0 };
  Object.assign(job, { ...data, ...(data.autoAttempts?.increment ? { autoAttempts: job.autoAttempts + data.autoAttempts.increment } : {}) });
  return { count: 1 };
}) as unknown as typeof prisma.assistantImport.updateMany;
prisma.assistantImport.findUnique = (async () => structuredClone(job)) as unknown as typeof prisma.assistantImport.findUnique;
prisma.assistantImport.findUniqueOrThrow = (async () => structuredClone(job)) as unknown as typeof prisma.assistantImport.findUniqueOrThrow;
const items = (where: any) => [...checkpoints.values()].filter(item =>
  (where.runId === undefined || item.runId === where.runId) &&
  (!where.submissionId?.in || where.submissionId.in.includes(item.submissionId)) &&
  (!where.submissionId?.gt || item.submissionId > where.submissionId.gt));
prisma.assistantImportItem.count = (async ({ where }: any) => items(where).length) as typeof prisma.assistantImportItem.count;
prisma.assistantImportItem.findMany = (async ({ where, take }: any) => structuredClone(items(where).sort((a, b) => a.submissionId < b.submissionId ? -1 : 1).slice(0, take))) as unknown as typeof prisma.assistantImportItem.findMany;
prisma.assistantImportItem.updateMany = (async ({ where, data }: any) => { const rows = items(where); rows.forEach(row => Object.assign(row, data)); return { count: rows.length }; }) as typeof prisma.assistantImportItem.updateMany;
prisma.assistantImportItem.upsert = (async ({ create, update }: any) => {
  const row = checkpoints.get(create.submissionId);
  if (row) Object.assign(row, update); else checkpoints.set(create.submissionId, structuredClone(create));
  return row ?? create;
}) as unknown as typeof prisma.assistantImportItem.upsert;
prisma.$transaction = (async (callback: any) => {
  const savedJob = structuredClone(job), savedItems = structuredClone(checkpoints);
  try { return await callback(prisma); }
  catch (error) { job = savedJob; checkpoints.clear(); savedItems.forEach((value: any, key: string) => checkpoints.set(key, value)); throw error; }
}) as typeof prisma.$transaction;
let ids = ["ok", "pending", "error", "throw", "completed", "other"];
jotformClient.listSubmissions = async () => ids.map(id => ({ id, form_id: "form", created_at: "2026-11-04", answers: {} }));
jotformClient.listSubmissionPage = async (formId, key, filters) => (await jotformClient.listSubmissions(formId, key, {})).slice(filters.offset ?? 0, (filters.offset ?? 0) + (filters.limit ?? 1000));
prisma.submission.findUnique = (async ({ where }: { where: { jotformSubmissionId: string } }) => where.jotformSubmissionId === "completed" ? { status: "COMPLETADO", surveyDefinitionId: "definition" } : where.jotformSubmissionId === "other" ? { status: "PROCESADO", surveyDefinitionId: "other" } : writes.has(where.jotformSubmissionId) ? { status: "PROCESADO", surveyDefinitionId: "definition" } : null) as unknown as typeof prisma.submission.findUnique;
const writes = new Set<string>();
const attempts: string[] = [];
surveysService.ingest = async body => {
  const id = (body as { id: string }).id;
  attempts.push(id);
  if (id === "throw") throw new Error("Individual failure");
  assert(!["completed", "other"].includes(id));
  writes.add(id);
  return id === "pending" ? { submissionId: id, status: "PENDIENTE_CONFIGURACION", reason: "Missing rules" } : id === "error" ? { submissionId: id, status: "ERROR", reason: "Invalid answer" } : { submissionId: id, status: "PROCESADO", resultCount: 1 };
};
assert.deepEqual(await assistantResponseCount("form"), { total: 6 });
const partial = { total: 6, updated: 1, pending: 1, errors: 2, skipped: 2 };
assert.deepEqual(await migrateAssistantResponses("definition"), partial);
assert.deepEqual(await migrateAssistantResponses("definition"), partial);
assert.equal(writes.size, 3);
assert.equal(attempts.filter(id => id === "ok").length, 1, "Unchanged successes must not be ingested twice");
assert.equal(attempts.filter(id => id === "pending").length, 2, "Pending rows must be retried");
assert.equal((await assistantMigrationStatus("form")).status, "FINISHED");
job.owner = "dead-process"; job.status = "RUNNING"; job.leaseUntil = new Date(0);
assert.equal((await assistantMigrationStatus("form")).status, "INTERRUPTED");
assert.deepEqual(await migrateAssistantResponses("definition"), partial);
assert.equal(attempts.filter(id => id === "ok").length, 1, "Recovery uses persisted checkpoints");
const listResponses = jotformClient.listSubmissions;
jotformClient.listSubmissions = async (...args) => {
  const rows = await listResponses(...args);
  job.owner = "replacement-worker";
  return rows;
};
const attemptsBeforeLeaseLoss = attempts.length;
await assert.rejects(() => migrateAssistantResponses("definition"), { statusCode: 409 });
assert.equal(attempts.length, attemptsBeforeLeaseLoss, "A worker that lost ownership during download cannot ingest");
assert.equal(job.owner, "replacement-worker", "The old worker cannot release the replacement worker's reservation");
job.owner = null; job.leaseUntil = null;
jotformClient.listSubmissions = listResponses;
ids = ["crash-first", "crash-last"];
const saveProgress = prisma.assistantImport.updateMany;
let failCheckpoint = true;
prisma.assistantImport.updateMany = (async (args: any) => {
  if (failCheckpoint && args.data.updated === 2 && args.data.total === 2) { failCheckpoint = false; throw new Error("Database interrupted checkpoint"); }
  return saveProgress(args);
}) as typeof saveProgress;
await assert.rejects(() => migrateAssistantResponses("definition"), /Database interrupted checkpoint/);
assert.equal(job.status, "INTERRUPTED");
assert.equal(checkpoints.has("crash-first"), true);
assert.equal(checkpoints.get("crash-last").outcome, "downloaded");
prisma.assistantImport.updateMany = saveProgress;
assert.deepEqual(await migrateAssistantResponses("definition"), { total: 2, updated: 2, pending: 0, errors: 0, skipped: 0 });
assert.equal(attempts.filter(id => id === "crash-first").length, 1);
assert.equal(attempts.filter(id => id === "crash-last").length, 2, "A crash after ingest before checkpoint replays idempotently");
ids = ["ok"];
assert.deepEqual(await migrateAssistantResponses("definition"), { total: 1, updated: 1, pending: 0, errors: 0, skipped: 0 });
ids = [];
assert.equal((await migrateAssistantResponses("definition")).total, 0);
const originalPage = jotformClient.listSubmissionPage;
let pages = ["page-a", "page-b", "page-c"];
let pageCalls: number[] = [];
let failDownload = true;
jotformClient.listSubmissionPage = async (_form, _key, { offset = 0 }) => {
  pageCalls.push(offset);
  if (offset === 2 && failDownload) throw new Error("Download interrupted");
  return pages.slice(offset, offset + 1).map(id => ({ id, form_id: "form", created_at: "2026-11-04", answers: { nested: { value: [false, null, 0] } } }));
};
await assert.rejects(() => migrateAssistantResponses("definition"), /Download interrupted/);
assert.equal(job.downloadOffset, 2);
assert.equal(job.downloadComplete, false);
assert.equal(job.total, 2);
assert.deepEqual(checkpoints.get("page-a").sourceJson.answers, { nested: { value: [false, null, 0] } });
assert.equal(attempts.includes("page-a"), false, "Incomplete downloads must not be processed");
assert.equal((await assistantMigrationStatus("form")).phase, "DOWNLOADING");
failDownload = false; pageCalls = [];
assert.deepEqual(await migrateAssistantResponses("definition"), { total: 3, updated: 3, pending: 0, errors: 0, skipped: 0 });
assert.deepEqual(pageCalls, [1, 2, 3], "Recovery checks only the last saved page before resuming the cursor");
assert.equal(job.downloadComplete, true);
// A moved boundary must restart discovery, retaining ID-based ingest checkpoints.
failDownload = true; pageCalls = [];
await assert.rejects(() => migrateAssistantResponses("definition"), /Download interrupted/);
pages = ["inserted", ...pages]; failDownload = false; pageCalls = [];
assert.deepEqual(await migrateAssistantResponses("definition"), { total: 4, updated: 4, pending: 0, errors: 0, skipped: 0 });
assert.deepEqual(pageCalls, [1, 0, 1, 2, 3, 4]);
assert.equal(attempts.filter(id => id === "page-a").length, 1);
// A provider that repeats pages cannot advance a durable cursor indefinitely.
jotformClient.listSubmissionPage = async () => [{ id: "repeated", form_id: "form", created_at: "2026-11-04", answers: {} }];
await assert.rejects(() => migrateAssistantResponses("definition"), /paginación no avanza/);
assert.equal(job.downloadOffset, 1);
// An incomplete pre-cursor job starts a fresh discovery without losing previous outcomes.
job.runId = null; job.status = "INTERRUPTED";
jotformClient.listSubmissionPage = originalPage;
ids = [];
assert.equal((await migrateAssistantResponses("definition")).total, 0);
ids = Array.from({ length: 101 }, (_, index) => `batch-${String(index).padStart(3, "0")}`);
assert.deepEqual(await migrateAssistantResponses("definition"), { total: 101, updated: 101, pending: 0, errors: 0, skipped: 0 });
assert(ids.every(id => attempts.filter(value => value === id).length === 1), "Processing must cross persisted batch boundaries exactly once");
let release!: () => void;
const waiting = new Promise<void>(resolve => { release = resolve; });
jotformClient.listSubmissions = async () => { await waiting; throw new Error("Remote failed"); };
const inFlight = migrateAssistantResponses("definition");
await new Promise(resolve => setImmediate(resolve));
assert.equal((await assistantMigrationStatus("form")).status, "RUNNING");
await assert.rejects(() => migrateAssistantResponses("definition"), { statusCode: 409 });
release();
await assert.rejects(() => inFlight, /Remote failed/);
await assert.rejects(() => migrateAssistantResponses("definition"), /Remote failed/);

prisma.surveyDefinition.findFirst = (async () => ({ id: "newer" })) as unknown as typeof prisma.surveyDefinition.findFirst;
await assert.rejects(() => migrateAssistantResponses("definition"), { statusCode: 409 });

assert.equal(AssistantSyncSettingsSchema.safeParse({ autoSync: true }).success, true);
assert.equal(AssistantSyncSettingsSchema.safeParse({ autoSync: "true" }).success, false);
assert.equal(AssistantSyncSettingsSchema.safeParse({ autoSync: false, interval: 1 }).success, false);

assert.equal(CreateSiteSchema.safeParse({ name: "Site", programs: ["Local", "local", "Otro"] }).success, false);
assert.equal(CreateSiteSchema.safeParse({ name: "Site", programs: ["Local"] }).success, false);
prisma.site.findUnique = (async () => ({ id: "site", isActive: true, programs: ["Local", "Otro"], activityTypes: ["Curso"] })) as unknown as typeof prisma.site.findUnique;
const draft = SurveySetupDraftSchema.parse({ siteId: "00000000-0000-4000-8000-000000000001", type: "OTHER", programName: "Otro", instrumentKind: "CQS", activityType: "Curso", instrumentName: "Form", activityName: "Trip" });
await validateSiteSetup(draft);
await assert.rejects(() => validateSiteSetup({ ...draft, programName: "Other site program" }), { statusCode: 400 });
await assert.rejects(() => validateSiteSetup({ ...draft, activityType: "Other site activity" }), { statusCode: 400 });
for (const instrumentKind of ["LEARNING", "FOLLOW_UP", "CQS"]) assert.equal(SurveySetupDraftSchema.safeParse({ ...draft, instrumentKind }).success, true);
assert.equal(SurveySetupDraftSchema.safeParse({ ...draft, instrumentKind: "UNKNOWN" }).success, false);
console.log("✓ assistant migration outcomes, retries, concurrency and site catalogs passed");
