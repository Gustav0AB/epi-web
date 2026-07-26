import type { ReportTemplate } from "./types";
import { operationalFinancialTemplate } from "./operational-financial.template";
import { activitiesAttendanceTemplate } from "./activities-attendance.template";

export * from "./types";

// Registro de plantillas: agregar un archivo nuevo + una línea aquí para dar de alta un reporte.
export const REPORT_TEMPLATES: Record<string, ReportTemplate> = {
  [operationalFinancialTemplate.key]: operationalFinancialTemplate,
  [activitiesAttendanceTemplate.key]: activitiesAttendanceTemplate,
};

export function getReportTemplate(key: string): ReportTemplate | undefined {
  return REPORT_TEMPLATES[key];
}
