import type { ReportDataDto } from "@epi/shared";
import { surveysRepository } from "../surveys/surveys.repository.js";
import { aggregateCategoryResults } from "../surveys/surveys.service.js";

export type ResolverScope = { siteIds: string[] | undefined; excludedSurveyDefinitionIds: string[] };
export type ResolverArgs = { siteId?: string | undefined; scope: ResolverScope; filters?: Record<string, unknown> };
type ResolverResult = Omit<ReportDataDto, "texts">;
type CompletedSubmission = {
  id: string;
  participantId: string | null;
  surveyDefinitionId: string | null;
  results: { category: string; subcategory: string | null; calculatedScore: number; maxPossible: number; isPrePost: boolean }[];
};

function filterString(filters: Record<string, unknown> | undefined, key: string) {
  const value = filters?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

// Reporte de temporada por sitio: cursos/participantes/encuestas completadas
// + comparativo pre/post por categoría, con datos reales de Submission/
// AggregatedResult — mismo cálculo que surveysService.reportResults, para
// que interactive-reports muestre lo mismo que ya se ve en /reports.
async function seasonalSiteReport({ siteId, scope, filters }: ResolverArgs): Promise<ResolverResult> {
  let siteIds = scope.siteIds;
  if (siteId) {
    if (siteIds && !siteIds.includes(siteId)) return { kpis: {}, series: {}, tables: {} };
    siteIds = [siteId];
  }

  const subs: CompletedSubmission[] = await surveysRepository.completedWithResults({
    scope: { siteIds, excludedSurveyDefinitionIds: scope.excludedSurveyDefinitionIds },
    school: filterString(filters, "school"),
    groupName: filterString(filters, "groupName"),
    from: filterString(filters, "from"),
    to: filterString(filters, "to"),
  });

  const categoryRows = aggregateCategoryResults(subs);
  const courses = new Set(subs.map((s: CompletedSubmission) => s.surveyDefinitionId).filter(Boolean)).size;
  const participants = new Set(subs.map((s: CompletedSubmission) => s.participantId).filter(Boolean)).size;

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

async function courseImpacts(args: ResolverArgs): Promise<ResolverResult> {
  const data = await seasonalSiteReport(args);
  const rows = data.tables.categoryBreakdown ?? [];
  const withChange = rows
    .filter((r) => typeof r.change === "number")
    .sort((a, b) => Number(b.change) - Number(a.change));
  const changes = withChange.map((r) => Number(r.change));
  const overallImprovement = changes.length ? Math.round((changes.reduce((a, b) => a + b, 0) / changes.length) * 10) / 10 : 0;

  return {
    kpis: { ...data.kpis, overallImprovement },
    series: {
      ...data.series,
      courseActivitySatisfaction: [],
      spotlightRows: withChange.slice(0, 6),
    },
    tables: {
      ...data.tables,
      mostImproved: withChange.slice(0, 1),
    },
  };
}

// Registro de resolvers por templateKey — plantillas sin resolver aquí
// devuelven data vacía (ver assigned-reports.service.ts#getData).
export const REPORT_DATA_RESOLVERS: Record<string, (args: ResolverArgs) => Promise<ResolverResult>> = {
  "seasonal-site-report": seasonalSiteReport,
  "course-impacts-2026mx-ncssm": courseImpacts,
  "course-impacts-2026cr-burton": courseImpacts,
  "course-impacts-2026mx-templeton": courseImpacts,
};
