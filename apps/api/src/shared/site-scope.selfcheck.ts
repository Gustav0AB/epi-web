// Auto-check del alcance por sitio (org-wide con exclusiones). Correr:
// tsx src/shared/site-scope.selfcheck.ts
import assert from "node:assert";
import { prisma } from "../db/prisma.js";
import { allowedSiteIds } from "./site-scope.js";

const ORG_A = "org-a";
const SITES = [{ id: "site-1" }, { id: "site-2" }, { id: "site-3" }];

prisma.site.findMany = (async () => SITES) as typeof prisma.site.findMany;

// system_admin: sin restricción.
assert.strictEqual(
  await allowedSiteIds({ role: "system_admin", organizationId: null, excludedSiteIds: [] }),
  undefined
);

// org_admin sin exclusiones: ve todos los sitios de su organización.
assert.deepStrictEqual(
  await allowedSiteIds({ role: "org_admin", organizationId: ORG_A, excludedSiteIds: [] }),
  ["site-1", "site-2", "site-3"]
);

// functionality_user con un sitio excluido: ve el resto de su organización
// (ya no depende de su propio siteIds — eso es solo la vista por defecto).
assert.deepStrictEqual(
  await allowedSiteIds({ role: "functionality_user", organizationId: ORG_A, excludedSiteIds: ["site-2"] }),
  ["site-1", "site-3"]
);

// Sin organización (y sin ser system_admin): no ve ningún sitio.
assert.deepStrictEqual(
  await allowedSiteIds({ role: "report_viewer", organizationId: null, excludedSiteIds: [] }),
  []
);

console.log("✓ site-scope self-check passed");
