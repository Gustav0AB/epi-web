import type { ApiResponse, AssignedReportDto, ReportAssignmentStatus, ReportDataDto } from "@epi/shared";
import { REPORT_ASSIGNMENT_STATUSES } from "@epi/shared";
import { useAuthStore } from "../../store/auth.store";

async function call<T>(path: string): Promise<T> {
  const token = useAuthStore.getState().token;
  const res = await fetch(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const json = (await res.json()) as ApiResponse<T>;
  if (!json.success) throw new Error(json.error.message);
  return json.data;
}

export const REPORT_STATUSES = REPORT_ASSIGNMENT_STATUSES;
export type ReportStatus = ReportAssignmentStatus;
export type AssignedReport = AssignedReportDto;

export const reportsApi = {
  assigned: (status?: ReportStatus) =>
    call<AssignedReport[]>(`/api/reports/assigned${status ? `?status=${status}` : ""}`),
  data: (reportId: string) => call<ReportDataDto>(`/api/reports/${reportId}/data`),
};
