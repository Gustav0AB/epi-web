import bcrypt from "bcryptjs";
import { allowedSiteIds } from "../../shared/site-scope.js";
import { usersRepository } from "./users.repository.js";
import { auditService } from "../audit/audit.service.js";
import type { CreateUserDto, UpdateUserDto, User, PaginationMeta, Role } from "@epi/shared";
import type { JwtPayload } from "../../middlewares/auth.middleware.js";

type RawUser = {
  id: string;
  name: string;
  username: string;
  email: string;
  role: string;
  institutionalPosition: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  organizationId: string | null;
  siteIds: string[];
  excludedSiteIds: string[];
  excludedSurveyDefinitionIds: string[];
  createdAt: Date;
  updatedAt: Date;
  userFeatures: { featureKey: string }[];
  userReportTemplates: { templateKey: string }[];
};

function forbidden(message: string) {
  return Object.assign(new Error(message), { statusCode: 403, code: "FORBIDDEN" });
}

function badRequest(message: string) {
  return Object.assign(new Error(message), { statusCode: 400, code: "BAD_REQUEST" });
}

const ADMIN_ONLY_FIELDS = [
  "role",
  "organizationId",
  "featureKeys",
  "reportTemplateKeys",
  "isActive",
  "siteIds",
  "excludedSiteIds",
  "excludedSurveyDefinitionIds",
] as const;

export class UsersService {
  async getAll(requester: JwtPayload, page = 1, pageSize = 20): Promise<{ users: User[]; meta: PaginationMeta }> {
    if (requester.role !== "system_admin" && requester.role !== "org_admin") {
      throw forbidden("Only system_admin or org_admin can list users");
    }
    const organizationId = requester.role === "org_admin" ? requester.organizationId! : undefined;
    const { users, total } = await usersRepository.findAll(page, pageSize, organizationId);
    return {
      users: users.map(this.#mapToDto),
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async getById(requester: JwtPayload, id: string): Promise<User> {
    const user = await this.#loadOrThrow(id);
    if (requester.sub !== id) this.#assertOrgAccess(requester, user.organizationId);
    return this.#mapToDto(user);
  }

  async create(requester: JwtPayload, dto: CreateUserDto): Promise<User> {
    if (requester.role === "org_admin") {
      if (dto.role === "system_admin" || dto.role === "org_admin") {
        throw forbidden("org_admin cannot create system_admin or org_admin users");
      }
      if (dto.organizationId !== requester.organizationId) {
        throw forbidden("org_admin can only create users in their own organization");
      }
    }

    if (dto.role === "system_admin") throw Object.assign(new Error("Solo puede existir un administrador de sistema."), { statusCode: 409, code: "SYSTEM_ADMIN_EXISTS" });

    await this.#validateAssignments(dto.role, dto.organizationId ?? null, dto.siteIds ?? [], dto.excludedSurveyDefinitionIds ?? []);
    if (dto.excludedSiteIds?.length) throw badRequest("Use siteIds to assign access");

    await this.#assertAssignableSites(requester, dto.siteIds ?? []);
    const byEmail = await usersRepository.findByEmail(dto.email);
    if (byEmail) throw Object.assign(new Error("Email already in use"), { statusCode: 409, code: "EMAIL_CONFLICT" });

    const byUsername = await usersRepository.findByUsername(dto.username);
    if (byUsername) throw Object.assign(new Error("Username already taken"), { statusCode: 409, code: "USERNAME_CONFLICT" });

    const user = await usersRepository.create(dto);
    await auditService.record(requester, "USER_CREATE", { type: "User", id: user.id }, { username: user.username, role: user.role, organizationId: user.organizationId });
    return this.#mapToDto(user);
  }

  async update(requester: JwtPayload, id: string, dto: UpdateUserDto): Promise<User> {
    const existing = await this.#loadOrThrow(id);
    const isAdmin = requester.role === "system_admin" || requester.role === "org_admin";

    if (requester.sub === id) {
      if (!isAdmin) {
        const touchesAdminField = ADMIN_ONLY_FIELDS.some((f) => dto[f] !== undefined);
        if (touchesAdminField) throw forbidden("Cannot change your own role or permissions");
      }
    } else {
      this.#assertOrgAccess(requester, existing.organizationId);
    }

    if (requester.role === "org_admin" && (dto.role === "system_admin" || dto.role === "org_admin")) {
      throw forbidden("org_admin cannot promote users to system_admin or org_admin");
    }
    if (requester.role === "org_admin" && dto.organizationId !== undefined && dto.organizationId !== requester.organizationId) {
      throw forbidden("org_admin cannot move users to another organization");
    }

    if (existing.role === "SYSTEM_ADMIN" && (dto.role !== undefined && dto.role !== "system_admin" || dto.isActive === false)) throw Object.assign(new Error("El administrador de sistema debe permanecer activo."), { statusCode: 409, code: "SYSTEM_ADMIN_REQUIRED" });
    if (existing.role !== "SYSTEM_ADMIN" && dto.role === "system_admin") throw Object.assign(new Error("Solo puede existir un administrador de sistema."), { statusCode: 409, code: "SYSTEM_ADMIN_EXISTS" });

    const targetOrgId = dto.organizationId !== undefined ? dto.organizationId : existing.organizationId;
    await this.#validateAssignments(
      dto.role ?? existing.role.toLowerCase(), targetOrgId,
      dto.siteIds ?? existing.siteIds,
      dto.excludedSurveyDefinitionIds ?? existing.excludedSurveyDefinitionIds,
    );
    if (dto.excludedSiteIds?.length) throw badRequest("Use siteIds to assign access");

    if (dto.siteIds !== undefined) await this.#assertAssignableSites(requester, dto.siteIds);
    const user = await usersRepository.update(id, dto);
    await auditService.record(requester, "USER_UPDATE", { type: "User", id }, { username: user.username });

    if (dto.role !== undefined && dto.role !== existing.role.toLowerCase()) {
      await auditService.record(requester, "USER_ROLE_CHANGE", { type: "User", id }, { username: existing.username, from: existing.role.toLowerCase(), to: dto.role });
    }

    if (dto.siteIds !== undefined || dto.organizationId !== undefined) {
      await auditService.record(requester, "USER_SITE_ACCESS_CHANGE", { type: "User", id }, {
        from: { organizationId: existing.organizationId, siteIds: existing.siteIds },
        to: { organizationId: user.organizationId, siteIds: user.siteIds },
      });
    }
    return this.#mapToDto(user);
  }

  async delete(requester: JwtPayload, id: string): Promise<void> {
    const existing = await this.#loadOrThrow(id);
    this.#assertOrgAccess(requester, existing.organizationId);
    if (existing.role === "SYSTEM_ADMIN") throw Object.assign(new Error("El administrador de sistema no se puede eliminar."), { statusCode: 409, code: "SYSTEM_ADMIN_REQUIRED" });
    await usersRepository.delete(id);
    await auditService.record(requester, "USER_DELETE", { type: "User", id }, { username: existing.username });
  }

  async resetPassword(requester: JwtPayload, id: string, newPassword: string): Promise<void> {
    const existing = await this.#loadOrThrow(id);
    this.#assertOrgAccess(requester, existing.organizationId);
    await usersRepository.updatePassword(id, newPassword);
    await auditService.record(requester, "PASSWORD_RESET", { type: "User", id }, { username: existing.username });
  }

  async forceLogout(requester: JwtPayload, id: string): Promise<void> {
    const existing = await this.#loadOrThrow(id);
    this.#assertOrgAccess(requester, existing.organizationId);
    await usersRepository.forceLogout(id);
    await auditService.record(requester, "FORCE_LOGOUT", { type: "User", id }, { username: existing.username });
  }

  async changePassword(id: string, currentPassword: string, newPassword: string): Promise<void> {
    const hash = await usersRepository.findPassword(id);
    if (!hash) throw Object.assign(new Error("User not found"), { statusCode: 404, code: "USER_NOT_FOUND" });
    const valid = await bcrypt.compare(currentPassword, hash);
    if (!valid) throw Object.assign(new Error("Current password is incorrect"), { statusCode: 400, code: "INVALID_PASSWORD" });
    await usersRepository.updatePassword(id, newPassword);
  }

  async #assertAssignableSites(requester: JwtPayload, siteIds: string[]) {
    if (requester.role === "system_admin") return;
    const actor = await this.#loadOrThrow(requester.sub);
    const allowed = await allowedSiteIds({ ...actor, role: actor.role.toLowerCase() });
    if (allowed !== undefined && siteIds.some((id) => !allowed.includes(id))) {
      throw forbidden("Cannot assign sites outside your own assigned sites");
    }
  }

  async #validateAssignments(role: string, organizationId: string | null, siteIds: string[], surveyIds: string[]) {
    if (role !== "system_admin" && (!organizationId || siteIds.length === 0)) {
      throw badRequest("An organization and at least one site are required");
    }
    if (siteIds.length && (!organizationId || !(await usersRepository.sitesBelongToOrg([...new Set(siteIds)], organizationId)))) {
      throw badRequest("siteIds must belong to the user's organization");
    }
    if (surveyIds.length && (!organizationId || !(await usersRepository.surveyDefinitionsBelongToOrg([...new Set(surveyIds)], organizationId)))) {
      throw badRequest("excludedSurveyDefinitionIds must belong to the user's organization");
    }
  }

