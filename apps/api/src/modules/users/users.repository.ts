import { prisma } from "../../db/prisma.js";
import type { Prisma } from "@prisma/client";
import type { CreateUserDto, UpdateUserDto } from "@epi/shared";
import bcrypt from "bcryptjs";

type RoleValue = "SYSTEM_ADMIN" | "ORG_ADMIN" | "REPORT_VIEWER" | "FUNCTIONALITY_USER";

const userSelect = {
  id: true,
  name: true,
  username: true,
  email: true,
  role: true,
  institutionalPosition: true,
  isActive: true,
  organizationId: true,
  siteIds: true,
  excludedSiteIds: true,
  excludedSurveyDefinitionIds: true,
  createdAt: true,
  updatedAt: true,
  userFeatures: { select: { featureKey: true } },
  userReportTemplates: { select: { templateKey: true } },
} as const;

export const usersRepository = {
  async findAll(page: number, pageSize: number, organizationId?: string) {
    const where: Prisma.UserWhereInput = organizationId ? { organizationId } : {};
    const [users, total] = await prisma.$transaction([
      prisma.user.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: userSelect,
        orderBy: { createdAt: "desc" },
      }),
      prisma.user.count({ where }),
    ]);
    return { users, total };
  },

  async findFeatureKeys(userId: string): Promise<string[]> {
    const rows = await prisma.userFeature.findMany({ where: { userId }, select: { featureKey: true } });
    return rows.map((r) => r.featureKey);
  },

  async findById(id: string) {
    return prisma.user.findUnique({ where: { id }, select: userSelect });
  },

  async findByUsername(username: string) {
    return prisma.user.findUnique({ where: { username } });
  },

  async findByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  },

  async sitesBelongToOrg(siteIds: string[], organizationId: string): Promise<boolean> {
    if (siteIds.length === 0) return true;
    const count = await prisma.site.count({ where: { id: { in: siteIds }, organizationId } });
    return count === siteIds.length;
  },

  async surveyDefinitionsBelongToOrg(surveyDefinitionIds: string[], organizationId: string): Promise<boolean> {
    if (surveyDefinitionIds.length === 0) return true;
    const count = await prisma.surveyDefinition.count({
      where: { id: { in: surveyDefinitionIds }, site: { organizationId } },
    });
    return count === surveyDefinitionIds.length;
  },

  async create(dto: CreateUserDto) {
    const hashed = await bcrypt.hash(dto.password, 12);
    const role = (dto.role?.toUpperCase() ?? "FUNCTIONALITY_USER") as RoleValue;

    const featureData =
      role === "FUNCTIONALITY_USER" && dto.featureKeys?.length
        ? { userFeatures: { create: dto.featureKeys.map((featureKey) => ({ featureKey })) } }
        : {};
    const reportTemplateData =
      role === "REPORT_VIEWER" && dto.reportTemplateKeys?.length
        ? { userReportTemplates: { create: dto.reportTemplateKeys.map((templateKey) => ({ templateKey })) } }
        : {};

    return prisma.user.create({
      data: {
        name: dto.name,
        username: dto.username,
        email: dto.email,
        password: hashed,
        role,
        institutionalPosition: dto.institutionalPosition ?? null,
        organizationId: dto.organizationId ?? null,
        siteIds: dto.siteIds ?? [],
        excludedSiteIds: dto.excludedSiteIds ?? [],
        excludedSurveyDefinitionIds: dto.excludedSurveyDefinitionIds ?? [],
        ...featureData,
        ...reportTemplateData,
      },
      select: userSelect,
    });
  },

  async update(id: string, dto: UpdateUserDto) {
    return prisma.$transaction(async (tx) => {
      if (dto.featureKeys !== undefined) {
        await tx.userFeature.deleteMany({ where: { userId: id } });
        if (dto.featureKeys.length > 0) {
          await tx.userFeature.createMany({
            data: dto.featureKeys.map((featureKey) => ({ userId: id, featureKey })),
          });
        }
      }

      if (dto.reportTemplateKeys !== undefined) {
        await tx.userReportTemplate.deleteMany({ where: { userId: id } });
        if (dto.reportTemplateKeys.length > 0) {
          await tx.userReportTemplate.createMany({
            data: dto.reportTemplateKeys.map((templateKey) => ({ userId: id, templateKey })),
          });
        }
      }

      return tx.user.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.username !== undefined && { username: dto.username }),
          ...(dto.email !== undefined && { email: dto.email }),
          ...(dto.role !== undefined && { role: dto.role.toUpperCase() as RoleValue }),
          ...(dto.institutionalPosition !== undefined && { institutionalPosition: dto.institutionalPosition }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
          ...(dto.organizationId !== undefined && { organizationId: dto.organizationId }),
          ...(dto.siteIds !== undefined && { siteIds: dto.siteIds }),
          ...(dto.excludedSiteIds !== undefined && { excludedSiteIds: dto.excludedSiteIds }),
          ...(dto.excludedSurveyDefinitionIds !== undefined && {
            excludedSurveyDefinitionIds: dto.excludedSurveyDefinitionIds,
          }),
        },
        select: userSelect,
      });
    });
  },

  // "Delete" fantasma: nunca se borra de verdad, solo se desactiva (igual
  // que el toggle isActive del PATCH).
  async delete(id: string) {
    return prisma.user.update({ where: { id }, data: { isActive: false } });
  },

  async findPassword(id: string): Promise<string | null> {
    const row = await prisma.user.findUnique({ where: { id }, select: { password: true } });
    return row?.password ?? null;
  },

  async updatePassword(id: string, plainPassword: string) {
    const hashed = await bcrypt.hash(plainPassword, 12);
    // Cambiar la contraseña invalida cualquier token ya emitido (fuerza
    // re-login en otras sesiones) y levanta un bloqueo por intentos
    // fallidos — quien puede cambiarla ya demostró tener acceso legítimo
    // (contraseña actual) o es un admin resolviendo el acceso a mano.
    await prisma.user.update({
      where: { id },
      data: { password: hashed, sessionValidAfter: new Date(), failedLoginAttempts: 0, lockedUntil: null },
    });
  },

  // Devuelve el conteo de intentos fallidos ya incluyendo este, para que
  // auth.service decida si toca bloquear la cuenta.
  async registerFailedLogin(id: string): Promise<number> {
    const user = await prisma.user.update({
      where: { id },
      data: { failedLoginAttempts: { increment: 1 } },
      select: { failedLoginAttempts: true },
    });
    return user.failedLoginAttempts;
  },

  async lockAccount(id: string, until: Date) {
    await prisma.user.update({ where: { id }, data: { lockedUntil: until } });
  },

  async clearFailedLogins(id: string) {
    await prisma.user.update({ where: { id }, data: { failedLoginAttempts: 0, lockedUntil: null } });
  },

  async forceLogout(id: string) {
    await prisma.user.update({ where: { id }, data: { sessionValidAfter: new Date() } });
  },
};
