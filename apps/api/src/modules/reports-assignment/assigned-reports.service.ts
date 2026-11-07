import { assignedReportsRepository } from "./assigned-reports.repository.js";
import { usersRepository } from "../users/users.repository.js";
import { allowedSiteIds } from "../../shared/site-scope.js";
import { REPORT_DATA_RESOLVERS } from "./report-data-resolvers.js";
import type {
  AssignedReportDto,
  AssignedReportVersionDto,
  CreateAssignedReportDto,
  ReportAssignmentStatus,
  ReportDataDto,
  UpdateAssignedReportDto,
} from "@epi/shared";
import type { JwtPayload } from "../../middlewares/auth.middleware.js";

type RawReport = {
  id: string;
  userId: string;
  templateKey: string;
  title: string;
  status: string;
  filters: unknown;
  textContent: unknown;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};
type RawVersion = {
  id: string;
  reportId: string;
  version: number;
  title: string;
  status: string;
  filters: unknown;
  textContent: unknown;
  actorUsername: string;
  createdAt: Date;
};
type RawReportWithUser = RawReport & {
  user: {
    organizationId: string | null;
    role: string;
    siteIds: string[];
  };
};

function forbidden(message: string) {
  return Object.assign(new Error(message), {
    statusCode: 403,
    code: "FORBIDDEN",
  });
}

function notFound(message: string) {
  return Object.assign(new Error(message), {
    statusCode: 404,
    code: "NOT_FOUND",
  });
}

// El propio asignado puede leer (listar/ver datos) su reporte; gestionarlo
// (crear/editar/borrar/cambiar estado) es solo de system_admin/org_admin.
function assertReadAccess(requester: JwtPayload, report: RawReportWithUser) {
  if (requester.sub === report.userId) return;
  if (requester.role === "system_admin") return;
  if (
    requester.role === "org_admin" &&
    report.user.organizationId === requester.organizationId
  )
    return;
  throw forbidden("Insufficient permissions to access this report");
}

function assertManageAccess(requester: JwtPayload, report: RawReportWithUser) {
  if (requester.role === "system_admin") return;
  if (
    requester.role === "org_admin" &&
    report.user.organizationId === requester.organizationId
  )
    return;
  throw forbidden("Insufficient permissions to manage this report");
}

