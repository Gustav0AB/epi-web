import { relativeChange } from "./relative-change.js";
import type { CourseResultsDto } from "./schemas/course-results.schema.js";

export function combineCourseWeights(items: { key: string; weight: number; value: number | null }[]) {
  const valid = items.filter(item => item.value !== null && Number.isFinite(item.value) && item.weight > 0 && Number.isFinite(item.weight));
  const total = valid.reduce((sum, item) => sum + item.weight, 0);
  if (!total || !Number.isFinite(total)) return { value: null, weights: [] };
  return { value: valid.reduce((sum, item) => sum + item.value! * (item.weight / total), 0), weights: valid.map(item => ({ key: item.key, weight: item.weight / total * 100 })) };
}

export function courseResultCategories(result: CourseResultsDto) {
  return [...new Set([
    ...result.aggregates.filter(row => row.definitionId === result.primaryDefinitionId).flatMap(row => row.category ? [row.category] : []),
    ...result.questions.filter(row => row.definitionId === result.primaryDefinitionId).flatMap(row => row.category ? [row.category] : []),
  ])].sort((a, b) => a.localeCompare(b));
}

export function selectCourseResultCategories(result: CourseResultsDto, selection?: string[]): CourseResultsDto {
  if (selection === undefined) return result;
  const available = courseResultCategories(result);
  if (!selection.length || new Set(selection).size !== selection.length || selection.some(category => !available.includes(category))) throw new Error("Selecciona al menos una categoría válida del instrumento");
  const included = available.filter(category => selection.includes(category));
  const newlyExcluded = available.filter(category => !selection.includes(category));
  const excluded = [...new Set([...(result.categorySelection?.excluded ?? []), ...newlyExcluded])].sort((a, b) => a.localeCompare(b));
  if (!newlyExcluded.length) return { ...result, categorySelection: { included, excluded } };
  const distributions = result.distributions.map(distribution => {
    const weights = distribution.categoryWeights?.filter(item => selection.includes(item.category)) ?? null;
    const total = weights?.reduce((sum, item) => sum + (item.weight ?? 0), 0) ?? 0;
    return { ...distribution, categoryWeights: weights?.map(item => ({ ...item, weight: item.weight !== null && total > 0 ? item.weight / total * 100 : item.weight })) ?? null,
      subcategoryWeights: distribution.subcategoryWeights?.filter(item => selection.includes(item.category)) ?? null };
  });
  const aggregates = result.aggregates.filter(row => row.level === "index" || row.category !== null && selection.includes(row.category)).map(row => {
    if (row.level !== "index") return row;
    const categories = result.aggregates.filter(item => item.definitionId === row.definitionId && item.level === "category" && item.category !== null && selection.includes(item.category));
    const weights = distributions.find(item => item.definitionId === row.definitionId)?.categoryWeights ?? [];
    const issue = categories.some(item => item.issue) ? "Revisar categorías incluidas"
      : !categories.length || categories.some(item => !weights.some(weight => weight.category === item.category && weight.weight !== null)) || !weights.some(item => (item.weight ?? 0) > 0) ? "Revisar pesos de las categorías incluidas" : null;
    const values = (moment: "pre" | "post") => categories.map(category => ({ key: category.category!, value: category[moment], weight: weights.find(item => item.category === category.category)?.weight ?? 0 }));
    const pre = issue ? { value: null, weights: [] } : combineCourseWeights(values("pre"));
    const post = issue ? { value: null, weights: [] } : combineCourseWeights(values("post"));
    // A different index composition cannot reuse deviation computed from the full receipt score.
    const { standardDeviation, ...original } = row;
    return { ...original, pre: pre.value, post: post.value, change: relativeChange(pre.value, post.value), preEffectiveWeights: pre.weights, postEffectiveWeights: post.weights, issue };
  });
  return { ...result, categorySelection: { included, excluded }, distributions, aggregates,
    questions: result.questions.filter(row => row.category !== null && selection.includes(row.category)),
    groups: result.groups.filter(row => row.category !== null && selection.includes(row.category)),
  };
}
