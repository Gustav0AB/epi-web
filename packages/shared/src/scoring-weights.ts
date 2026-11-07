import type { CategoryWeightSetting, SubcategoryWeightSetting, SurveySetupQuestion } from "./schemas/survey.schema.js";

import { questionClassification } from "./question-classification.js";

type ScoredQuestion = SurveySetupQuestion;

export function scoringGroups(questions: ScoredQuestion[]) {
  const groups = new Map<string, { category: string; subcategory: string; questionCount: number; categoryQuestionCount: number }>();
  for (const question of questions) {
    const classification = questionClassification(question);
    if ((question.role ?? "SCORED") !== "SCORED" || question.type === "OPEN_TEXT" || !classification?.category.trim()) continue;
    const subcategory = classification.subcategory?.trim();
    if (!subcategory) continue;
    const key = JSON.stringify([classification.category.trim(), subcategory]);
    const group = groups.get(key) ?? { category: classification.category.trim(), subcategory, questionCount: 0, categoryQuestionCount: 0 };
    group.questionCount++;
    group.categoryQuestionCount++;
    groups.set(key, group);
  }
  const counts = new Map<string, number>();
  for (const group of groups.values()) counts.set(group.category, (counts.get(group.category) ?? 0) + group.questionCount);
  return [...groups.values()].map(group => ({ ...group, categoryQuestionCount: counts.get(group.category) ?? 0 }));
}

export function validScoringWeights(questions: ScoredQuestion[], categoryWeights: CategoryWeightSetting[], subcategoryWeights: SubcategoryWeightSetting[], includeIaa = true) {
  if ([...categoryWeights, ...subcategoryWeights].some(item => item.weight === null || !Number.isFinite(item.weight) || item.weight < 0 || item.weight > 100)) return false;
  const groups = scoringGroups(questions);
  const scoredCount = questions.filter(question => (question.role ?? "SCORED") === "SCORED" && question.type !== "OPEN_TEXT").length;
  if (!scoredCount) return categoryWeights.length === 0 && subcategoryWeights.length === 0;
  if (!groups.length || groups.reduce((sum, group) => sum + group.questionCount, 0) !== scoredCount) return false;
  const categories = [...new Set(groups.map(group => group.category))];
  if (includeIaa) {
    if (categories.some(category => !categoryWeights.some(item => item.category === category))) return false;
    if (categoryWeights.length !== categories.length || Math.abs(categoryWeights.reduce((sum, item) => sum + item.weight!, 0) - 100) > 1e-8) return false;
  } else if (categoryWeights.length) return false;
  const keys = groups.map(group => JSON.stringify([group.category, group.subcategory]));
  if (subcategoryWeights.length !== keys.length || keys.some(key => !subcategoryWeights.some(item => JSON.stringify([item.category, item.subcategory]) === key && item.weight !== null))) return false;
  return categories.every(category => {
    const sum = subcategoryWeights.filter(item => item.category === category).reduce((total, item) => total + (item.weight ?? 0), 0);
    return Math.abs(sum - 100) <= 1e-8;
  });
}

export function equalWeights<T>(items: T[]): (T & { weight: number })[] {
  if (!items.length) return [];
  const part = 100 / items.length;
  return items.map((item, index) => ({ ...item, weight: index === items.length - 1 ? 100 - part * (items.length - 1) : part }));
}
