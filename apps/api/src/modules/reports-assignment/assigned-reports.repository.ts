import { prisma } from "../../db/prisma.js";
import { Prisma, type ReportAssignmentStatus as PrismaStatus } from "@prisma/client";
import type { CreateAssignedReportDto, UpdateAssignedReportDto } from "@epi/shared";

type Actor = { id: string | null; username: string };

const toJsonInput = (filters: Record<string, unknown> | null | undefined) =>
  filters === null ? Prisma.JsonNull : (filters as Prisma.InputJsonValue);

export const assignedReportsRepository = {
  findById(id: string) {
    return prisma.assignedReport.findUnique({
      where: { id },
      include: { user: { select: { organizationId: true, role: true, excludedSiteIds: true } } },
    });
  },

  listForUser(userId: string, status?: string) {
    return prisma.assignedReport.findMany({
      where: { userId, ...(status && { status: status.toUpperCase() as PrismaStatus }) },
      orderBy: { updatedAt: "desc" },
    });
  },

  listScoped(organizationId?: string) {
    return prisma.assignedReport.findMany({
      where: organizationId ? { user: { organizationId } } : {},
      orderBy: { updatedAt: "desc" },
    });
  },

  async create(dto: CreateAssignedReportDto, actor: Actor) {
    return prisma.$transaction(async (tx) => {
      const report = await tx.assignedReport.create({
        data: {
          userId: dto.userId,
          templateKey: dto.templateKey,
          title: dto.title,
          ...(dto.filters !== undefined && { filters: toJsonInput(dto.filters) }),
          ...(dto.textContent !== undefined && { textContent: toJsonInput(dto.textContent) }),
        },
      });
      await tx.assignedReportVersion.create({
        data: {
          reportId: report.id,
          version: report.version,
          title: report.title,
          status: report.status,
          ...(report.filters !== null && { filters: report.filters as Prisma.InputJsonValue }),
          ...(report.textContent !== null && { textContent: report.textContent as Prisma.InputJsonValue }),
          actorId: actor.id,
          actorUsername: actor.username,
        },
      });
      return report;
    });
  },

  async update(id: string, dto: UpdateAssignedReportDto, actor: Actor) {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.assignedReport.findUniqueOrThrow({ where: { id } });
      const version = existing.version + 1;
      const updated = await tx.assignedReport.update({
        where: { id },
        data: {
          ...(dto.templateKey !== undefined && { templateKey: dto.templateKey }),
          ...(dto.title !== undefined && { title: dto.title }),
          ...(dto.status !== undefined && { status: dto.status.toUpperCase() as PrismaStatus }),
          ...(dto.filters !== undefined && { filters: toJsonInput(dto.filters) }),
          ...(dto.textContent !== undefined && { textContent: toJsonInput(dto.textContent) }),
          version,
        },
      });
      await tx.assignedReportVersion.create({
        data: {
          reportId: id,
          version,
          title: updated.title,
          status: updated.status,
          ...(updated.filters !== null && { filters: updated.filters as Prisma.InputJsonValue }),
          ...(updated.textContent !== null && { textContent: updated.textContent as Prisma.InputJsonValue }),
          actorId: actor.id,
          actorUsername: actor.username,
        },
      });
      return updated;
    });
  },

  async delete(id: string) {
    await prisma.assignedReport.delete({ where: { id } });
  },

  listVersions(reportId: string) {
    return prisma.assignedReportVersion.findMany({ where: { reportId }, orderBy: { version: "desc" } });
  },
};
