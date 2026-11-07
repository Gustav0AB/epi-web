import { AnalysisWeightsSchema, type CourseAggregate } from "@epi/shared";
import { aggregateCourseQuestions } from "./course-aggregation.js";
import { courseResultBases, type ResultsDefinition, type ResultsReceipt } from "./course-results.js";

type RunningStats = { n: number; mean: number; sumSquares: number };
const empty = (): RunningStats => ({ n: 0, mean: 0, sumSquares: 0 });
const key = (row: CourseAggregate) => JSON.stringify([row.definitionId, row.level, row.category, row.subcategory]);

export function addCourseStandardDeviations(aggregates: CourseAggregate[], receipts: ResultsReceipt[], definitions: ResultsDefinition[]): CourseAggregate[] {
  const methods = new Map<string, "sample" | "population">();
  for (const definition of definitions) {
    const parsed = AnalysisWeightsSchema.safeParse(definition.analysisWeights);
    const method = parsed.success ? parsed.data.find(item => item.analysisType === "pre_post")?.standardDeviation : undefined;
    if (definition.instrumentKind === "LEARNING" && definition.configurationVersion === 4 && (method === "sample" || method === "population")) methods.set(definition.id, method);
  }
  if (!methods.size) return aggregates;
  const stats = new Map<string, { pre: RunningStats; post: RunningStats }>();
  for (const receipt of receipts) {
    if (!methods.has(receipt.definition.id) || receipt.excluded || receipt.contextPending || (receipt.moment !== "PRE" && receipt.moment !== "POST")) continue;
    const moment = receipt.moment === "PRE" ? "pre" : "post";
    // shortcut: reuse the versioned scorer per receipt; batch group scoring if measured course sizes require it.
    const bases = courseResultBases([receipt], [receipt.definition]);
    const values = aggregateCourseQuestions(bases.questions, [receipt.definition]);
    for (const row of values) {
      const value = row[moment];
      if (row.issue || value === null || !Number.isFinite(value)) continue;
      const group = stats.get(key(row)) ?? { pre: empty(), post: empty() };
      const state = group[moment];
      state.n++;
      const delta = value - state.mean;
      state.mean += delta / state.n;
      state.sumSquares += delta * (value - state.mean);
      stats.set(key(row), group);
    }
  }
  return aggregates.map(row => {
    const method = methods.get(row.definitionId);
    if (!method) return row;
    const group = stats.get(key(row)) ?? { pre: empty(), post: empty() };
    function finish(state: RunningStats) {
      const denominator = method === "sample" ? state.n - 1 : state.n;
      return { n: state.n, mean: state.n ? state.mean : null, value: denominator > 0 ? Math.sqrt(Math.max(0, state.sumSquares / denominator)) : null };
    }
    return { ...row, standardDeviation: { method, pre: finish(group.pre), post: finish(group.post) } };
  });
}
