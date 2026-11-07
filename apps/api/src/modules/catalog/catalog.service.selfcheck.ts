import assert from "node:assert/strict";
import { catalogService } from "./catalog.service.js";
import { catalogRepository } from "./catalog.repository.js";
import { usersRepository } from "../users/users.repository.js";
import { prisma } from "../../db/prisma.js";

const admin = { sub: "admin", username: "admin", role: "org_admin", organizationId: "org-a", featureKeys: [] };
usersRepository.findById = (async () => ({ role: "ORG_ADMIN", organizationId: "org-a", siteIds: ["a1"] })) as unknown as typeof usersRepository.findById;
prisma.site.findMany = (async () => [{ id: "a1" }]) as typeof prisma.site.findMany;
catalogRepository.findSiteById = (async (id) => ({ id, organizationId: "org-a" })) as typeof catalogRepository.findSiteById;
catalogRepository.countAssignedUsers = async () => 1;
catalogRepository.countSurveyDefinitionsForSite = async () => 0;
let changed = false;
catalogRepository.updateSite = (async () => { changed = true; return {}; }) as unknown as typeof catalogRepository.updateSite;
catalogRepository.deleteSite = async () => { changed = true; };
await assert.rejects(() => catalogService.updateSite(admin, "a2", { name: "Changed" }), /outside your assigned/);
await assert.rejects(() => catalogService.deleteSite(admin, "a2"), /outside your assigned/);
assert.equal(changed, false);
await catalogService.updateSite(admin, "a1", { name: "Changed" });
assert.equal(changed, true);
await assert.rejects(() => catalogService.updateSite({ ...admin, role: "system_admin" }, "a1", { organizationId: "org-b" }), /Reassign users/);
catalogRepository.createSite = (async (data, creatorId) => {
  assert.equal(data.organizationId, "org-a");
  assert.equal(creatorId, "admin");
  return { id: "new-site", ...data };
}) as typeof catalogRepository.createSite;
await catalogService.createSite(admin, { name: "New site" });
await assert.rejects(() => catalogService.createSite(admin, { name: "New site", organizationId: "org-b" }), /own organization/);
console.log("✓ catalog.service self-check passed");
