import { assignedReportsRepository } from "./assigned-reports.repository.js";
import { usersRepository } from "../users/users.repository.js";
import type {
  AssignedReportDto,
  AssignedReportVersionDto,
  CreateAssignedReportDto,
  ReportAssignmentStatus,
  ReportDataDto,
  UpdateAssignedReportDto,
} from "@epi/shared";
import type { JwtPayload } from "../../middlewares/auth.middleware.js";

type RawReport = { id: string; userId: string; templateKey: string; title: string; status: string; filters: unknown; version: number; createdAt: Date; updatedAt: Date };
type RawVersion = { id: string; reportId: string; version: number; title: string; status: string; filters: unknown; actorUsername: string; createdAt: Date };
type RawReportWithUser = RawReport & { user: { organizationId: string | null } };

function forbidden(message: string) {
  return Object.assign(new Error(message), { statusCode: 403, code: "FORBIDDEN" });
}

function notFound(message: string) {
  return Object.assign(new Error(message), { statusCode: 404, code: "NOT_FOUND" });
}

// El propio asignado puede leer (listar/ver datos) su reporte; gestionarlo
// (crear/editar/borrar/cambiar estado) es solo de system_admin/org_admin.
function assertReadAccess(requester: JwtPayload, report: RawReportWithUser) {
  if (requester.sub === report.userId) return;
  if (requester.role === "system_admin") return;
  if (requester.role === "org_admin" && report.user.organizationId === requester.organizationId) return;
  throw forbidden("Insufficient permissions to access this report");
}

function assertManageAccess(requester: JwtPayload, report: RawReportWithUser) {
  if (requester.role === "system_admin") return;
  if (requester.role === "org_admin" && report.user.organizationId === requester.organizationId) return;
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
  async listMine(requester: JwtPayload, status?: string): Promise<AssignedReportDto[]> {
    const rows = await assignedReportsRepository.listForUser(requester.sub, status);
    return rows.map(mapReport);
  },

  async listManaged(requester: JwtPayload): Promise<AssignedReportDto[]> {
    const organizationId = requester.role === "org_admin" ? requester.organizationId! : undefined;
    const rows = await assignedReportsRepository.listScoped(organizationId);
    return rows.map(mapReport);
  },

  async create(requester: JwtPayload, dto: CreateAssignedReportDto): Promise<AssignedReportDto> {
    const targetUser = await usersRepository.findById(dto.userId);
    if (!targetUser) throw notFound("User not found");
    if (requester.role === "org_admin" && targetUser.organizationId !== requester.organizationId) {
      throw forbidden("org_admin can only assign reports to users in their own organization");
    }
    const report = await assignedReportsRepository.create(dto, { id: requester.sub, username: requester.username });
    return mapReport(report);
  },

  async update(requester: JwtPayload, id: string, dto: UpdateAssignedReportDto): Promise<AssignedReportDto> {
    const existing = await loadOrThrow(id);
    assertManageAccess(requester, existing);
    const report = await assignedReportsRepository.update(id, dto, { id: requester.sub, username: requester.username });
    return mapReport(report);
  },

  async remove(requester: JwtPayload, id: string): Promise<void> {
    const existing = await loadOrThrow(id);
    assertManageAccess(requester, existing);
    await assignedReportsRepository.delete(id);
  },

  async versions(requester: JwtPayload, id: string): Promise<AssignedReportVersionDto[]> {
    const existing = await loadOrThrow(id);
    assertReadAccess(requester, existing);
    const rows = await assignedReportsRepository.listVersions(id);
    return rows.map(mapVersion);
  },

  // Siempre vacío: ninguna plantilla hoy tiene una fuente de datos real
  // conectada (ver features/reports/templates — son ejemplos). El shape
  // correcto es suficiente para que el renderer del frontend funcione
  // (kpis/series/tables ausentes se muestran como "—"/vacío, no rompen).
  async getData(requester: JwtPayload, id: string): Promise<ReportDataDto> {
    const existing = await loadOrThrow(id);
    assertReadAccess(requester, existing);
    return { kpis: {}, series: {}, tables: {} };
  },
};
