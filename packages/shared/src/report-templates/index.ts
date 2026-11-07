import type { ReportDocumentTemplate } from "./types.js";
import { courseImpactsGeneralTemplate, courseImpactsBurtonTemplate, courseImpactsNcssmTemplate, courseImpactsTempletonTemplate } from "./course-impacts.template.js";

export * from "./types.js";

// Registro de plantillas: agregar un archivo nuevo + una línea aquí para dar de alta un reporte.
export const REPORT_TEMPLATES: Record<string, ReportDocumentTemplate> = {
  [courseImpactsGeneralTemplate.key]: courseImpactsGeneralTemplate,
  [courseImpactsNcssmTemplate.key]: courseImpactsNcssmTemplate,
  [courseImpactsBurtonTemplate.key]: courseImpactsBurtonTemplate,
  [courseImpactsTempletonTemplate.key]: courseImpactsTempletonTemplate,
};

export function getReportTemplate(key: string): ReportDocumentTemplate | undefined {
  return REPORT_TEMPLATES[key];
}
