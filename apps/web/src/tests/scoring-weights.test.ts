import { describe, expect, it } from "vitest";
import { equalWeights, scoringGroups, SurveySetupDraftSchema, validScoringWeights, type SurveySetupQuestion } from "@epi/shared";

const question = (externalId: string, category: string, subcategory: string): SurveySetupQuestion => ({ externalId, text: externalId, type: "LIKERT", role: "SCORED", weight: { category, subcategory, maxScore: 5, correctAnswer: null, factor: 1 } });
const questions = [question("a", "Learning", "Knowledge"), question("b", "Learning", "Knowledge"), question("c", "Learning", "Attitudes"), question("d", "Action", "Practice")];
const categories = [{ category: "Learning", weight: 30 }, { category: "Action", weight: 70 }];
const subcategories = [{ category: "Learning", subcategory: "Knowledge", weight: 60 }, { category: "Learning", subcategory: "Attitudes", weight: 40 }, { category: "Action", subcategory: "Practice", weight: 100 }];

describe("M1 configuration without applying a scoring methodology", () => {
  it("counts only evaluable questions and keeps subcategories scoped to their category", () => {
    const rows = [...questions, { ...question("ignored", "Learning", "Knowledge"), role: "EXCLUDED" as const }, { ...question("open", "Learning", "Knowledge"), type: "OPEN_TEXT" as const }];
    expect(scoringGroups(rows)).toEqual([
      { category: "Learning", subcategory: "Knowledge", questionCount: 2, categoryQuestionCount: 3 },
      { category: "Learning", subcategory: "Attitudes", questionCount: 1, categoryQuestionCount: 3 },
      { category: "Action", subcategory: "Practice", questionCount: 1, categoryQuestionCount: 1 },
    ]);
    expect(validScoringWeights(rows, categories, subcategories)).toBe(true);
  });
  it("requires every current question and 100% within each category", () => {
    expect(validScoringWeights([...questions, question("new", "Learning", "New")], categories, subcategories)).toBe(false);
    expect(validScoringWeights([...questions, { ...question("uncategorized", "", "") }], categories, subcategories)).toBe(false);
    expect(validScoringWeights(questions, categories, subcategories.map(item => ({ ...item, weight: 50 })))).toBe(false);
    expect(validScoringWeights(questions, categories, [...subcategories, subcategories[0]!])).toBe(false);
    expect(validScoringWeights(questions, [categories[0]!, categories[0]!], subcategories)).toBe(false);
  });
  it("rejects missing, nonfinite and out-of-range weights before continuing the wizard", () => {
    for (const weight of [null, NaN, Infinity, -1, 101]) {
      expect(validScoringWeights(questions, [{ ...categories[0]!, weight }, categories[1]!], subcategories)).toBe(false);
      expect(validScoringWeights(questions, categories, [{ ...subcategories[0]!, weight }, ...subcategories.slice(1)])).toBe(false);
    }
  });
  it("does not require or accept IAA category weights for CQS and follow-up configuration", () => {
    expect(validScoringWeights(questions, [], subcategories, false)).toBe(true);
    expect(validScoringWeights(questions, categories, subcategories, false)).toBe(false);
    expect(validScoringWeights(questions, [], subcategories)).toBe(false);
  });
  it("suggests an editable equal distribution without imposing it", () => {
    expect(equalWeights([])).toEqual([]);
    const suggestion = equalWeights([{ id: "a" }, { id: "b" }, { id: "c" }]);
    expect(suggestion.reduce((sum, item) => sum + item.weight, 0)).toBe(100);
    expect(suggestion.map(item => item.id)).toEqual(["a", "b", "c"]);
    expect(validScoringWeights(questions, categories, subcategories)).toBe(true);
  });
  it("keeps incomplete drafts but rejects silently unversioned weight tables", () => {
    const draft = { siteId: null, type: "LOCAL", instrumentName: "Survey", activityName: "Trip" };
    expect(SurveySetupDraftSchema.safeParse(draft).success).toBe(true);
    expect(SurveySetupDraftSchema.safeParse({ ...draft, categoryWeights: [] }).success).toBe(false);
    expect(SurveySetupDraftSchema.safeParse({ ...draft, scoringWeightsVersion: 2, categoryWeights: [{ category: "Learning", weight: null }] }).success).toBe(true);
  });
});
