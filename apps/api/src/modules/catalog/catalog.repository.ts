import { prisma } from "../../db/prisma.js";
import type { UpdateOrganizationDto, UpdateSiteDto, CreateCategoryDto, UpdateCategoryDto } from "@epi/shared";

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

  async createSite(data: { name: string; organizationId: string | null }) {
    return prisma.site.create({ data });
  },

  async updateSite(id: string, dto: UpdateSiteDto) {
    return prisma.site.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.organizationId !== undefined && { organizationId: dto.organizationId }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  },

  async deleteSite(id: string) {
    await prisma.site.update({ where: { id }, data: { isActive: false } });
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

  async createCategory(dto: CreateCategoryDto & { organizationId: string }) {
    return prisma.category.create({
      data: { name: dto.name, subcategory: dto.subcategory ?? null, organizationId: dto.organizationId },
    });
  },

  async reactivateCategory(id: string) {
    return prisma.category.update({ where: { id }, data: { isActive: true } });
  },

  async updateCategory(id: string, dto: UpdateCategoryDto) {
    return prisma.category.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.subcategory !== undefined && { subcategory: dto.subcategory }),
        ...(dto.organizationId !== undefined && { organizationId: dto.organizationId }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  },

  async deleteCategory(id: string) {
    await prisma.category.update({ where: { id }, data: { isActive: false } });
  },
};
