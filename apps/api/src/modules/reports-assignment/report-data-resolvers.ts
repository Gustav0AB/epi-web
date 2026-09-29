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

const COURSE_IMPACT_DEMOS: Record<string, ResolverResult> = {
  "course-impacts-2026mx-ncssm": {
    kpis: { overallSatisfaction: 94, overallImprovement: 15.1 },
    series: {
      courseActivitySatisfaction: [
        { name: "Team Building Activities", post: 100 },
        { name: "Outdoor activities", post: 100 },
        { name: "Research & Conservation activities", post: 100 },
        { name: "Interactive Educational Lessons", post: 100 },
        { name: "Discussion and reflection spaces", post: 100 },
      ],
      categoryComparison: [
        { name: "Ecological Knowledge", pre: 45, post: 61 },
        { name: "Dispositions", pre: 65, post: 73 },
        { name: "Competencies", pre: 62, post: 78 },
        { name: "Social-Emotional Skills", pre: 72, post: 80 },
      ],
      spotlightRows: [
        { name: "Identify and Ask", pre: 70, post: 87 },
        { name: "Design and Collect", pre: 85, post: 90 },
        { name: "Analyze and Interpret", pre: 61, post: 88 },
        { name: "Construct Explanations", pre: 25, post: 88 },
        { name: "Articulate and Present", pre: 70, post: 83 },
        { name: "Argument with evidence", pre: 93, post: 86 },
      ],
    },
    tables: {
      categoryBreakdown: [
        { name: "Ecological Knowledge", pre: 45, post: 61, change: 16 },
        { name: "Dispositions", pre: 65, post: 73, change: 8 },
        { name: "Competencies", pre: 62, post: 78, change: 16 },
        { name: "Social-Emotional Skills", pre: 72, post: 80, change: 8 },
      ],
      mostImproved: [{ name: "Action Strategies", change: 36.5 }],
    },
  },
  "course-impacts-2026cr-burton": {
    kpis: { overallSatisfaction: 100, overallImprovement: 6.6 },
    series: {
      courseActivitySatisfaction: [
        { name: "Team Building Activities", post: 100 },
        { name: "Outdoor activities", post: 100 },
        { name: "Research & Conservation activities", post: 100 },
        { name: "Interactive Educational Lessons", post: 100 },
        { name: "Rainforest Activities", post: 80 },
      ],
      categoryComparison: [
        { name: "Ecological Knowledge", pre: 48, post: 58 },
        { name: "Dispositions", pre: 63, post: 64 },
        { name: "Competencies", pre: 41, post: 51 },
        { name: "Social-Emotional Skills", pre: 78, post: 79 },
      ],
      spotlightRows: [
        { name: "Identify and Ask", pre: 85, post: 92 },
        { name: "Design and Collect", pre: 73, post: 92 },
        { name: "Analyze and Interpret", pre: 78, post: 92 },
        { name: "Construct Explanations", pre: 78, post: 92 },
        { name: "Articulate and Present", pre: 87, post: 95 },
        { name: "Argument with evidence", pre: 89, post: 95 },
      ],
    },
    tables: {
      categoryBreakdown: [
        { name: "Ecological Knowledge", pre: 48, post: 58, change: 10 },
        { name: "Dispositions", pre: 63, post: 64, change: 1 },
        { name: "Competencies", pre: 41, post: 51, change: 10 },
        { name: "Social-Emotional Skills", pre: 78, post: 79, change: 1 },
      ],
      mostImproved: [{ name: "Action Strategies", change: 26.6 }],
    },
  },
  "course-impacts-2026mx-templeton": {
    kpis: { overallSatisfaction: 94, overallImprovement: 10.6 },
    series: {
      courseActivitySatisfaction: [
        { name: "Team Building Activities", post: 100 },
        { name: "Outdoor activities", post: 100 },
        { name: "Interactive Educational Lessons", post: 100 },
        { name: "Discussion and reflection spaces", post: 100 },
        { name: "Snorkeling", post: 100 },
      ],
      categoryComparison: [
        { name: "Ecological Knowledge", pre: 52, post: 62 },
        { name: "Dispositions", pre: 68, post: 74 },
        { name: "Competencies", pre: 61, post: 79 },
        { name: "Social-Emotional Skills", pre: 73, post: 81 },
      ],
      spotlightRows: [
        { name: "Identify and Ask", pre: 80, post: 86 },
        { name: "Design and Collect", pre: 71, post: 93 },
        { name: "Analyze and Interpret", pre: 78, post: 89 },
        { name: "Construct Explanations", pre: 71, post: 87 },
        { name: "Articulate and Present", pre: 85, post: 92 },
        { name: "Argument with evidence", pre: 82, post: 86 },
      ],
    },
    tables: {
      categoryBreakdown: [
        { name: "Ecological Knowledge", pre: 52, post: 62, change: 10 },
        { name: "Dispositions", pre: 68, post: 74, change: 6 },
        { name: "Competencies", pre: 61, post: 79, change: 18 },
        { name: "Social-Emotional Skills", pre: 73, post: 81, change: 8 },
      ],
      mostImproved: [{ name: "Action Strategies", change: 22.7 }],
    },
  },
};

function filterString(filters: Record<string, unknown> | undefined, key: string) {
  const value = filters?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function endOfDay(value: string | undefined) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T23:59:59` : value;
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
    type: ["LOCAL", "VISITING"].includes(filterString(filters, "type") ?? "")
      ? filterString(filters, "type") as "LOCAL" | "VISITING"
      : undefined,
    school: filterString(filters, "school"),
    groupName: filterString(filters, "groupName"),
    from: filterString(filters, "from"),
    to: endOfDay(filterString(filters, "to")),
  });

  const categoryRows = aggregateCategoryResults(subs, filterString(filters, "category"));
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
  const demo = COURSE_IMPACT_DEMOS[filterString(args.filters, "demo") ?? ""];
  if (demo) return demo;
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
  "course-impacts-2026mx-ncssm": courseImpacts,
  "course-impacts-2026cr-burton": courseImpacts,
  "course-impacts-2026mx-templeton": courseImpacts,
};
