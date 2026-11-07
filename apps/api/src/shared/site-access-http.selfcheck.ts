import type { CategoryImportPreview, CategoryImportResult } from "@epi/shared";
import assert from "node:assert/strict";
import { auditService } from "../modules/audit/audit.service.js";
import jwt from "jsonwebtoken";
import { createApp } from "../app.js";
import { prisma } from "../db/prisma.js";
import { env } from "../config/env.js";
import { surveysRepository } from "../modules/surveys/surveys.repository.js";

const user = { id: "viewer", username: "viewer", role: "FUNCTIONALITY_USER", organizationId: "org-a",
  siteIds: ["a1"], excludedSurveyDefinitionIds: [], isActive: true, mustChangePassword: false, sessionValidAfter: null };
prisma.user.findUnique = (async () => user) as unknown as typeof prisma.user.findUnique;
const sites = [{ id: "a1", organizationId: "org-a" }, { id: "a2", organizationId: "org-a" }, { id: "b1", organizationId: "org-b" }];
prisma.site.findMany = (async (args: { where: { organizationId?: string; id?: { in: string[] } } }) => sites.filter((site) =>
  (!args.where.organizationId || site.organizationId === args.where.organizationId) &&
  (!args.where.id || args.where.id.in.includes(site.id)))) as unknown as typeof prisma.site.findMany;