  async #loadOrThrow(id: string): Promise<RawUser> {
    const user = await usersRepository.findById(id);
    if (!user) throw Object.assign(new Error("User not found"), { statusCode: 404, code: "USER_NOT_FOUND" });
    return user;
  }

  // system_admin: sin límite. org_admin: solo su propia organización. Cualquier
  // otro rol no tiene acceso a datos de otros usuarios (solo a sí mismo, ver getById/update).
  #assertOrgAccess(requester: JwtPayload, targetOrgId: string | null) {
    if (requester.role === "system_admin") return;
    if (requester.role === "org_admin" && targetOrgId === requester.organizationId) return;
    throw forbidden("Insufficient permissions to access this user");
  }

  #mapToDto(raw: RawUser): User {
    return {
      id: raw.id,
      name: raw.name,
      username: raw.username,
      email: raw.email,
      role: raw.role.toLowerCase() as Role,
      institutionalPosition: raw.institutionalPosition,
      isActive: raw.isActive,
      featureKeys: raw.userFeatures.map((f) => f.featureKey),
      reportTemplateKeys: raw.userReportTemplates.map((t) => t.templateKey),
      organizationId: raw.organizationId,
      siteIds: raw.siteIds,
      excludedSiteIds: raw.excludedSiteIds,
      excludedSurveyDefinitionIds: raw.excludedSurveyDefinitionIds,
      createdAt: raw.createdAt.toISOString(),
      updatedAt: raw.updatedAt.toISOString(),
    };
  }
}

export const usersService = new UsersService();
