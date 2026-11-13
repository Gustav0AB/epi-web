import { prisma } from "../../db/prisma.js";
import type { Prisma } from "@prisma/client";
import type { JwtPayload } from "../../middlewares/auth.middleware.js";

async function auditCatalog(tx: Prisma.TransactionClient, actor: JwtPayload, action: string, targetType: string, targetId: string, previous: unknown, current: unknown) {
  await tx.auditLog.create({ data: { actorId: actor.sub, actorUsername: actor.username, actorRole: actor.role, actorOrganizationId: actor.organizationId, action, targetType, targetId, metadata: { previous, current } as Prisma.InputJsonValue } });
}
const siteFields = (site: { name: string; organizationId: string | null; programs: string[]; activityTypes: string[]; isActive: boolean }) => ({ name: site.name, organizationId: site.organizationId, programs: site.programs, activityTypes: site.activityTypes, isActive: site.isActive });
const categoryFields = (category: { name: string; subcategory: string | null; organizationId: string; isActive: boolean }) => ({ name: category.name, subcategory: category.subcategory, organizationId: category.organizationId, isActive: category.isActive });
import { UpdateSiteSchema, type UpdateOrganizationDto, type UpdateSiteDto, type CreateCategoryDto, type UpdateCategoryDto } from "@epi/shared";

