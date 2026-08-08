import assert from "node:assert";
import { prisma } from "../db/prisma.js";
import { allowedSiteIds } from "./site-scope.js";

const ORG_A = "org-a";
const SITES = [{ id: "site-1" }, { id: "site-2" }, { id: "site-3" }];

prisma.site.findMany = (async () => SITES) as typeof prisma.site.findMany;

assert.strictEqual(
  await allowedSiteIds({ role: "system_admin", organizationId: null, excludedSiteIds: [] }),
  undefined
);

assert.deepStrictEqual(
  await allowedSiteIds({ role: "org_admin", organizationId: ORG_A, excludedSiteIds: [] }),
  ["site-1", "site-2", "site-3"]
);

assert.deepStrictEqual(
  await allowedSiteIds({ role: "functionality_user", organizationId: ORG_A, excludedSiteIds: ["site-2"] }),
  ["site-1", "site-3"]
);

assert.deepStrictEqual(
  await allowedSiteIds({ role: "report_viewer", organizationId: null, excludedSiteIds: [] }),
  []
);

console.log("✓ site-scope self-check passed");