function mapReport(row: RawReport): AssignedReportDto {
  return {
    id: row.id,
    userId: row.userId,
    templateKey: row.templateKey,
    title: row.title,
    status: row.status.toLowerCase() as ReportAssignmentStatus,
    filters: (row.filters as Record<string, unknown> | null) ?? null,
    textContent: (row.textContent as Record<string, string> | null) ?? null,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapVersion(row: RawVersion): AssignedReportVersionDto {
  return {
    id: row.id,
    reportId: row.reportId,
    version: row.version,
    title: row.title,
    status: row.status.toLowerCase() as ReportAssignmentStatus,
    filters: (row.filters as Record<string, unknown> | null) ?? null,
    textContent: (row.textContent as Record<string, string> | null) ?? null,
    actorUsername: row.actorUsername,
    createdAt: row.createdAt.toISOString(),
  };
}

async function loadOrThrow(id: string): Promise<RawReportWithUser> {
  const report = await assignedReportsRepository.findById(id);
  if (!report) throw notFound("Report not found");
  return report;
}

export const assignedReportsService = {
  async listMine(
    requester: JwtPayload,
    status?: string,
  ): Promise<AssignedReportDto[]> {
    const managesReports = requester.role === "system_admin" || requester.role === "org_admin";
    if (!managesReports && status && status.toUpperCase() !== "PUBLISHED") return [];
    const rows = await assignedReportsRepository.listForUser(
      requester.sub,
      managesReports ? status : "published",
    );
    return rows.map(mapReport);
  },

  async listManaged(requester: JwtPayload): Promise<AssignedReportDto[]> {
    const organizationId =
      requester.role === "org_admin" ? requester.organizationId! : undefined;
    const rows = await assignedReportsRepository.listScoped(organizationId);
    return rows.map(mapReport);
  },

  async create(
    requester: JwtPayload,
    dto: CreateAssignedReportDto,
  ): Promise<AssignedReportDto> {
    const targetUser = await usersRepository.findById(dto.userId);
    if (!targetUser) throw notFound("User not found");
    if (
      requester.role === "org_admin" &&
      targetUser.organizationId !== requester.organizationId
    ) {
      throw forbidden(
        "org_admin can only assign reports to users in their own organization",
      );
    }
    const report = await assignedReportsRepository.create(dto, {
      id: requester.sub,
      username: requester.username,
    });
    return mapReport(report);
  },

  async update(
    requester: JwtPayload,
    id: string,
    dto: UpdateAssignedReportDto,
  ): Promise<AssignedReportDto> {
    const existing = await loadOrThrow(id);
    assertManageAccess(requester, existing);
    const report = await assignedReportsRepository.update(id, dto, {
      id: requester.sub,
      username: requester.username,
    });
    return mapReport(report);
  },

  async remove(requester: JwtPayload, id: string): Promise<void> {
    const existing = await loadOrThrow(id);
    assertManageAccess(requester, existing);
    await assignedReportsRepository.delete(id);
  },

  async versions(
    requester: JwtPayload,
    id: string,
  ): Promise<AssignedReportVersionDto[]> {
    const existing = await loadOrThrow(id);
    assertReadAccess(requester, existing);
    const managesReports = requester.role === "system_admin" || requester.role === "org_admin";
    if (!managesReports && existing.status !== "PUBLISHED") throw forbidden("Report is not approved for viewing");
    const rows = await assignedReportsRepository.listVersions(id);
    return rows.filter((row) => managesReports || row.status === "PUBLISHED").map(mapVersion);
  },

  // Intersect the owner's assignments, report filters and reader's assignments.
  // Global administrators may inspect the owner's full permitted scope.
  async getData(
    requester: JwtPayload,
    id: string,
    siteId?: string,
  ): Promise<ReportDataDto> {
    const existing = await loadOrThrow(id);
    assertReadAccess(requester, existing);
    if (existing.status !== "PUBLISHED")
      throw forbidden("Report is not approved for viewing");

    const resolver = REPORT_DATA_RESOLVERS[existing.templateKey];
    const texts = (existing.textContent as Record<string, string> | null) ?? {};
    if (!resolver) return { kpis: {}, series: {}, tables: {}, texts };

    const ownerSiteIds = await allowedSiteIds({
      role: existing.user.role.toLowerCase(),
      organizationId: existing.user.organizationId,
      siteIds: existing.user.siteIds,
    });
    const filters =
      (existing.filters as Record<string, unknown> | null) ?? undefined;
    const assignedSiteIds = Array.isArray(filters?.siteIds)
      ? filters.siteIds.filter((id): id is string => typeof id === "string")
      : typeof filters?.siteIds === "string"
        ? filters.siteIds.split(",").filter(Boolean)
        : undefined;
    const ownerAndFilterSiteIds = assignedSiteIds?.length
      ? ownerSiteIds
        ? ownerSiteIds.filter((id) => assignedSiteIds.includes(id))
        : assignedSiteIds
      : ownerSiteIds;
    const reader = await usersRepository.findById(requester.sub);
    if (!reader) throw forbidden("User not found");
    const readerSiteIds = await allowedSiteIds({ ...reader, role: reader.role.toLowerCase() });
    const scopedSiteIds = readerSiteIds === undefined ? ownerAndFilterSiteIds
      : ownerAndFilterSiteIds === undefined ? readerSiteIds
      : ownerAndFilterSiteIds.filter((id) => readerSiteIds.includes(id));
    if (siteId && scopedSiteIds !== undefined && !scopedSiteIds.includes(siteId)) {
      throw forbidden("Site is outside your assigned sites");
    }
    const data = await resolver({
      siteId,
      ...(filters ? { filters } : {}),
      scope: { siteIds: scopedSiteIds, excludedSurveyDefinitionIds: [] },
    });
    return { ...data, texts };
  },
};
