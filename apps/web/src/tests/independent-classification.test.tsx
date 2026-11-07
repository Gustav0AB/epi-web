import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { analysisWeightsReady, QuestionClassificationSchema, questionClassification, questionCatalogIssue, scoringGroups, SurveySetupDraftSchema, type SurveySetupQuestion } from "@epi/shared";
import { SetupAnalysisScoring } from "../features/surveys/SetupAnalysisScoring";
const question = (): SurveySetupQuestion & { options: string[] } => ({ externalId: "q", text: "Independent question", type: "ONE_ANSWER", role: "SCORED", options: ["A", "B"], classification: { category: "Learning", subcategory: "Knowledge" }, analysisParticipation: [{ analysisType: "pre_post", enabled: true }, { analysisType: "pre_post_post", enabled: false }], analysisScoring: [{ analysisType: "pre_post", maxScore: 2, correctAnswer: "B" }] });
const weights = [{ analysisType: "pre_post" as const, categoryWeights: [{ category: "Learning", weight: 100 }], subcategoryWeights: [{ category: "Learning", subcategory: "Knowledge", weight: 100 }] }];
describe("classification independent from legacy scoring", () => {
  it("allows partial classifications in drafts but rejects extra fields", () => {
    expect(QuestionClassificationSchema.parse({ category: "", subcategory: null })).toEqual({ category: "", subcategory: null });
    expect(QuestionClassificationSchema.safeParse({ category: "Learning", maxScore: 5 }).success).toBe(false);
  });
  it("reads independent classification first and preserves legacy fallback without modifying it", () => {
    const legacy = { weight: { category: "Old", subcategory: "Old sub", maxScore: 9, correctAnswer: "A" } };
    expect(questionClassification(legacy)).toEqual({ category: "Old", subcategory: "Old sub" });
    expect(questionClassification({ ...legacy, classification: question().classification })).toEqual(question().classification);
    expect(legacy.weight.maxScore).toBe(9);
    expect(questionClassification({ ...legacy, classification: { category: "", subcategory: null } })!.category).toBe("");
  });
  it("builds groups and validates per-analysis distributions without a general weight", () => {
    expect(scoringGroups([question()])).toEqual([{ category: "Learning", subcategory: "Knowledge", questionCount: 1, categoryQuestionCount: 1 }]);
    expect(analysisWeightsReady([question()], weights, true)).toBe(true);
    expect(question().weight).toBeUndefined();
  });
  it("validates catalog membership using the current classification instead of dormant weight strings", () => {
    const row = { ...question(), weight: { category: "Archived", subcategory: null, maxScore: null, correctAnswer: null } };
    expect(questionCatalogIssue(row, [{ name: "Learning", subcategory: "Knowledge", organizationId: "org", isActive: true }], "org")).toBeNull();
  });
  it("requires explicit per-analysis distribution for v3 while retaining v2 draft compatibility", () => {
    const draft = { siteId: null, type: "LOCAL", instrumentName: "Form", activityName: "Trip", scoringWeightsVersion: 3, questions: [question()] };
    expect(SurveySetupDraftSchema.safeParse(draft).success).toBe(false);
    const parsed = SurveySetupDraftSchema.parse({ ...draft, analysisWeights: weights });
    expect(parsed.questions![0]!.weight).toBeUndefined();
    expect(parsed.scoringWeightsVersion).toBe(3);
    expect(SurveySetupDraftSchema.safeParse({ ...draft, scoringWeightsVersion: 2, categoryWeights: [], subcategoryWeights: [] }).success).toBe(true);
  });
  it("retains dormant legacy fields in the v3 draft without copying them to analysis rules", () => {
    const row = { ...question(), weight: { category: "Old", subcategory: null, maxScore: null, correctAnswer: "A" } };
    const parsed = SurveySetupDraftSchema.parse({ siteId: null, type: "LOCAL", instrumentName: "Form", activityName: "Trip", scoringWeightsVersion: 3, analysisWeights: weights, categoryWeights: [{ category: "Old", weight: null }], questions: [row] });
    expect(parsed.questions![0]!.weight!.correctAnswer).toBe("A");
    expect(parsed.questions![0]!.analysisScoring![0]!.correctAnswer).toBe("B");
    expect(parsed.categoryWeights![0]!.weight).toBeNull();
  });
  it("shows classification and analysis inputs without rendering a general scoring input", () => {
    const markup = renderToStaticMarkup(<SetupAnalysisScoring questions={[question()]} onChange={() => {}} weights={weights} onWeightsChange={() => {}} />);
    expect(markup).toContain("Learning");
    expect(markup).toContain("Knowledge");
    expect(markup).toContain('aria-label="Máximo Pre/Post: Independent question"');
    expect(markup).not.toContain('aria-label="Máximo de escala:');
  });
});
