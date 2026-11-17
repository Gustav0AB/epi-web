import { ANALYSIS_TYPES, type AnalysisType, type AnalysisWeights, type AnalysisNumericRange, type AnalysisResponsePolicy, type SurveySetupQuestion } from "./schemas/survey.schema.js";

import { scoringGroups, validScoringWeights } from "./scoring-weights.js";

export function correctAnswerValues(rule: { correctAnswer?: string | null | undefined; correctAnswers?: string[] | undefined } | null | undefined): string[] {
  return rule?.correctAnswers ?? (rule?.correctAnswer ? [rule.correctAnswer] : []);
}

type AnalysisQuestion = Pick<SurveySetupQuestion, "role" | "type" | "analysisParticipation">;
export function canConfigureAnalysis(question: AnalysisQuestion) {
  return (question.role ?? "SCORED") === "SCORED" && question.type !== "OPEN_TEXT";
}

export function configuredForAnalysis(question: AnalysisQuestion, analysisType: AnalysisType) {
  return canConfigureAnalysis(question) && question.analysisParticipation?.some(item => item.analysisType === analysisType && item.enabled) === true;
}

export function setAnalysisParticipation<T extends SurveySetupQuestion>(questions: T[], externalIds: string[], analysisType: AnalysisType, enabled: boolean): T[] {
  const selected = new Set(externalIds);
  return questions.map(question => !selected.has(question.externalId) || !canConfigureAnalysis(question) ? question : {
    ...question,
    analysisParticipation: ANALYSIS_TYPES.map(type => ({ analysisType: type, enabled: type === analysisType ? enabled : question.analysisParticipation?.some(item => item.analysisType === type && item.enabled) === true })),
  });
}

export function analysisScoringReady(questions: (SurveySetupQuestion & { options?: string[] })[], analysisType?: AnalysisType) {
  return questions.every(question => !canConfigureAnalysis(question) || ANALYSIS_TYPES.filter(type => analysisType === undefined || type === analysisType).every(type => {
    if (!configuredForAnalysis(question, type)) return true;
    const rule = question.analysisScoring?.find(item => item.analysisType === type);
    if (rule == null || rule.maxScore === null || !Number.isFinite(rule.maxScore) || rule.maxScore < 0) return false;
    if (rule.responsePolicy != null && (rule.responsePolicy.blank !== "exclude" || rule.responsePolicy.invalid !== "review")) return false;
    if (rule.scoringMode === "ordered_scale") {
      const options = question.options ?? [];
      return options.length > 0 && new Set(options).size === options.length &&
        JSON.stringify(rule.scaleOptions) === JSON.stringify(options) &&
        (rule.excludedOptions ?? []).every(value => options.includes(value)) && options.some(value => !rule.excludedOptions?.includes(value)) &&
        rule.correctAnswer == null && !rule.correctAnswers?.length && rule.optionScores === undefined && rule.numericRange === undefined;
    }
    if (rule.scoringMode === "numeric_range") {
      const range = rule.numericRange;
      return question.type !== "ONE_ANSWER" && !question.options?.length && range != null &&
        range.minimum !== null && range.maximum !== null && Number.isFinite(range.minimum) && Number.isFinite(range.maximum) &&
        range.minimum < range.maximum && Number.isFinite(range.maximum - range.minimum) &&
        (range.direction === "direct" || range.direction === "reverse");
    }
    if (rule.scoringMode === "option_scores") {
      const options = question.options ?? [];
      return options.length > 0 && new Set(options).size === options.length && rule.optionScores?.length === options.length &&
        new Set(rule.optionScores.map(item => item.value)).size === options.length && rule.optionScores.some(item => !item.excluded) &&
        options.every(value => rule.optionScores!.some(item => item.value === value && (item.excluded === true || item.score !== null && Number.isFinite(item.score) && item.score >= 0 && item.score <= rule.maxScore!)));
    }
    const correct = correctAnswerValues(rule);
    return question.type !== "ONE_ANSWER" || (correct.length > 0 && correct.every(value => !!value.trim() && (!question.options?.length || question.options.includes(value))) && (!rule.correctAnswers || rule.correctAnswer === null || rule.correctAnswer === correct[0]));
  }));
}

