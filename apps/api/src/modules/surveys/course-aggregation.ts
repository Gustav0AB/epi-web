import { combineCourseWeights as combine } from "@epi/shared";
import { AnalysisWeightsSchema, type CourseAggregate, type PrePostQuestionBase } from "@epi/shared";
import type { ResultsDefinition } from "./course-results.js";
type Weighted = { key: string; weight: number; value: number | null };
function completeWeights(keys: string[], settings: { key: string; weight: number | null }[]) {
  return keys.length > 0 && settings.length === keys.length && keys.every(key => settings.some(item => item.key === key && item.weight !== null && Number.isFinite(item.weight) && item.weight >= 0)) && Math.abs(settings.reduce((sum, item) => sum + (item.weight ?? 0), 0) - 100) < 1e-6;
}
export function aggregateCourseQuestions(questions: PrePostQuestionBase[], definitions: ResultsDefinition[]): CourseAggregate[] {
  const rows: CourseAggregate[] = [];
  for (const definition of definitions) {
    if (definition.instrumentKind !== "LEARNING" || definition.configurationVersion !== 4) continue;
    const source = questions.filter(question => question.definitionId === definition.id);
    const parsed = AnalysisWeightsSchema.safeParse(definition.analysisWeights);
    const configured = parsed.success ? parsed.data.find(item => item.analysisType === "pre_post") : null;
    function append(level: CourseAggregate["level"], category: string | null, subcategory: string | null, pre: Weighted[], post: Weighted[], issue: string | null = null) {
      const before = issue ? { value: null, weights: [] } : combine(pre); const after = issue ? { value: null, weights: [] } : combine(post);
      const row: CourseAggregate = { definitionId: definition.id, instrument: definition.instrumentName || "Instrumento", version: definition.version, level, category, subcategory, pre: before.value, post: after.value, change: before.value === null || after.value === null ? null : after.value - before.value, preEffectiveWeights: before.weights, postEffectiveWeights: after.weights, issue };
      rows.push(row); return row;
    }
    const categories = [...new Set(source.flatMap(question => question.category ? [question.category] : []))];
    for (const category of categories) {
      const subs = [...new Set(source.filter(question => question.category === category).flatMap(question => question.subcategory ? [question.subcategory] : []))];
      const subRows = subs.map(subcategory => {
        const qs = source.filter(question => question.category === category && question.subcategory === subcategory);
        const values = (moment: "pre" | "post") => qs.map(question => { const base = question[moment]; return { key: question.id, weight: question.factor, value: base.points === null || base.applicableMaximum === null || base.applicableMaximum <= 0 ? null : base.points / base.applicableMaximum * 100 }; });
        return append("subcategory", category, subcategory, values("pre"), values("post"), qs.some(question => !question.configurationReady || !Number.isFinite(question.factor) || question.factor <= 0) ? "Revisar configuración de preguntas o pesos" : null);
      });
      const weights = (configured?.subcategoryWeights ?? []).filter(item => item.category === category).map(item => ({ key: item.subcategory, weight: item.weight }));
      const issue = !completeWeights(subs, weights) ? "Distribución de subcategorías incompleta: debe sumar 100%" : subRows.some(row => row.issue) ? "Revisar subcategorías" : null;
      const values = (moment: "pre" | "post") => subRows.map(row => ({ key: row.subcategory!, value: row[moment], weight: weights.find(item => item.key === row.subcategory)?.weight ?? 0 }));
      append("category", category, null, values("pre"), values("post"), issue);
    }
    const categoryRows = rows.filter(row => row.definitionId === definition.id && row.level === "category");
    const weights = (configured?.categoryWeights ?? []).map(item => ({ key: item.category, weight: item.weight }));
    const issue = source.some(question => !question.category || !question.subcategory) ? "Clasificación pendiente" : !completeWeights(categories, weights) ? "Distribución de categorías incompleta: debe sumar 100%" : categoryRows.some(row => row.issue) ? "Revisar categorías" : null;
    const values = (moment: "pre" | "post") => categoryRows.map(row => ({ key: row.category!, value: row[moment], weight: weights.find(item => item.key === row.category)?.weight ?? 0 }));
    append("index", null, null, values("pre"), values("post"), issue);
  }
  return rows;
}
