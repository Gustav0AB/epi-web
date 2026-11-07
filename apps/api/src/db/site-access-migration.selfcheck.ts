import assert from "node:assert/strict";
import { planSiteAccessMigration } from "./site-access-migration.js";

const sites = [
  { id: "a2", organizationId: "org-a" },
  { id: "b1", organizationId: "org-b" },
  { id: "a1", organizationId: "org-a" },
  { id: "orphan", organizationId: null },
];
const user = {
  id: "user-a", role: "FUNCTIONALITY_USER", organizationId: "org-a",
  siteIds: ["b1"], excludedSiteIds: [] as string[],
};
const before = JSON.stringify({ user, sites });
for (const role of ["FUNCTIONALITY_USER", "ORG_ADMIN", "REPORT_VIEWER"]) {
  const plan = planSiteAccessMigration([{ ...user, role }], sites);
  assert.equal(plan.ready, true);
  assert.deepEqual(plan.assignments[0]?.siteIds, ["a1", "a2"]);
  assert.deepEqual(plan.assignments[0]?.previousReferenceSiteIds, ["b1"]);
}
assert.equal(JSON.stringify({ user, sites }), before);
assert.deepEqual(
  planSiteAccessMigration([{ ...user, excludedSiteIds: ["a2", "b1", "deleted"] }], sites).assignments[0]?.siteIds,
  ["a1"],
);
for (const blocked of [
  { ...user, organizationId: null },
  { ...user, organizationId: "empty-org" },
  { ...user, excludedSiteIds: ["a1", "a2"] },
]) {
  const plan = planSiteAccessMigration([user, blocked], sites);
  assert.equal(plan.ready, false);
  assert.deepEqual(plan.assignments[1]?.siteIds, []);
  assert.equal(plan.assignments[1]?.blocker,
    blocked.organizationId === null ? "MISSING_ORGANIZATION" : "NO_ACCESSIBLE_SITES");
}
const adminPlan = planSiteAccessMigration([{ ...user, role: "SYSTEM_ADMIN", organizationId: null }], sites);
assert.equal(adminPlan.ready, true);
assert.deepEqual(adminPlan.systemAdminIds, [user.id]);
assert.deepEqual(adminPlan.assignments, []);
assert.equal(planSiteAccessMigration([], []).ready, true);
console.log("✓ site-access-migration self-check passed");
