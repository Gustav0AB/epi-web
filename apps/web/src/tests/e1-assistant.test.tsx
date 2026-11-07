import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { assistantScoringReady, questionCatalogIssue, scaleOptionPoints, setAssistantScoring, SurveySetupDraftSchema, type SurveySetupQuestion, type CategoryDto } from "@epi/shared";
import { AnalysisAnswerScoring, analysisScoringText } from "../features/surveys/SetupAnalysisScoring";
import { subcategoryChoices } from "../features/surveys/category-options";
import { previewAnalysisReuse, applyAnalysisReuse, previewInstrumentAnalysisReuse } from "../features/surveys/setup-analysis-reuse";
import { previewScoringProposal, applyScoringProposal, validatedScoringProposal } from "../features/surveys/setup-scoring-proposal";
type Question = SurveySetupQuestion & { options: string[] };
const question = (): Question => ({ externalId: "scale", text: "Acuerdo", type: "LIKERT", role: "SCORED", classification: { category: "Learning", subcategory: "Attitudes" }, options: ["Muy de acuerdo", "De acuerdo", "Neutral", "En desacuerdo", "Muy en desacuerdo"], analysisParticipation: [{ analysisType: "pre_post", enabled: true }, { analysisType: "pre_post_post", enabled: true }] });
const setup = () => setAssistantScoring([question()], "scale", "pre_post", { maxScore: 10 });
const catalog: CategoryDto[] = [{ id: "a", name: "Learning", subcategory: "Attitudes", organizationId: "org", isActive: true }];
describe("E1 assistant approved rules", () => {
  it("assigns descending/inverse points without rounding intermediate values or guessing labels", () => {
    expect(scaleOptionPoints(question().options, 10).map(item => item.score)).toEqual([10, 8, 6, 4, 2]);
    expect(scaleOptionPoints(question().options, 10, true).map(item => item.score)).toEqual([2, 4, 6, 8, 10]);
    expect(scaleOptionPoints(["A", "B", "C"], 1)[1]!.score).toBe(2 / 3);
    expect(scaleOptionPoints([], 5)).toEqual([]);
    for (const maximum of [null, Infinity, -1]) expect(scaleOptionPoints(["A"], maximum)[0]!.score).toBeNull();
  });
  it("persists independent analyses and inversion through a v4 partial draft round trip", () => {
    const original = setup();
    const both = setAssistantScoring(original, "scale", "pre_post_post", { maxScore: 5, inverse: true });
    const draft = SurveySetupDraftSchema.parse(JSON.parse(JSON.stringify({ siteId: null, type: "LOCAL", instrumentName: "Form", activityName: "Trip", scoringWeightsVersion: 4, analysisWeights: [], questions: both })));
    const reopened = { ...draft.questions![0]!, options: question().options };
    expect(assistantScoringReady([reopened])).toBe(true);
    expect(reopened.analysisScoring!.find(rule => rule.analysisType === "pre_post")!.inverse).toBe(false);
    expect(reopened.analysisScoring!.find(rule => rule.analysisType === "pre_post_post")!.inverse).toBe(true);
    expect(original[0]!.analysisScoring).toHaveLength(1);
    expect(SurveySetupDraftSchema.safeParse({ ...draft, analysisWeights: undefined }).success).toBe(false);
  });
  it("requires review after options are reordered, added, removed or duplicated", () => {
    for (const options of [[...question().options].reverse(), [...question().options, "Nueva"], question().options.slice(1), ["A", "A"], []]) {
      const changed = [{ ...setup()[0]!, options }];
      expect(assistantScoringReady(changed, "pre_post")).toBe(false);
    }
    const changed = [{ ...setup()[0]!, options: [...question().options].reverse() }];
    expect(assistantScoringReady(setAssistantScoring(changed, "scale", "pre_post", { scoringMode: "ordered_scale" }), "pre_post")).toBe(true);
  });
  it("recomputes points after maximum changes and keeps inactive metadata without modifying it", () => {
    const original = setup();
    const changed = setAssistantScoring(original, "scale", "pre_post", { maxScore: 5 });
    expect(scaleOptionPoints(changed[0]!.options, changed[0]!.analysisScoring![0]!.maxScore).map(item => item.score)).toEqual([5, 4, 3, 2, 1]);
    const excluded = [{ ...changed[0]!, role: "EXCLUDED" as const }];
    expect(setAssistantScoring(excluded, "scale", "pre_post", { maxScore: 20 })).toEqual(excluded);
    expect(original[0]!.analysisScoring![0]!.maxScore).toBe(10);
  });
  it("marks no-score options without converting them to zero; rejects all excluded or stale exclusions", () => {
    const rows = setAssistantScoring(setup(), "scale", "pre_post", { excludedOptions: ["Neutral"] });
    const rule = rows[0]!.analysisScoring![0]!;
    expect(scaleOptionPoints(question().options, rule.maxScore, rule.inverse, rule.excludedOptions)[2]!.score).toBeNull();
    expect(assistantScoringReady(rows, "pre_post")).toBe(true);
    for (const excludedOptions of [["Unknown"], question().options]) expect(assistantScoringReady(setAssistantScoring(rows, "scale", "pre_post", { excludedOptions }), "pre_post")).toBe(false);
  });
  it("accepts a correct answer and value but rejects partial/range rules until explicitly reviewed", () => {
    const choice = [{ ...question(), type: "ONE_ANSWER" as const }];
    const rows = setAssistantScoring(choice, "scale", "pre_post", { maxScore: 2, correctAnswer: "Neutral" });
    expect(assistantScoringReady(rows, "pre_post")).toBe(true);
    expect(assistantScoringReady(setAssistantScoring(rows, "scale", "pre_post", { excludedOptions: ["De acuerdo"] }), "pre_post")).toBe(true);
    expect(assistantScoringReady(setAssistantScoring(rows, "scale", "pre_post", { excludedOptions: ["Neutral"] }), "pre_post")).toBe(false);
    expect(assistantScoringReady(setAssistantScoring(rows, "scale", "pre_post", { correctAnswer: "Missing" }), "pre_post")).toBe(false);
    const legacy = [{ ...rows[0]!, analysisScoring: [{ analysisType: "pre_post" as const, maxScore: 2, correctAnswer: "Neutral", scoringMode: "option_scores" as const, optionScores: [{ value: "Neutral", score: 1 }] }] }];
    expect(assistantScoringReady(legacy, "pre_post")).toBe(false);
    expect(assistantScoringReady(setAssistantScoring(legacy, "scale", "pre_post", { scoringMode: "standard" }), "pre_post")).toBe(true);
    expect(legacy[0]!.analysisScoring![0]!.optionScores).toHaveLength(1);
  });
  it("selects subcategory/category pairs unambiguously and validates organization membership", () => {
    const categories = [...catalog, { ...catalog[0]!, id: "b", name: "Other category" }, { ...catalog[0]!, id: "foreign", organizationId: "other" }, { ...catalog[0]!, id: "inactive", isActive: false }];
    const choices = subcategoryChoices(categories, "org");
    expect(choices).toHaveLength(2);
    expect(new Set(choices.map(item => item.value)).size).toBe(2);
    expect(questionCatalogIssue(question(), catalog, "org", true)).toBeNull();
    expect(questionCatalogIssue({ ...question(), classification: { category: "Learning", subcategory: null } }, catalog, "org", true)).toContain("subcategoría");
    expect(questionCatalogIssue(question(), catalog, "other", true)).not.toBeNull();
    expect(questionCatalogIssue({ ...question(), role: "EXCLUDED" }, [], "org", true)).toBeNull();
  });
  it("offers maximum/inversion proposals, rejects edited partial scores and requires fresh review", () => {
    const original = [question()];
    const preview = previewScoringProposal(original, "pre_post", true);
    expect(preview[0]!.rule).toMatchObject({ maxScore: 5, inverse: false, scoringMode: "ordered_scale" });
    const edited = preview.map(row => ({ ...row, rule: { ...row.rule!, maxScore: 10, inverse: true } }));
    const applied = applyScoringProposal(original, "pre_post", edited, ["scale"], true);
    expect(assistantScoringReady(applied, "pre_post")).toBe(true);
    expect(applied[0]!.analysisScoring![0]!.inverse).toBe(true);
    expect(validatedScoringProposal(question(), "pre_post", { ...preview[0]!, rule: { ...preview[0]!.rule!, optionScores: [{ value: "Neutral", score: 3 }] } }, true)).toBeNull();
    const changed = [{ ...question(), options: question().options.slice(1) }];
    expect(applyScoringProposal(changed, "pre_post", edited, ["scale"], true)).toEqual(changed);
  });
  it("reuses approved scales between analyses but refuses legacy partial rules in the assistant", () => {
    const rows = setup(); const reviewed = previewAnalysisReuse(rows, "pre_post", "pre_post_post", true);
    expect(reviewed[0]!.status).toBe("ready");
    const applied = applyAnalysisReuse(rows, "pre_post", "pre_post_post", reviewed, ["scale"], true);
    expect(assistantScoringReady(applied)).toBe(true);
    applied[0]!.analysisScoring!.find(rule => rule.analysisType === "pre_post_post")!.scaleOptions![0] = "Changed";
    expect(rows[0]!.analysisScoring![0]!.scaleOptions![0]).toBe("Muy de acuerdo");
    const legacy = [{ ...rows[0]!, analysisScoring: [{ analysisType: "pre_post" as const, maxScore: 5, correctAnswer: null }] }];
    expect(previewAnalysisReuse(legacy, "pre_post", "pre_post_post", true)[0]!.status).toBe("invalid");
  });
  it("refuses unreviewed policies and only reuses compatible rules from other instruments", () => {
    const rows = setup();
    expect(assistantScoringReady([{ ...rows[0]!, analysisScoring: [{ ...rows[0]!.analysisScoring![0]!, responsePolicy: null }] }], "pre_post")).toBe(false);
    const source = { id: "source-question", externalId: rows[0]!.externalId, text: rows[0]!.text, type: rows[0]!.type, options: rows[0]!.options, analysisScoring: rows[0]!.analysisScoring ?? null, analysisParticipation: rows[0]!.analysisParticipation ?? null, answers: [], weight: null };
    const target = [question()];
    expect(previewInstrumentAnalysisReuse(target, [source], "source-definition", "pre_post", "pre_post", true)[0]!.status).toBe("ready");
    expect(previewInstrumentAnalysisReuse(target, [{ ...source, analysisScoring: [{ analysisType: "pre_post", maxScore: 10, correctAnswer: null, scoringMode: "numeric_range", numericRange: { minimum: 1, maximum: 5, direction: "direct" } }] }], "source-definition", "pre_post", "pre_post", true)[0]!.status).toBe("invalid");
    const reordered = [{ ...question(), options: [...question().options].reverse() }];
    expect(previewInstrumentAnalysisReuse(reordered, [source], "source-definition", "pre_post", "pre_post", true)[0]!.status).toBe("unmatched");
  });
  it("shows all points, inversion and exclusion controls without editable partial-score fields", () => {
    const row = setup()[0]!;
    const markup = renderToStaticMarkup(<AnalysisAnswerScoring question={row} questions={[row]} analysisType="pre_post" onChange={() => { throw Error("Unexpected write"); }} />);
    expect(markup).toContain("10 puntos"); expect(markup).toContain("2 puntos");
    expect(markup).toContain('aria-label="Puntuación inversa Pre/Post: Acuerdo"');
    expect(markup).toContain('aria-label="No puntuable Pre/Post: Acuerdo / Neutral"');
    expect(markup).not.toContain('type="number"');
    expect(analysisScoringText(row)).toContain("Muy de acuerdo = 10");
  });
});
