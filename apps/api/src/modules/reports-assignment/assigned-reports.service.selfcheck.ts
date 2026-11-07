import assert from "node:assert";
import { assignedReportsService } from "./assigned-reports.service.js";
import { assignedReportsRepository } from "./assigned-reports.repository.js";
import { REPORT_DATA_RESOLVERS } from "./report-data-resolvers.js";
import { usersRepository } from "../users/users.repository.js";
import { prisma } from "../../db/prisma.js";

const now = new Date("2026-01-01T00:00:00.000Z");
const report = {
  id: "report-1",
  userId: "viewer-1",
  templateKey: "unit-template",
  title: "Reporte unitario",
  status: "PUBLISHED",
  filters: { season: "2026" },
  textContent: { achievements: "Listo" },
  version: 2,
  createdAt: now,
  updatedAt: now,
  user: { organizationId: "org-1", role: "REPORT_VIEWER", siteIds: ["site-1"] },
};

assignedReportsRepository.findById = (async (id: string) => {
  if (id === report.id) return report;
  if (id === "report-no-resolver") return { ...report, id, templateKey: "no-resolver" };
  return null;
}) as typeof assignedReportsRepository.findById;
assignedReportsRepository.listForUser = (async () => [report]) as typeof assignedReportsRepository.listForUser;
assignedReportsRepository.listScoped = (async () => [report]) as typeof assignedReportsRepository.listScoped;
assignedReportsRepository.listVersions = (async () => [
  { id: "v2", reportId: report.id, version: 2, title: report.title, status: "PUBLISHED", filters: report.filters, textContent: report.textContent, actorId: "admin-1", actorUsername: "admin", createdAt: now },
]) as unknown as typeof assignedReportsRepository.listVersions;
assignedReportsRepository.create = (async (dto) => ({ ...report, ...dto, id: "report-2", version: 1 })) as typeof assignedReportsRepository.create;
assignedReportsRepository.update = (async (_id, dto) => ({ ...report, ...dto, version: 3 })) as typeof assignedReportsRepository.update;
assignedReportsRepository.delete = (async () => {}) as typeof assignedReportsRepository.delete;
usersRepository.findById = (async (id: string) => ({ id, organizationId: "org-1", role: "ORG_ADMIN", siteIds: ["site-1"] })) as typeof usersRepository.findById;
prisma.site.findMany = (async (args: { where: { id: { in: string[] } } }) =>
  args.where.id.in.map((id) => ({ id }))) as unknown as typeof prisma.site.findMany;
REPORT_DATA_RESOLVERS["unit-template"] = async ({ siteId, scope }) => ({
  kpis: { siteId: siteId ?? "global", siteCount: scope.siteIds?.length ?? 0 },
  series: { rows: [{ value: 1 }] },
  tables: {},
});

const viewer = { sub: "viewer-1", username: "viewer", role: "report_viewer", organizationId: "org-1", featureKeys: [] };
const orgAdmin = { sub: "admin-1", username: "admin", role: "org_admin", organizationId: "org-1", featureKeys: [] };
const otherAdmin = { sub: "admin-2", username: "admin2", role: "org_admin", organizationId: "org-2", featureKeys: [] };

assert.equal((await assignedReportsService.listMine(viewer))[0]!.id, "report-1");
assert.equal((await assignedReportsService.listManaged(orgAdmin))[0]!.title, "Reporte unitario");
await assert.rejects(() => assignedReportsService.versions(otherAdmin, "report-1"), /Insufficient permissions/);

const data = await assignedReportsService.getData(viewer, "report-1", "site-1");
assert.deepEqual(data.kpis, { siteId: "site-1", siteCount: 1 });
assert.deepEqual(data.texts, { achievements: "Listo" });

await assert.rejects(() => assignedReportsService.getData(viewer, "report-1", "site-2"), /outside your assigned/);
usersRepository.findById = (async (id: string) => ({ id, organizationId: "org-1", role: "ORG_ADMIN", siteIds: ["site-2"] })) as typeof usersRepository.findById;
assert.equal((await assignedReportsService.getData(orgAdmin, "report-1")).kpis.siteCount, 0);
await assert.rejects(() => assignedReportsService.getData(orgAdmin, "report-1", "site-1"), /outside your assigned/);

const empty = await assignedReportsService.getData(viewer, "report-no-resolver");
assert.deepEqual(empty.kpis, {});

const courseDemo = await REPORT_DATA_RESOLVERS["course-impacts-2026mx-ncssm"]!({
  scope: { siteIds: undefined, excludedSurveyDefinitionIds: [] },
  filters: { demo: "course-impacts-2026mx-ncssm" },
});
assert.equal(courseDemo.kpis.overallImprovement, 15.1);
assert.equal(courseDemo.series.courseActivitySatisfaction!.length, 5);

await assert.rejects(() => assignedReportsService.create(otherAdmin, { userId: "viewer-1", templateKey: "unit-template", title: "x" }), /own organization/);
assert.equal((await assignedReportsService.update(orgAdmin, "report-1", { title: "Nuevo" })).version, 3);
await assignedReportsService.remove(orgAdmin, "report-1");

console.log("✓ assigned-reports.service self-check passed");

const draft = { ...report, id: "draft-report", status: "IN_REVIEW", textContent: { privateDraft: "Not approved" } };
let requestedStatus: string | undefined;
assignedReportsRepository.listForUser = (async (_id: string, status?: string) => {
  requestedStatus = status;
  return [report, draft].filter(row => !status || row.status === status.toUpperCase());
}) as typeof assignedReportsRepository.listForUser;
assignedReportsRepository.findById = (async (id: string) => id === draft.id ? draft : report) as unknown as typeof assignedReportsRepository.findById;
assignedReportsRepository.listVersions = (async () => [
  { id: "draft-version", reportId: report.id, version: 3, title: "Draft", status: "IN_REVIEW", filters: {}, textContent: draft.textContent, actorId: "admin-1", actorUsername: "admin", createdAt: now },
  { id: "published-version", reportId: report.id, version: 2, title: "Published", status: "PUBLISHED", filters: {}, textContent: report.textContent, actorId: "admin-1", actorUsername: "admin", createdAt: now },
]) as unknown as typeof assignedReportsRepository.listVersions;
assert.deepEqual((await assignedReportsService.listMine(viewer)).map(r => r.id), [report.id]);
assert.equal(requestedStatus, "published");
for (const status of ["pending", "in_review"]) assert.deepEqual(await assignedReportsService.listMine(viewer, status), []);
assert.equal((await assignedReportsService.listMine(orgAdmin)).length, 2);
assert.deepEqual((await assignedReportsService.versions(viewer, report.id)).map(v => v.id), ["published-version"]);
assert.equal((await assignedReportsService.versions(orgAdmin, report.id)).length, 2);
await assert.rejects(() => assignedReportsService.versions(viewer, draft.id), /not approved/);
await assert.rejects(() => assignedReportsService.getData(viewer, draft.id), /not approved/);
assert.equal((await assignedReportsService.versions(orgAdmin, draft.id)).length, 2);
await assert.rejects(() => assignedReportsService.versions(otherAdmin, draft.id), /Insufficient permissions/);