export function setAnalysisScoring<T extends SurveySetupQuestion>(questions: T[], externalId: string, analysisType: AnalysisType, patch: Partial<Omit<NonNullable<SurveySetupQuestion["analysisScoring"]>[number], "analysisType">>): T[] {
  return questions.map(question => question.externalId !== externalId || !configuredForAnalysis(question, analysisType) ? question : {
    ...question,
    analysisScoring: [...(question.analysisScoring ?? []).filter(item => item.analysisType !== analysisType), { analysisType, maxScore: null, correctAnswer: null, ...question.analysisScoring?.find(item => item.analysisType === analysisType), ...patch }],
  });
}

export function setAnalysisNumericRange<T extends SurveySetupQuestion>(questions: T[], externalId: string, analysisType: AnalysisType, patch: Partial<AnalysisNumericRange>): T[] {
  const rule = questions.find(item => item.externalId === externalId)?.analysisScoring?.find(item => item.analysisType === analysisType);
  if (rule?.scoringMode !== "numeric_range") return questions;
  return setAnalysisScoring(questions, externalId, analysisType, { numericRange: { minimum: null, maximum: null, direction: null, ...rule.numericRange, ...patch } });
}

export function setAnalysisOptionScore<T extends SurveySetupQuestion & { options: string[] }>(questions: T[], externalId: string, analysisType: AnalysisType, value: string, score: number | null): T[] {
  const question = questions.find(item => item.externalId === externalId);
  if (!question?.options.includes(value) || question.analysisScoring?.find(item => item.analysisType === analysisType)?.scoringMode !== "option_scores") return questions;
  const previous = question.analysisScoring.find(item => item.analysisType === analysisType)?.optionScores ?? [];
  return setAnalysisScoring(questions, externalId, analysisType, { optionScores: [...previous.filter(item => item.value !== value), { ...previous.find(item => item.value === value), value, score }] });
}

export function setAnalysisOptionExclusion<T extends SurveySetupQuestion & { options: string[] }>(questions: T[], externalId: string, analysisType: AnalysisType, value: string, excluded: boolean): T[] {
  const question = questions.find(item => item.externalId === externalId);
  if (!question?.options.includes(value) || question.analysisScoring?.find(item => item.analysisType === analysisType)?.scoringMode !== "option_scores") return questions;
  const previous = question.analysisScoring.find(item => item.analysisType === analysisType)?.optionScores ?? [];
  return setAnalysisScoring(questions, externalId, analysisType, { optionScores: [...previous.filter(item => item.value !== value), { score: null, ...previous.find(item => item.value === value), value, excluded }] });
}

export function setAnalysisResponsePolicy<T extends SurveySetupQuestion>(questions: T[], externalId: string, analysisType: AnalysisType, patch: Partial<AnalysisResponsePolicy>): T[] {
  const rule = questions.find(item => item.externalId === externalId)?.analysisScoring?.find(item => item.analysisType === analysisType);
  return setAnalysisScoring(questions, externalId, analysisType, { responsePolicy: { blank: null, invalid: null, ...rule?.responsePolicy, ...patch } });
}

// Inactive groups remain stored, but do not affect counts or validation.
export function activeAnalysisWeights(questions: SurveySetupQuestion[], settings: AnalysisWeights, analysisType: AnalysisType, includeIaa: boolean) {
  const rows = questions.filter(question => configuredForAnalysis(question, analysisType));
  const groups = scoringGroups(rows);
  const saved = settings.find(item => item.analysisType === analysisType);
  return {
    categoryWeights: includeIaa ? [...new Set(groups.map(group => group.category))].map(category => saved?.categoryWeights.find(item => item.category === category) ?? { category, weight: null }) : [],
    subcategoryWeights: groups.map(group => saved?.subcategoryWeights.find(item => item.category === group.category && item.subcategory === group.subcategory) ?? { category: group.category, subcategory: group.subcategory, weight: null }),
  };
}

export function analysisWeightsReady(questions: SurveySetupQuestion[], settings: AnalysisWeights, includeIaa: boolean) {
  return ANALYSIS_TYPES.every(type => {
    const active = activeAnalysisWeights(questions, settings, type, includeIaa);
    return validScoringWeights(questions.filter(question => configuredForAnalysis(question, type)), active.categoryWeights, active.subcategoryWeights, includeIaa);
  });
}

