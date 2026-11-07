import type { SurveySetupQuestion } from "./schemas/survey.schema.js";

export function questionClassification(question: Pick<SurveySetupQuestion, "classification" | "weight">) {
  return question.classification ?? (question.weight ? { category: question.weight.category, subcategory: question.weight.subcategory } : null);
}