export const catalogRepository = {
  // ── Organizaciones ────────────────────────────────────────────────────
  async updateOrganization(id: string, dto: UpdateOrganizationDto) {
    return prisma.organization.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  },

  // "Delete" fantasma: nunca se borra de verdad, solo se desactiva.
  async deleteOrganization(id: string) {
    await prisma.organization.update({ where: { id }, data: { isActive: false } });
  },

  async countUsersInOrg(organizationId: string): Promise<number> {
    return prisma.user.count({ where: { organizationId } });
  },

  async countSitesInOrg(organizationId: string): Promise<number> {
    return prisma.site.count({ where: { organizationId } });
  },

  // ── Sitios ───────────────────────────────────────────────────────────
  async findSiteById(id: string) {
    return prisma.site.findUnique({ where: { id } });
  },

  async createSite(data: { name: string; organizationId: string | null; programs?: string[]; activityTypes?: string[] }, creatorId: string | undefined, actor: JwtPayload) {
    return prisma.$transaction(async (tx) => {
      const site = await tx.site.create({ data });
      if (creatorId) await tx.user.update({ where: { id: creatorId }, data: { siteIds: { push: site.id } } });
      await auditCatalog(tx, actor, "SITE_CREATE", "Site", site.id, null, siteFields(site));
      return site;
    });
  },

  async catalogSources(organizationId: string, targetId: string) {
    return prisma.site.findMany({ where: { organizationId, id: { not: targetId }, isActive: true }, select: { id: true, name: true, programs: true, activityTypes: true }, orderBy: { name: "asc" } });
  },

  async duplicateSiteCatalogs(targetId: string, sourceId: string, actor: JwtPayload) {
    return prisma.$transaction(async tx => {
      const [target, source] = await Promise.all([tx.site.findUniqueOrThrow({ where: { id: targetId } }), tx.site.findUniqueOrThrow({ where: { id: sourceId } })]);
      if (!target.organizationId || target.organizationId !== source.organizationId || !source.isActive || !target.isActive) throw Object.assign(new Error("Los sitios deben estar activos y pertenecer a la misma organización"), { statusCode: 400 });
      const merge = (existing: string[], incoming: string[]) => {
        const values = new Map<string, string>();
        for (const item of [...existing, ...incoming]) { const key = item.trim().toLocaleLowerCase("es"); if (!values.has(key)) values.set(key, item); }
        return [...values.values()];
      };
      const merged = UpdateSiteSchema.safeParse({ programs: merge(target.programs, source.programs), activityTypes: merge(target.activityTypes, source.activityTypes) });
      if (!merged.success) throw Object.assign(new Error("Los catálogos combinados superan el límite o requieren incluir el programa Otro"), { statusCode: 400 });
      const site = await tx.site.update({ where: { id: targetId }, data: { programs: merged.data.programs!, activityTypes: merged.data.activityTypes! } });
      await tx.auditLog.create({ data: { actorId: actor.sub, actorUsername: actor.username, actorRole: actor.role, actorOrganizationId: actor.organizationId, action: "SITE_CATALOG_DUPLICATE", targetType: "Site", targetId, metadata: { sourceSiteId: source.id, sourceSiteName: source.name, previous: siteFields(target), current: siteFields(site) } } });
      return site;
    }, { isolationLevel: "Serializable" });
  },

  async updateSite(id: string, dto: UpdateSiteDto, actor: JwtPayload) {
    return prisma.$transaction(async tx => {
      const previous = await tx.site.findUniqueOrThrow({ where: { id } });
      const site = await tx.site.update({ where: { id }, data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.organizationId !== undefined && { organizationId: dto.organizationId }),
        ...(dto.programs !== undefined && { programs: dto.programs }),
        ...(dto.activityTypes !== undefined && { activityTypes: dto.activityTypes }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      } });
      await auditCatalog(tx, actor, "SITE_UPDATE", "Site", id, siteFields(previous), siteFields(site));
      return site;
    });
  },

  async deleteSite(id: string, actor: JwtPayload) {
    await prisma.$transaction(async tx => {
      const previous = await tx.site.findUniqueOrThrow({ where: { id } });
      const site = await tx.site.update({ where: { id }, data: { isActive: false } });
      await auditCatalog(tx, actor, "SITE_DELETE", "Site", id, siteFields(previous), siteFields(site));
    });
  },

  async countAssignedUsers(siteId: string) {
    return prisma.user.count({ where: { siteIds: { has: siteId } } });
  },

  async countSurveyDefinitionsForSite(siteId: string): Promise<number> {
    return prisma.surveyDefinition.count({ where: { siteId } });
  },

  // ── Categorías ───────────────────────────────────────────────────────
  async findCategoryById(id: string) {
    return prisma.category.findUnique({ where: { id } });
  },

  // findFirst (no findUnique): el compound unique de Prisma no admite `null`
  // en su tipo aunque subcategory sea nullable en el schema (Postgres trata
  // cada NULL como distinto para unicidad). Para reactivar en vez de chocar
  // con el @@unique cuando ya existe una categoría con la misma clave pero
  // desactivada (ver catalogService.createCategory).
  async findCategoryByKey(organizationId: string, name: string, subcategory: string | null) {
    return prisma.category.findFirst({ where: { organizationId, name, subcategory } });
  },

  async createCategory(dto: CreateCategoryDto & { organizationId: string }, actor: JwtPayload) {
    return prisma.$transaction(async tx => {
      const category = await tx.category.create({ data: { name: dto.name, subcategory: dto.subcategory ?? null, organizationId: dto.organizationId } });
      await auditCatalog(tx, actor, "CATEGORY_CREATE", "Category", category.id, null, categoryFields(category));
      return category;
    });
  },

  async reactivateCategory(id: string, actor: JwtPayload) {
    return prisma.$transaction(async tx => {
      const previous = await tx.category.findUniqueOrThrow({ where: { id } });
      const category = await tx.category.update({ where: { id }, data: { isActive: true } });
      await auditCatalog(tx, actor, "CATEGORY_REACTIVATE", "Category", id, categoryFields(previous), categoryFields(category));
      return category;
    });
  },

  async updateCategory(id: string, dto: UpdateCategoryDto, actor: JwtPayload) {
    return prisma.$transaction(async tx => {
      const previous = await tx.category.findUniqueOrThrow({ where: { id } });
      const category = await tx.category.update({ where: { id }, data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.subcategory !== undefined && { subcategory: dto.subcategory }),
        ...(dto.organizationId !== undefined && { organizationId: dto.organizationId }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      } });
      await auditCatalog(tx, actor, "CATEGORY_UPDATE", "Category", id, categoryFields(previous), categoryFields(category));
      return category;
    });
  },

  async deleteCategory(id: string, actor: JwtPayload) {
    await prisma.$transaction(async tx => {
      const previous = await tx.category.findUniqueOrThrow({ where: { id } });
      const category = await tx.category.update({ where: { id }, data: { isActive: false } });
      await auditCatalog(tx, actor, "CATEGORY_DELETE", "Category", id, categoryFields(previous), categoryFields(category));
    });
  },
};