export function setAnalysisWeights(settings: AnalysisWeights, analysisType: AnalysisType, patch: Partial<Pick<AnalysisWeights[number], "categoryWeights" | "subcategoryWeights" | "standardDeviation">>): AnalysisWeights {
  const saved = settings.find(item => item.analysisType === analysisType) ?? { analysisType, categoryWeights: [], subcategoryWeights: [] };
  const categoryWeights = patch.categoryWeights ? [...saved.categoryWeights.filter(item => !patch.categoryWeights!.some(next => next.category === item.category)), ...patch.categoryWeights] : saved.categoryWeights;
  const subcategoryWeights = patch.subcategoryWeights ? [...saved.subcategoryWeights.filter(item => !patch.subcategoryWeights!.some(next => next.category === item.category && next.subcategory === item.subcategory)), ...patch.subcategoryWeights] : saved.subcategoryWeights;
  return [...settings.filter(item => item.analysisType !== analysisType), { ...saved, ...patch, analysisType, categoryWeights, subcategoryWeights }];
}

// Keep legacy rules readable; new associations must use the reviewed E1 methods.
export function assistantScoringReady(questions: (SurveySetupQuestion & { options: string[] })[], analysisType?: AnalysisType) {
  return analysisScoringReady(questions, analysisType) && questions.every(question => ANALYSIS_TYPES
    .filter(type => analysisType === undefined || type === analysisType)
    .every(type => {
      if (!configuredForAnalysis(question, type)) return true;
      const rule = question.analysisScoring?.find(item => item.analysisType === type);
      if (!rule || rule.optionScores !== undefined || rule.numericRange !== undefined || rule.responsePolicy?.blank !== "exclude" || rule.responsePolicy?.invalid !== "review") return false;
      if ((rule.excludedOptions ?? []).some(value => !question.options.includes(value) || correctAnswerValues(rule).includes(value))) return false;
      return rule.scoringMode === "ordered_scale" ||
        (question.type === "ONE_ANSWER" && (rule.scoringMode ?? "standard") === "standard" && rule.inverse === undefined && rule.scaleOptions === undefined);
    }));
}

export function scaleOptionPoints(options: string[], maximum: number | null, inverse = false, excluded: string[] = []) {
  return options.map((value, index) => ({ value, score: excluded.includes(value) || maximum === null || !Number.isFinite(maximum) || maximum < 0 ? null : maximum * ((inverse ? index + 1 : options.length - index) / options.length) }));
}

export function setAssistantScoring<T extends SurveySetupQuestion & { options: string[] }>(questions: T[], externalId: string, analysisType: AnalysisType, patch: { maxScore?: number | null; correctAnswer?: string | null; correctAnswers?: string[]; inverse?: boolean; excludedOptions?: string[]; scoringMode?: "standard" | "ordered_scale" }): T[] {
  const question = questions.find(item => item.externalId === externalId);
  if (!question || !configuredForAnalysis(question, analysisType)) return questions;
  const previous = question.analysisScoring?.find(item => item.analysisType === analysisType);
  const mode = patch.scoringMode ?? (previous?.scoringMode === "ordered_scale" ? "ordered_scale" : question.type === "ONE_ANSWER" ? "standard" : "ordered_scale");
  const correct = patch.correctAnswers ?? (patch.correctAnswer !== undefined ? (patch.correctAnswer ? [patch.correctAnswer] : []) : correctAnswerValues(previous));
  const rule = {
    analysisType,
    maxScore: patch.maxScore !== undefined ? patch.maxScore : previous?.maxScore ?? null,
    correctAnswer: mode === "standard" ? correct[0] ?? null : null,
    ...(mode === "standard" && correct.length > 1 ? { correctAnswers: correct } : {}),
    scoringMode: mode,
    responsePolicy: { blank: "exclude" as const, invalid: "review" as const },
    excludedOptions: patch.excludedOptions ?? previous?.excludedOptions?.filter(value => question.options.includes(value)) ?? [],
    ...(mode === "ordered_scale" ? { inverse: patch.inverse ?? previous?.inverse ?? false, scaleOptions: [...question.options] } : {}),
  };
  return questions.map(item => item.externalId === externalId ? { ...item, analysisScoring: [...(item.analysisScoring ?? []).filter(entry => entry.analysisType !== analysisType), rule] } : item);
}

export function instrumentQuestion<T extends SurveySetupQuestion>(question: T): T {
  return { ...question, analysisParticipation: [{ analysisType: "pre_post", enabled: canConfigureAnalysis(question) }, { analysisType: "pre_post_post", enabled: false }] };
}
