import { onlineRequest } from "../../lib/api-client";
import type { ApiResponse, AssignedReportDto, ReportAssignmentStatus, ReportDataDto } from "@epi/shared";
import { REPORT_ASSIGNMENT_STATUSES } from "@epi/shared";
import { useAuthStore } from "../../store/auth.store";

async function call<T>(path: string): Promise<T> {
  const token = useAuthStore.getState().token;
  return onlineRequest<T>(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });

}

export const REPORT_STATUSES = REPORT_ASSIGNMENT_STATUSES;
export type ReportStatus = ReportAssignmentStatus;
export type AssignedReport = AssignedReportDto;

export const reportsApi = {
  assigned: (status?: ReportStatus) =>
    call<AssignedReport[]>(`/api/reports/assigned${status ? `?status=${status}` : ""}`),
  // siteId ausente/"" = alcance completo del usuario asignado ("Global").
  data: (reportId: string, siteId?: string) =>
    call<ReportDataDto>(`/api/reports/${reportId}/data${siteId ? `?siteId=${siteId}` : ""}`),
};
