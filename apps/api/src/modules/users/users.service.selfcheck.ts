// Auto-check del aislamiento entre organizaciones. Correr:
// tsx src/modules/users/users.service.selfcheck.ts
import assert from "node:assert";
import { usersService } from "./users.service.js";
import { usersRepository } from "./users.repository.js";
import { auditService } from "../audit/audit.service.js";

const ORG_A = "org-a";
const ORG_B = "org-b";
const SITE_A = "site-a";
const SITE_B = "site-b";

function rawUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "u1",
    name: "Test",
    username: "test",
    email: "test@epi.local",
    role: "FUNCTIONALITY_USER",
    institutionalPosition: null,
    isActive: true,
    mustChangePassword: false,
    organizationId: ORG_A,
    siteIds: [],
    excludedSiteIds: [],
    excludedSurveyDefinitionIds: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    userFeatures: [],
    userReportTemplates: [],
    ...overrides,
  };
}

// Monkey-patch: sin DB real, solo probamos las reglas de autorización.
usersRepository.findById = (async () => rawUser()) as typeof usersRepository.findById;
usersRepository.sitesBelongToOrg = (async (siteIds: string[], organizationId: string) =>
  siteIds.every((id) => (organizationId === ORG_A ? id === SITE_A : id === SITE_B))) as typeof usersRepository.sitesBelongToOrg;
usersRepository.surveyDefinitionsBelongToOrg = (async (ids: string[], organizationId: string) =>
  ids.every((id) => (organizationId === ORG_A ? id === "survey-a" : id === "survey-b"))) as typeof usersRepository.surveyDefinitionsBelongToOrg;
usersRepository.update = (async (_id: string, dto: unknown) => rawUser(dto as Record<string, unknown>)) as typeof usersRepository.update;
auditService.record = (async () => {}) as typeof auditService.record;

const orgAdminA = { sub: "admin-a", username: "admin_a", role: "org_admin", organizationId: ORG_A, featureKeys: [] };

// org_admin no puede mover un usuario de su org a otra organización.
await assert.rejects(
  () => usersService.update(orgAdminA, "u1", { organizationId: ORG_B }),
  /another organization/
);

// org_admin sí puede editar un usuario dentro de su propia organización.
await usersService.update(orgAdminA, "u1", { organizationId: ORG_A, name: "Nuevo nombre" });

// org_admin no puede asignar siteIds que pertenecen a otra organización.
await assert.rejects(
  () => usersService.update(orgAdminA, "u1", { siteIds: [SITE_B] }),
  /siteIds\/excludedSiteIds must belong/
);

// siteIds de la propia organización sí se aceptan.
await usersService.update(orgAdminA, "u1", { siteIds: [SITE_A] });

// excludedSiteIds sigue la misma regla de aislamiento que siteIds.
await assert.rejects(
  () => usersService.update(orgAdminA, "u1", { excludedSiteIds: [SITE_B] }),
  /siteIds\/excludedSiteIds must belong/
);
await usersService.update(orgAdminA, "u1", { excludedSiteIds: [SITE_A] });

// excludedSurveyDefinitionIds no puede apuntar a una encuesta de otra organización.
await assert.rejects(
  () => usersService.update(orgAdminA, "u1", { excludedSurveyDefinitionIds: ["survey-b"] }),
  /excludedSurveyDefinitionIds must belong/
);
await usersService.update(orgAdminA, "u1", { excludedSurveyDefinitionIds: ["survey-a"] });

console.log("✓ users.service self-check passed");
