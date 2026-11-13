import assert from "node:assert";
import { prisma } from "../../db/prisma.js";
import { CreateUserSchema, UpdateUserSchema } from "@epi/shared";
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
    siteIds: [SITE_A],
    excludedSiteIds: [],
    excludedSurveyDefinitionIds: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    userFeatures: [],
    userReportTemplates: [],
    ...overrides,
  };
}

prisma.site.findMany = (async () => [{ id: SITE_A }]) as typeof prisma.site.findMany;
usersRepository.findById = (async () => rawUser()) as typeof usersRepository.findById;
usersRepository.sitesBelongToOrg = (async (siteIds: string[], organizationId: string) =>
  siteIds.every((id) => (organizationId === ORG_A ? id === SITE_A : id === SITE_B))) as typeof usersRepository.sitesBelongToOrg;
usersRepository.surveyDefinitionsBelongToOrg = (async (ids: string[], organizationId: string) =>
  ids.every((id) => (organizationId === ORG_A ? id === "survey-a" : id === "survey-b"))) as typeof usersRepository.surveyDefinitionsBelongToOrg;
usersRepository.update = (async (_id: string, dto: unknown) => rawUser(dto as Record<string, unknown>)) as typeof usersRepository.update;
auditService.record = (async () => {}) as typeof auditService.record;

const orgAdminA = { sub: "admin-a", username: "admin_a", role: "org_admin", organizationId: ORG_A, featureKeys: [] };

await assert.rejects(
  () => usersService.update(orgAdminA, "u1", { organizationId: ORG_B }),
  /another organization/
);

await usersService.update(orgAdminA, "u1", { organizationId: ORG_A, name: "Nuevo nombre" });

await assert.rejects(
  () => usersService.update(orgAdminA, "u1", { siteIds: [SITE_B] }),
  /siteIds must belong/
);

await usersService.update(orgAdminA, "u1", { siteIds: [SITE_A] });

await assert.rejects(
  () => usersService.update(orgAdminA, "u1", { excludedSiteIds: [SITE_B] }),
  /Use siteIds/
);

await assert.rejects(
  () => usersService.update(orgAdminA, "u1", { excludedSurveyDefinitionIds: ["survey-b"] }),
  /excludedSurveyDefinitionIds must belong/
);
await usersService.update(orgAdminA, "u1", { excludedSurveyDefinitionIds: ["survey-a"] });

const systemAdmin = { ...orgAdminA, role: "system_admin" };
await assert.rejects(() => usersService.update(systemAdmin, "u1", { siteIds: [] }), /at least one site/);
await assert.rejects(() => usersService.update(systemAdmin, "u1", { organizationId: null }), /at least one site/);
await assert.rejects(() => usersService.update(systemAdmin, "u1", { organizationId: ORG_B }), /siteIds must belong/);
await usersService.update(systemAdmin, "u1", { organizationId: ORG_B, siteIds: [SITE_B] });
await assert.rejects(() => usersService.update({ ...orgAdminA, sub: "u1", role: "functionality_user" }, "u1", { siteIds: [SITE_A] }), /own role or permissions/);
prisma.site.findMany = (async () => []) as typeof prisma.site.findMany;
await assert.rejects(() => usersService.update(orgAdminA, "u1", { siteIds: [SITE_A] }), /outside your own/);
usersRepository.findByEmail = (async () => null) as typeof usersRepository.findByEmail;
usersRepository.findByUsername = (async () => null) as typeof usersRepository.findByUsername;
usersRepository.create = (async (dto) => rawUser(dto)) as typeof usersRepository.create;
const dto = { name: "Test", username: "test", email: "test@example.com", password: "password123", role: "functionality_user" as const,
  organizationId: ORG_A, siteIds: [SITE_A], featureKeys: [], reportTemplateKeys: [] };
await usersService.create(systemAdmin, dto);
await assert.rejects(() => usersService.create(systemAdmin, { ...dto, role: "system_admin" }), /Solo puede existir/);
await assert.rejects(() => usersService.update(systemAdmin, "u1", { role: "system_admin" }), /Solo puede existir/);
const findUser = usersRepository.findById;
usersRepository.findById = (async () => rawUser({ role: "SYSTEM_ADMIN", organizationId: null, siteIds: [] })) as typeof usersRepository.findById;
await assert.rejects(() => usersService.update(systemAdmin, "u1", { isActive: false }), /debe permanecer activo/);
await assert.rejects(() => usersService.update(systemAdmin, "u1", { role: "functionality_user" }), /debe permanecer activo/);
await assert.rejects(() => usersService.delete(systemAdmin, "u1"), /no se puede eliminar/);
usersRepository.findById = findUser;
await assert.rejects(() => usersService.create(systemAdmin, { ...dto, siteIds: [] }), /at least one site/);
await assert.rejects(() => usersService.create(systemAdmin, { ...dto, siteIds: [SITE_B] }), /siteIds must belong/);
const schemaDto = { ...dto, organizationId: "00000000-0000-4000-8000-000000000001" };
assert.equal(CreateUserSchema.safeParse(schemaDto).success, true);
assert.equal(CreateUserSchema.safeParse({ ...schemaDto, siteIds: [] }).success, false);
assert.equal(CreateUserSchema.safeParse({ ...schemaDto, excludedSiteIds: [SITE_A] }).success, false);
assert.equal(UpdateUserSchema.safeParse({ role: "report_viewer" }).success, true);
assert.equal(UpdateUserSchema.safeParse({ name: "New name" }).success, true);
console.log("✓ users.service self-check passed");
