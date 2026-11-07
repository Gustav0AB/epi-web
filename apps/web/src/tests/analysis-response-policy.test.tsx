import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AnalysisOptionScoresSchema, AnalysisResponsePolicySchema, analysisScoringReady, setAnalysisOptionExclusion, setAnalysisOptionScore, setAnalysisResponsePolicy, setAnalysisScoring, type SurveySetupQuestion } from "@epi/shared";
import { analysisScoringText, SetupAnalysisScoring } from "../features/surveys/SetupAnalysisScoring";
const question = (): SurveySetupQuestion & { options: string[] } => ({ externalId: "q", text: "Pregunta con opciones", type: "ONE_ANSWER", role: "SCORED", options: ["A", "No sé", "No aplica"], weight: { category: "Learning", subcategory: "Knowledge", maxScore: 9, correctAnswer: "A" }, analysisParticipation: [{ analysisType: "pre_post", enabled: true }, { analysisType: "pre_post_post", enabled: true }] });
const rows = () => setAnalysisScoring([question()], "q", "pre_post", { scoringMode: "option_scores", maxScore: 2, optionScores: [{ value: "A", score: 2 }, { value: "No sé", score: 0 }, { value: "No aplica", score: null, excluded: true }] });

describe("explicit blank/invalid policies and non-scorable options", () => {
  it("accepts partial policies but rejects invented actions, text booleans and extra fields", () => {
    expect(AnalysisResponsePolicySchema.parse({ blank: "exclude", invalid: null }).invalid).toBe(null);
    for (const policy of [{ blank: "zero", invalid: "review" }, { blank: "exclude", invalid: "ignore" }, { blank: "exclude" }, { blank: "exclude", invalid: "review", auto: true }]) expect(AnalysisResponsePolicySchema.safeParse(policy).success).toBe(false);
    expect(AnalysisOptionScoresSchema.safeParse([{ value: "A", score: null, excluded: "true" }]).success).toBe(false);
  });
  it("distinguishes zero, pending points and explicitly non-scorable values without guessing from text", () => {
    expect(analysisScoringReady(rows(), "pre_post")).toBe(true);
    const pending = setAnalysisOptionExclusion(rows(), "q", "pre_post", "No aplica", false);
    expect(analysisScoringReady(pending, "pre_post")).toBe(false);
    expect(pending[0]!.analysisScoring![0]!.optionScores!.find(item => item.value === "No sé")!.score).toBe(0);
    const zero = setAnalysisOptionScore(pending, "q", "pre_post", "No aplica", 0);
    expect(analysisScoringReady(zero, "pre_post")).toBe(true);
    expect(zero[0]!.analysisScoring![0]!.optionScores!.find(item => item.value === "No aplica")!.excluded).toBe(false);
  });
  it("preserves scores when excluding and restoring options, requiring review again if their score exceeds the maximum", () => {
    const scored = setAnalysisOptionScore(rows(), "q", "pre_post", "A", 3);
    const excluded = setAnalysisOptionExclusion(scored, "q", "pre_post", "A", true);
    expect(analysisScoringReady(excluded, "pre_post")).toBe(true);
    expect(excluded[0]!.analysisScoring![0]!.optionScores!.find(item => item.value === "A")!.score).toBe(3);
    expect(analysisScoringReady(setAnalysisOptionExclusion(excluded, "q", "pre_post", "A", false), "pre_post")).toBe(false);
    expect(setAnalysisOptionScore(excluded, "q", "pre_post", "A", 1)[0]!.analysisScoring![0]!.optionScores!.find(item => item.value === "A")!.excluded).toBe(true);
  });
  it("does not register a numerical question with every option non-scorable or unknown/retired options", () => {
    let all = rows();
    for (const value of question().options) all = setAnalysisOptionExclusion(all, "q", "pre_post", value, true);
    expect(analysisScoringReady(all, "pre_post")).toBe(false);
    expect(analysisScoringReady(rows().map(row => ({ ...row, options: ["A", "No sé"] })), "pre_post")).toBe(false);
    expect(setAnalysisOptionExclusion(rows(), "q", "pre_post", "unknown", true)).toEqual(rows());
  });
  it("keeps policies and exclusions independent per analysis without mutating the original", () => {
    const original = rows(); const before = JSON.stringify(original);
    let changed = setAnalysisScoring(original, "q", "pre_post_post", { maxScore: 5, correctAnswer: "A" });
    changed = setAnalysisResponsePolicy(changed, "q", "pre_post", { blank: "exclude", invalid: "review" });
    changed = setAnalysisOptionExclusion(changed, "q", "pre_post", "No sé", true);
    expect(changed[0]!.analysisScoring!.find(rule => rule.analysisType === "pre_post_post")!.responsePolicy).toBeUndefined();
    expect(changed[0]!.weight).toEqual(question().weight);
    expect(JSON.stringify(original)).toBe(before);
    expect(analysisScoringReady(changed)).toBe(true);
  });
  it("requires completion only when a policy is explicitly configured and supports removing it", () => {
    expect(analysisScoringReady(rows(), "pre_post")).toBe(true);
    const partial = setAnalysisResponsePolicy(rows(), "q", "pre_post", { blank: "exclude" });
    expect(partial[0]!.analysisScoring![0]!.responsePolicy).toEqual({ blank: "exclude", invalid: null });
    expect(analysisScoringReady(partial, "pre_post")).toBe(false);
    expect(analysisScoringReady(setAnalysisScoring(partial, "q", "pre_post", { responsePolicy: null }), "pre_post")).toBe(true);
  });
  it("preserves inactive rules across roles, participation and scoring methods", () => {
    const excluded = rows().map(row => ({ ...row, role: "EXCLUDED" as const }));
    expect(setAnalysisResponsePolicy(excluded, "q", "pre_post", { blank: "exclude" })).toEqual(excluded);
    expect(setAnalysisOptionExclusion(excluded, "q", "pre_post", "A", true)).toEqual(excluded);
    const standard = setAnalysisScoring(rows(), "q", "pre_post", { scoringMode: "standard", correctAnswer: "A" });
    expect(analysisScoringReady(standard, "pre_post")).toBe(true);
    expect(standard[0]!.analysisScoring![0]!.optionScores).toEqual(rows()[0]!.analysisScoring![0]!.optionScores);
  });
  it("shows explicit checkboxes, preserves disabled score fields and explains policies in the final summary", () => {
    const configured = setAnalysisResponsePolicy(rows(), "q", "pre_post", { blank: "exclude", invalid: "review" });
    const markup = renderToStaticMarkup(<SetupAnalysisScoring questions={configured} onChange={() => {}} />);
    expect(markup).toContain("Confirmar regla actual");
    expect(markup).toContain("Blancos y no puntuables fuera del cálculo, nunca como cero");
    expect(markup).not.toContain("Quitar política explícita");
    expect(markup).not.toContain('aria-label="Puntos Pre/Post:');
    const summary = analysisScoringText(configured[0]!);
    expect(summary).toContain("No sé = 0");
    expect(summary).toContain("No aplica = no puntuable");
    expect(summary).toContain("blancos: excluir; inválidos: revisar");
  });
});