let seenParticipantWhere: unknown;
prisma.participant.findMany = (async (args: { where: unknown }) => {
  seenParticipantWhere = args.where;
  return [];
}) as unknown as typeof prisma.participant.findMany;
prisma.category.findMany = (async () => []) as typeof prisma.category.findMany;
let filterScope: unknown;
surveysRepository.getDefinitionFilters = async (_id, scope) => { filterScope = scope; return []; };
let questionScope: unknown;
surveysRepository.getDefinitionQuestions = async (_id, scope) => { questionScope = scope; return []; };
let seenScope: string[] | undefined;
surveysRepository.listDefinitions = (async (scope) => { seenScope = scope?.siteIds; return []; }) as typeof surveysRepository.listDefinitions;
surveysRepository.findSubmissionSite = (async () => ({ surveyDefinition: { siteId: "b1" } })) as unknown as typeof surveysRepository.findSubmissionSite;
const server = createApp().listen(0, "127.0.0.1");
await new Promise<void>((resolve) => server.once("listening", resolve));
const address = server.address();
assert(address && typeof address !== "string");
const base = `http://127.0.0.1:${address.port}`;
const token = jwt.sign({ sub: user.id, username: user.username, role: "functionality_user", organizationId: "org-a", featureKeys: ["surveys"] }, env.JWT_SECRET);
async function request(path: string, method = "GET") {
  return fetch(`${base}${path}`, { method, headers: { Authorization: `Bearer ${token}` } });
}
try {
  assert.equal((await fetch(`${base}/api/sites`)).status, 401);
  const res = await request("/api/sites?organizationId=org-b");
  assert.equal(res.status, 200);
  assert.deepEqual(((await res.json()) as { data: { id: string }[] }).data.map((site: { id: string }) => site.id), ["a1"]);
  assert.equal((await request("/api/surveys/definitions")).status, 200);
  assert.deepEqual(seenScope, ["a1"]);
  assert.equal((await request("/api/surveys/definitions/def1/questions")).status, 403);
  assert.equal(typeof questionScope, "undefined");
  const scoringToken = jwt.sign({ sub: user.id, username: user.username, role: "functionality_user", organizationId: "org-a", featureKeys: ["scoring"] }, env.JWT_SECRET);
  assert.equal((await fetch(`${base}/api/surveys/definitions/def1/questions`, { headers: { Authorization: `Bearer ${scoringToken}` } })).status, 200);
  assert.deepEqual((questionScope as { siteIds: string[] }).siteIds, ["a1"]);
  assert.equal((await request("/api/surveys/definitions/def1/filters")).status, 200);
  assert.deepEqual((filterScope as { siteIds: string[] }).siteIds, ["a1"]);
  assert.equal((await request("/api/surveys/groups")).status, 200);
  assert.deepEqual(seenParticipantWhere, { groupName: { not: null }, submissions: { some: { surveyDefinition: { siteId: { in: ["a1"] } } } } });
  assert.equal((await request("/api/reports/filters")).status, 200);
  assert.deepEqual(seenParticipantWhere, { school: { not: null }, submissions: { some: { surveyDefinition: { siteId: { in: ["a1"] } } } } });
  user.siteIds = ["a1", "a2", "b1"];
  await request("/api/surveys/definitions");
  assert.deepEqual(seenScope, ["a1", "a2"]);
  assert.equal((await request("/api/surveys/submission-b/reprocess", "POST")).status, 403);
  user.siteIds = [];
  await request("/api/surveys/definitions");
  assert.deepEqual(seenScope, []);
  assert.deepEqual(((await (await request("/api/sites")).json()) as { data: { id: string }[] }).data, []);
  // Permissions are reloaded for every request, even with the same signed token.
  user.siteIds = ["a2"];
  await request("/api/surveys/definitions");
  assert.deepEqual(seenScope, ["a2"]);
  const staleAdminToken = jwt.sign({ sub: user.id, username: user.username, role: "system_admin", organizationId: null, featureKeys: [] }, env.JWT_SECRET);
  const staleAdminResponse = await fetch(`${base}/api/sites`, { headers: { Authorization: `Bearer ${staleAdminToken}` } });
  assert.deepEqual(((await staleAdminResponse.json()) as { data: { id: string }[] }).data.map((site) => site.id), ["a2"]);
  assert.equal((await request("/api/surveys/jotform/forms")).status, 403);
  assert.equal((await request("/api/surveys/jotform/labels?accountId=00000000-0000-4000-8000-000000000001")).status, 403);
  assert.equal((await request("/api/surveys/definitions/def1/source-contract")).status, 403);
  assert.equal((await request("/api/surveys/jotform/forms/form1/migration")).status, 403);
  assert.equal((await request("/api/surveys/definitions/def1/migrate", "POST")).status, 403);
  assert.equal((await request("/api/surveys/definitions/def1/migration-settings", "PATCH")).status, 403);
  user.role = "SYSTEM_ADMIN";
  assert.equal((await request("/api/surveys/definitions/def1/migration-settings", "PATCH")).status, 400);
  prisma.surveyDefinition.findFirst = (async () => ({ id: "def1" })) as unknown as typeof prisma.surveyDefinition.findFirst;
  prisma.assistantImport.findUnique = (async () => null) as unknown as typeof prisma.assistantImport.findUnique;
  const migrationStatusResponse = await request("/api/surveys/jotform/forms/form1/migration");
  assert.equal(migrationStatusResponse.status, 200);
  assert.deepEqual((await migrationStatusResponse.json() as any).data, { definitionId: "def1", autoSync: false, autoAttempts: 0, nextAttemptAt: null, phase: "DOWNLOADING", status: "IDLE", total: 0, updated: 0, pending: 0, errors: 0, skipped: 0 });
  surveysRepository.definitionSourceContract = (async () => ({ id: "def1", version: 1, jotformFormId: "form1", sourceContract: { schemaVersion: 1 } })) as unknown as typeof surveysRepository.definitionSourceContract;
  const sourceContractResponse = await request("/api/surveys/definitions/def1/source-contract");
  assert.equal(sourceContractResponse.status, 200);
  assert.equal((await sourceContractResponse.json() as any).data.sourceContract.schemaVersion, 1);

  assert.equal((await request("/api/surveys/jotform/labels")).status, 400);
  let seenCatalogQuery: unknown;
  surveysRepository.listJotformForms = async (query) => {
    seenCatalogQuery = query;
    return { forms: [], meta: { total: 0, page: 1, pageSize: 10, totalPages: 0 } };
  };
  surveysRepository.registeredJotformFormIds = async () => new Set();
  const catalog = await request("/api/surveys/jotform/forms?search=School&page=2&accountId=00000000-0000-4000-8000-000000000001");
  assert.equal(catalog.status, 200);
  assert.deepEqual(seenCatalogQuery, { search: "School", page: 2, accountId: "00000000-0000-4000-8000-000000000001" });
  for (const query of ["page=0", "page=-1", "page=1.5", "accountId=wrong"]) {
    assert.equal((await request(`/api/surveys/jotform/forms?${query}`)).status, 400);
  }
  user.role = "FUNCTIONALITY_USER";
  assert.equal((await request("/api/surveys/jotform/forms/form1/setup")).status, 403);
  assert.equal((await request("/api/surveys/schools")).status, 403);
  assert.equal((await request("/api/surveys/jotform/labels?accountId=00000000-0000-4000-8000-000000000001")).status, 403);
  user.role = "SYSTEM_ADMIN";
  assert.equal((await request("/api/surveys/jotform/labels")).status, 400);
  const invalidSetup = await fetch(`${base}/api/surveys/jotform/forms/form1/setup`, {
    method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ revision: -1, draft: {} }),
  });
  assert.equal(invalidSetup.status, 400);
  const categoryRows = [{ name: "Existing", subcategory: null as string | null }];
  const categoryDb = {
    findMany: async (args: { where: { organizationId: string } }) => {
      assert.equal(args.where.organizationId, "org-a");
      return categoryRows;
    },
    create: async (args: { data: { name: string; subcategory: string | null; organizationId: string } }) => {
      assert.equal(args.data.organizationId, "org-a");
      categoryRows.push({ name: args.data.name, subcategory: args.data.subcategory });
    },
  };
  prisma.category.findMany = categoryDb.findMany as unknown as typeof prisma.category.findMany;
  prisma.$transaction = (async (run: (tx: unknown) => Promise<unknown>, options: { isolationLevel: string }) => {
    assert.equal(options.isolationLevel, "Serializable");
    return run({ category: categoryDb });
  }) as unknown as typeof prisma.$transaction;
  auditService.record = async () => {};
  const importCsv = (preview: boolean, csv: string) => fetch(`${base}/api/categories/import${preview ? "/preview" : ""}?organizationId=org-b`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "text/csv" }, body: csv,
  });
  user.role = "FUNCTIONALITY_USER";
  assert.equal((await importCsv(true, "category,subcategory\nNew,")).status, 403);
  user.role = "ORG_ADMIN";
  const csv = "category,subcategory\nExisting,\nNew,\nNew,";
  const previewResponse = await importCsv(true, csv);
  assert.equal(previewResponse.status, 200);
  assert.equal(((await previewResponse.json()) as { data: CategoryImportPreview }).data.additions.length, 1);
  assert.equal(categoryRows.length, 1, "Preview must not write");
  const imported = await importCsv(false, csv);
  assert.equal(imported.status, 200);
  assert.deepEqual(((await imported.json()) as { data: CategoryImportResult }).data, { applied: 1, skipped: 2, duplicates: 2, errors: [] });
  assert.equal(categoryRows.length, 2);
  assert.equal(((await (await importCsv(false, csv)).json()) as { data: CategoryImportResult }).data.applied, 0);
  assert.equal((await importCsv(false, 'category,subcategory\n"bad,')).status, 400);
  assert.equal(categoryRows.length, 2);
  console.log("✓ site-access HTTP self-check passed");
} finally {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
