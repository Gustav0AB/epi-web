import assert from "node:assert/strict";
import { JotformFormsQuerySchema } from "@epi/shared";
import { prisma } from "../../db/prisma.js";
import { surveysRepository } from "./surveys.repository.js";
import { listJotformForms } from "./surveys.service.js";

assert.deepEqual(JotformFormsQuerySchema.parse({}), { search: "", page: 1 });
for (const invalid of [{ page: "0" }, { page: "-1" }, { page: "1.5" }, { page: "NaN" }, { page: "100001" }, { accountId: "invalid" }, { search: "a".repeat(201) }, { page: ["1", "2"] }]) {
  assert.equal(JotformFormsQuerySchema.safeParse(invalid).success, false);
}
const accountId = "00000000-0000-4000-8000-000000000001";
const query = JotformFormsQuerySchema.parse({ accountId, search: "  Aprendizaje  ", page: "2" });
let total = 23;
const row = { setupDraft: null as unknown, id: "form-11", title: "Aprendizaje", status: "ENABLED", labelIds: ["label-a"], createdAt: null, updatedAt: null, submissionCount: 12, lastSubmission: null, url: null, accountId, account: { name: "Cuenta A" }, importedAt: new Date(), syncedAt: new Date("2026-11-01T12:00:00Z") };
let expectedSkip = 5;
prisma.jotformAccount.findMany = (async () => [{ id: accountId, excludedLabelIds: ["blocked"] }]) as unknown as typeof prisma.jotformAccount.findMany;
const expectedWhere = { AND: [{ OR: [{ accountId: null }, { NOT: [{ accountId, labelIds: { hasSome: ["blocked"] } }] }] }], accountId, OR: [{ title: { contains: "Aprendizaje", mode: "insensitive" } }, { id: { contains: "Aprendizaje" } }] };
const tx = { surveyDefinition: { findMany: async () => [{ jotformFormId: row.id }] }, jotformForm: {
  count: async (args: { where: unknown }) => { assert.deepEqual(args.where, { ...expectedWhere, id: "in" in (args.where as { id: object }).id ? { in: [row.id] } : { notIn: [row.id] } }); return "in" in (args.where as { id: object }).id ? total : 0; },
  findMany: async (args: { where: unknown; take: number; skip: number; orderBy: unknown }) => {
    assert.deepEqual(args.where, { ...expectedWhere, id: { in: [row.id] } });
    assert.equal(args.take, Math.min(5, total - expectedSkip));
    assert.equal(args.skip, expectedSkip);
    assert.deepEqual(args.orderBy, [{ title: "asc" }, { id: "asc" }]);
    return total ? [row] : [];
  },
} };
prisma.$transaction = (async (run: (client: typeof tx) => Promise<unknown>, options: { isolationLevel: string }) => {
  assert.equal(options.isolationLevel, "RepeatableRead");
  return run(tx);
}) as unknown as typeof prisma.$transaction;
prisma.surveyDefinition.findMany = (async (args: { where: { jotformFormId: { in: string[] } } }) => {
  assert.deepEqual(args.where.jotformFormId.in, total ? [row.id] : []);
  return [{ jotformFormId: row.id }];
}) as unknown as typeof prisma.surveyDefinition.findMany;
const result = await listJotformForms(query);
assert.deepEqual(result.meta, { page: 2, pageSize: 5, total: 23, totalPages: 5 });
assert.deepEqual(result.forms, [{ id: row.id, title: row.title, status: row.status, labelIds: ["label-a"], createdAt: null, updatedAt: null, submissionCount: 12, lastSubmission: null, url: null, accountName: "Cuenta A", registered: true, hasDraft: false, syncedAt: "2026-11-01T12:00:00.000Z" }]);
row.setupDraft = { instrumentName: "Borrador" };
assert.equal((await listJotformForms(query)).forms[0]!.hasDraft, true);
expectedSkip = 20;
assert.equal((await surveysRepository.listJotformForms({ ...query, page: 999 })).meta.page, 5);
total = 0;
expectedSkip = 0;
assert.deepEqual(await listJotformForms(query), { forms: [], meta: { page: 1, pageSize: 5, total: 0, totalPages: 0 } });
// Configured forms must remain first even when a page crosses the boundary.
const configured = ["configured-1", "configured-2", "configured-3"].map((id) => ({ ...row, id }));
const unconfigured = ["unconfigured-1", "unconfigured-2", "unconfigured-3"].map((id) => ({ ...row, id }));
tx.surveyDefinition.findMany = async () => configured.map(item => ({ jotformFormId: item.id }));
tx.jotformForm.count = async (args) => "in" in (args.where as { id: object }).id ? configured.length : unconfigured.length;
tx.jotformForm.findMany = async (args) => ("in" in (args.where as { id: object }).id ? configured : unconfigured).slice(args.skip, args.skip + args.take);
const firstPage = await surveysRepository.listJotformForms({ ...query, page: 1 });
assert.deepEqual(firstPage.forms.map(item => item.id), ["configured-1", "configured-2", "configured-3", "unconfigured-1", "unconfigured-2"]);
const secondPage = await surveysRepository.listJotformForms({ ...query, page: 2 });
assert.deepEqual(secondPage.forms.map(item => item.id), ["unconfigured-3"]);
console.log("✓ jotform-catalog self-check passed");

assert.equal(JotformFormsQuerySchema.safeParse({ labelId: "a" }).success, false);
assert.equal(JotformFormsQuerySchema.safeParse({ accountId, labelId: "a", withoutLabels: "true" }).success, false);
assert.equal(JotformFormsQuerySchema.safeParse({ withoutLabels: "false" }).success, false);
