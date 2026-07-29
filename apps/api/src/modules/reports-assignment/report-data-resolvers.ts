import type { ReportDataDto } from "@epi/shared";
import { surveysRepository } from "../surveys/surveys.repository.js";
import { aggregateCategoryResults } from "../surveys/surveys.service.js";

export type ResolverScope = { siteIds: string[] | undefined; excludedSurveyDefinitionIds: string[] };
export type ResolverArgs = { siteId?: string | undefined; scope: ResolverScope };
type ResolverResult = Omit<ReportDataDto, "texts">;

// Reporte de temporada por sitio: cursos/participantes/encuestas completadas
// + comparativo pre/post por categoría, con datos reales de Submission/
// AggregatedResult — mismo cálculo que surveysService.reportResults, para
// que interactive-reports muestre lo mismo que ya se ve en /reports.
async function seasonalSiteReport({ siteId, scope }: ResolverArgs): Promise<ResolverResult> {
  let siteIds = scope.siteIds;
  if (siteId) {
    if (siteIds && !siteIds.includes(siteId)) return { kpis: {}, series: {}, tables: {} };
    siteIds = [siteId];
  }

  const subs = await surveysRepository.completedWithResults({
    scope: { siteIds, excludedSurveyDefinitionIds: scope.excludedSurveyDefinitionIds },
  });

  const categoryRows = aggregateCategoryResults(subs);
  const courses = new Set(subs.map((s) => s.surveyDefinitionId).filter(Boolean)).size;
  const participants = new Set(subs.map((s) => s.participantId).filter(Boolean)).size;

  const categoryComparison = categoryRows.map((r) => ({
    name: r.subcategory ?? r.category,
    pre: r.pre,
    post: r.post,
  }));
  const categoryBreakdown = categoryRows.map((r) => ({
    name: r.subcategory ?? r.category,
    pre: r.pre,
    post: r.post,
    change: r.change,
  }));

  return {
    kpis: { courses, participants, completedSurveys: subs.length },
    series: { categoryComparison },
    tables: { categoryBreakdown },
  };
}

// Registro de resolvers por templateKey — plantillas sin resolver aquí
// devuelven data vacía (ver assigned-reports.service.ts#getData).
export const REPORT_DATA_RESOLVERS: Record<string, (args: ResolverArgs) => Promise<ResolverResult>> = {
  "seasonal-site-report": seasonalSiteReport,
};
