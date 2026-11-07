import { assistantScoringReady, configuredForAnalysis, scaleOptionPoints } from "./question-analysis.js";
import type { SurveySetupQuestion } from "./schemas/survey.schema.js";
export type PrePostQuestion = SurveySetupQuestion & { options: string[] };
export type AnswerScore = { reason: "valid" | "blank" | "non_scorable" | "invalid" | "configuration_pending" | "zero_maximum"; points: number | null; maximum: number | null };
export function prePostOptionPoints(question: PrePostQuestion) {
  const rule = question.analysisScoring?.find(item => item.analysisType === "pre_post");
  if (!configuredForAnalysis(question, "pre_post") || !assistantScoringReady([question], "pre_post") || !rule) return [];
  return rule.scoringMode === "ordered_scale" ? scaleOptionPoints(question.options, rule.maxScore, rule.inverse, rule.excludedOptions) : question.options.map(value => ({ value, score: rule.excludedOptions?.includes(value) ? null : value === rule.correctAnswer ? rule.maxScore : 0 }));
}
// Only E1 rules are scored. Legacy partial/numeric rules require explicit version review.
export function scorePrePostAnswer(question: PrePostQuestion, values: unknown[]): AnswerScore {
  const excluded = (reason: AnswerScore["reason"]): AnswerScore => ({ reason, points: null, maximum: null });
  if (!configuredForAnalysis(question, "pre_post") || !assistantScoringReady([question], "pre_post")) return excluded("configuration_pending");
  if (values.length > 1) return excluded("invalid");
  const value = values[0];
  if (!values.length || value === null || typeof value === "string" && !value.trim()) return excluded("blank");
  if (typeof value !== "string" && !(typeof value === "number" && Number.isFinite(value))) return excluded("invalid");
  const text = String(value); const rule = question.analysisScoring!.find(item => item.analysisType === "pre_post")!;
  if (rule.excludedOptions?.includes(text)) return excluded("non_scorable");
  if (question.options.length && !question.options.includes(text)) return excluded("invalid");
  const points = rule.scoringMode === "ordered_scale" ? prePostOptionPoints(question).find(item => item.value === text)?.score : text === rule.correctAnswer ? rule.maxScore : 0;
  if (points == null || !Number.isFinite(points)) return excluded("invalid");
  return { reason: rule.maxScore === 0 ? "zero_maximum" : "valid", points, maximum: rule.maxScore };
}
