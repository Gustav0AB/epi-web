import { catalogRepository } from "./catalog.repository.js";
import type {
  UpdateOrganizationDto,
  CreateSiteDto,
  UpdateSiteDto,
  CreateCategoryDto,
  UpdateCategoryDto,
} from "@epi/shared";
import type { JwtPayload } from "../../middlewares/auth.middleware.js";

function forbidden(message: string) {
  return Object.assign(new Error(message), { statusCode: 403, code: "FORBIDDEN" });
}

function notFound(message: string) {
  return Object.assign(new Error(message), { statusCode: 404, code: "NOT_FOUND" });
}

function conflict(message: string) {
  return Object.assign(new Error(message), { statusCode: 409, code: "CONFLICT" });
}

function badRequest(message: string) {
  return Object.assign(new Error(message), { statusCode: 400, code: "BAD_REQUEST" });
}

function isUniqueConstraintError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

// system_admin: sin límite. org_admin: solo recursos de su propia organización.
function assertOrgAccess(requester: JwtPayload, resourceOrgId: string | null) {
  if (requester.role === "system_admin") return;
  if (requester.role === "org_admin" && resourceOrgId === requester.organizationId) return;
  throw forbidden("Insufficient permissions to access this resource");
}

export const catalogService = {
  // ── Organizaciones ────────────────────────────────────────────────────
  async updateOrganization(dto: UpdateOrganizationDto, id: string) {
    try {
      return await catalogRepository.updateOrganization(id, dto);
    } catch (err) {
      if (isUniqueConstraintError(err)) throw conflict("An organization with that name already exists");
      throw err;
    }
  },

  async deleteOrganization(id: string) {
    const [users, sites] = await Promise.all([
      catalogRepository.countUsersInOrg(id),
      catalogRepository.countSitesInOrg(id),
    ]);
    if (users > 0 || sites > 0) {
      throw conflict("Cannot delete an organization that still has users or sites");
    }
    await catalogRepository.deleteOrganization(id);
  },

  // ── Sitios ───────────────────────────────────────────────────────────
  async createSite(requester: JwtPayload, dto: CreateSiteDto) {
    let organizationId = dto.organizationId ?? null;
    if (requester.role === "org_admin") {
      if (organizationId && organizationId !== requester.organizationId) {
        throw forbidden("org_admin can only create sites in their own organization");
      }
      organizationId = requester.organizationId;
    }
    try {
      return await catalogRepository.createSite({ name: dto.name, organizationId });
    } catch (err) {
      if (isUniqueConstraintError(err)) throw conflict("A site with that name already exists");
      throw err;
    }
  },

  async updateSite(requester: JwtPayload, id: string, dto: UpdateSiteDto) {
    const existing = await catalogRepository.findSiteById(id);
    if (!existing) throw notFound("Site not found");
    assertOrgAccess(requester, existing.organizationId);

    if (requester.role === "org_admin" && dto.organizationId !== undefined && dto.organizationId !== requester.organizationId) {
      throw forbidden("org_admin cannot move sites to another organization");
    }

    try {
      return await catalogRepository.updateSite(id, dto);
    } catch (err) {
      if (isUniqueConstraintError(err)) throw conflict("A site with that name already exists");
      throw err;
    }
  },

  async deleteSite(requester: JwtPayload, id: string) {
    const existing = await catalogRepository.findSiteById(id);
    if (!existing) throw notFound("Site not found");
    assertOrgAccess(requester, existing.organizationId);

    const surveyDefinitions = await catalogRepository.countSurveyDefinitionsForSite(id);
    if (surveyDefinitions > 0) {
      throw conflict("Cannot delete a site that still has survey definitions");
    }
    await catalogRepository.deleteSite(id);
  },

  // ── Categorías (por organización) ───────────────────────────────────
  async createCategory(requester: JwtPayload, dto: CreateCategoryDto) {
    let organizationId = dto.organizationId;
    if (requester.role === "org_admin") {
      if (organizationId && organizationId !== requester.organizationId) {
        throw forbidden("org_admin can only create categories in their own organization");
      }
      organizationId = requester.organizationId!;
    }
    if (!organizationId) throw badRequest("organizationId is required");

    // Un "delete" fantasma deja la fila desactivada ocupando la clave única
    // (organizationId, name, subcategory) — recrearla con el mismo nombre
    // debe reactivarla en vez de chocar con un 409.
    const existing = await catalogRepository.findCategoryByKey(organizationId, dto.name, dto.subcategory ?? null);
    if (existing) {
      if (existing.isActive) throw conflict("That category/subcategory pair already exists in this organization");
      return catalogRepository.reactivateCategory(existing.id);
    }

    try {
      return await catalogRepository.createCategory({ ...dto, organizationId });
    } catch (err) {
      if (isUniqueConstraintError(err)) throw conflict("That category/subcategory pair already exists in this organization");
      throw err;
    }
  },

  async updateCategory(requester: JwtPayload, id: string, dto: UpdateCategoryDto) {
    const existing = await catalogRepository.findCategoryById(id);
    if (!existing) throw notFound("Category not found");
    assertOrgAccess(requester, existing.organizationId);

    if (requester.role === "org_admin" && dto.organizationId !== undefined && dto.organizationId !== requester.organizationId) {
      throw forbidden("org_admin cannot move categories to another organization");
    }

    try {
      return await catalogRepository.updateCategory(id, dto);
    } catch (err) {
      if (isUniqueConstraintError(err)) throw conflict("That category/subcategory pair already exists in this organization");
      throw err;
    }
  },

  async deleteCategory(requester: JwtPayload, id: string) {
    const existing = await catalogRepository.findCategoryById(id);
    if (!existing) throw notFound("Category not found");
    assertOrgAccess(requester, existing.organizationId);
    await catalogRepository.deleteCategory(id);
  },

  // org_admin siempre importa a su propia organización; system_admin debe indicarla.
  resolveCategoryImportOrg(requester: JwtPayload, organizationId?: string): string {
    if (requester.role === "org_admin") return requester.organizationId!;
    if (!organizationId) throw badRequest("organizationId is required to import categories");
    return organizationId;
  },
};
