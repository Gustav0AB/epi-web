import assert from "node:assert/strict";
import { prisma } from "../db/prisma.js";
import { allowedSiteIds } from "./site-scope.js";

prisma.site.findMany = (async (args: { where: { organizationId: string; id: { in: string[] } } }) => {
  assert.equal(args.where.organizationId, "org-a");
  return ["a1", "a2"].filter((id) => args.where.id.in.includes(id)).map((id) => ({ id }));
}) as unknown as typeof prisma.site.findMany;
assert.equal(await allowedSiteIds({ role: "system_admin", organizationId: null, siteIds: [] }), undefined);
for (const role of ["org_admin", "functionality_user", "report_viewer"]) {
  assert.deepEqual(await allowedSiteIds({ role, organizationId: "org-a", siteIds: ["a1"] }), ["a1"]);
  assert.deepEqual(await allowedSiteIds({ role, organizationId: "org-a", siteIds: ["a1", "a2", "foreign"] }), ["a1", "a2"]);
  assert.deepEqual(await allowedSiteIds({ role, organizationId: "org-a", siteIds: [] }), []);
  assert.deepEqual(await allowedSiteIds({ role, organizationId: null, siteIds: ["a1"] }), []);
  assert.deepEqual(await allowedSiteIds({ role, organizationId: "org-a", siteIds: ["deleted"] }), []);
}
console.log("✓ site-scope self-check passed");
