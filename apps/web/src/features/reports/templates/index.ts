import type { ReportTemplate } from "./types";
import { courseImpactsBurtonTemplate, courseImpactsNcssmTemplate, courseImpactsTempletonTemplate } from "./course-impacts.template";

export * from "./types";

// Registro de plantillas: agregar un archivo nuevo + una línea aquí para dar de alta un reporte.
export const REPORT_TEMPLATES: Record<string, ReportTemplate> = {
  [courseImpactsNcssmTemplate.key]: courseImpactsNcssmTemplate,
  [courseImpactsBurtonTemplate.key]: courseImpactsBurtonTemplate,
  [courseImpactsTempletonTemplate.key]: courseImpactsTempletonTemplate,
};

export function getReportTemplate(key: string): ReportTemplate | undefined {
  return REPORT_TEMPLATES[key];
}
