import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AnalysisOptionScoresSchema, analysisScoringReady, QuestionAnalysisScoringSchema, setAnalysisOptionScore, setAnalysisScoring, type SurveySetupQuestion } from "@epi/shared";
import { analysisScoringText, SetupAnalysisScoring } from "../features/surveys/SetupAnalysisScoring";

const question = (): SurveySetupQuestion & { options: string[] } => ({ externalId: "q", text: "Elige una respuesta", type: "ONE_ANSWER", role: "SCORED", options: ["A", "B"], weight: { category: "Learning", subcategory: "Knowledge", maxScore: 9, correctAnswer: "A" }, analysisParticipation: [{ analysisType: "pre_post", enabled: true }, { analysisType: "pre_post_post", enabled: true }] });
const configured = () => setAnalysisScoring([question()], "q", "pre_post", { maxScore: 3, scoringMode: "option_scores", optionScores: [{ value: "A", score: 0 }, { value: "B", score: 1.5 }] });

describe("manual option scores per analysis", () => {
  it("accepts partial drafts and explicit zero while rejecting duplicate options, invalid scores and unknown fields", () => {
    expect(AnalysisOptionScoresSchema.parse([{ value: "A", score: null }, { value: "B", score: "0" }])).toEqual([{ value: "A", score: null }, { value: "B", score: 0 }]);
    for (const rows of [[{ value: "A", score: 1 }, { value: " A ", score: 2 }], [{ value: "A", score: -1 }], [{ value: "A", score: Infinity }], [{ value: "", score: 0 }], [{ value: "A", score: true }], [{ value: "A", score: 0, correct: true }]]) expect(AnalysisOptionScoresSchema.safeParse(rows).success).toBe(false);
    expect(QuestionAnalysisScoringSchema.safeParse([{ analysisType: "pre_post", maxScore: 3, scoringMode: "automatic" }]).success).toBe(false);
  });
  it("keeps fractional scores, zero and independent configurations without copying the global maximum", () => {
    const original = configured(); const before = JSON.stringify(original);
    let rows = setAnalysisScoring(original, "q", "pre_post_post", { maxScore: 5, scoringMode: "option_scores", optionScores: [{ value: "A", score: 5 }, { value: "B", score: 2.5 }] });
    rows = setAnalysisOptionScore(rows, "q", "pre_post", "B", 2);
    expect(rows[0]!.analysisScoring!.find(rule => rule.analysisType === "pre_post_post")!.optionScores).toEqual([{ value: "A", score: 5 }, { value: "B", score: 2.5 }]);
    expect(rows[0]!.weight).toEqual(question().weight);
    expect(analysisScoringReady(rows)).toBe(true);
    expect(JSON.stringify(original)).toBe(before);
  });
  it("does not turn blank scores into zero or infer correct answers from points", () => {
    expect(analysisScoringReady(configured(), "pre_post")).toBe(true);
    const partial = setAnalysisOptionScore(configured(), "q", "pre_post", "A", null);
    expect(analysisScoringReady(partial, "pre_post")).toBe(false);
    expect(partial[0]!.analysisScoring![0]!.correctAnswer).toBe(null);
    expect(partial[0]!.analysisScoring![0]!.optionScores!.find(item => item.value === "B")!.score).toBe(1.5);
  });
  it("requires every current option exactly once and rejects removed, added or absent source options", () => {
    const rows = configured();
    for (const options of [["A", "B", "C"], ["A", "C"], [], ["A", "A"]]) expect(analysisScoringReady([{ ...rows[0]!, options }], "pre_post")).toBe(false);
    expect(analysisScoringReady(setAnalysisScoring(rows, "q", "pre_post", { optionScores: [{ value: "A", score: 0 }] }), "pre_post")).toBe(false);
    expect(analysisScoringReady(setAnalysisScoring(rows, "q", "pre_post", { optionScores: [{ value: "A", score: 0 }, { value: "A", score: 0 }] }), "pre_post")).toBe(false);
    expect(setAnalysisOptionScore(rows, "q", "pre_post", "not-in-source", 1)).toEqual(rows);
  });
  it("requires nonnegative points no greater than the analysis maximum, without rounding", () => {
    expect(analysisScoringReady(setAnalysisScoring(configured(), "q", "pre_post", { maxScore: 1 }), "pre_post")).toBe(false);
    for (const score of [-1, NaN, Infinity, 3.01]) expect(analysisScoringReady(setAnalysisOptionScore(configured(), "q", "pre_post", "B", score), "pre_post")).toBe(false);
    const zero = setAnalysisScoring(configured(), "q", "pre_post", { maxScore: 0, optionScores: [{ value: "A", score: 0 }, { value: "B", score: 0 }] });
    expect(analysisScoringReady(zero, "pre_post")).toBe(true);
  });
  it("keeps option scores dormant when switching method or disabling the question", () => {
    const rows = configured();
    const standard = setAnalysisScoring(rows, "q", "pre_post", { scoringMode: "standard", correctAnswer: "A" });
    expect(analysisScoringReady(standard, "pre_post")).toBe(true);
    expect(standard[0]!.analysisScoring![0]!.optionScores).toEqual(rows[0]!.analysisScoring![0]!.optionScores);
    expect(setAnalysisOptionScore(standard, "q", "pre_post", "A", 2)).toEqual(standard);
    const excluded = [{ ...rows[0]!, role: "EXCLUDED" as const }];
    expect(setAnalysisOptionScore(excluded, "q", "pre_post", "A", 2)).toEqual(excluded);
    expect(analysisScoringReady(excluded)).toBe(true);
    expect(analysisScoringText(excluded[0]!)).toContain("inactiva");
  });
  it("allows explicit fixed-option scales but never guesses options from a numeric range", () => {
    const rows = configured().map(row => ({ ...row, type: "LIKERT" as const }));
    expect(analysisScoringReady(rows, "pre_post")).toBe(true);
    expect(analysisScoringReady(rows.map(row => ({ ...row, options: [] })), "pre_post")).toBe(false);
  });
  it("renders explicit option controls and a review action for removed source values", () => {
    const row = { ...configured()[0]!, options: ["A", "C"] };
    const markup = renderToStaticMarkup(<SetupAnalysisScoring questions={[row]} onChange={() => {}} />);
    expect(markup).toContain('aria-label="Método de puntuación Pre/Post: Elige una respuesta"');
    expect(markup).not.toContain('aria-label="Puntos Pre/Post: Elige una respuesta / A"');
    expect(markup).not.toContain('aria-label="Puntos Pre/Post: Elige una respuesta / C"');
    expect(markup).toContain("No se convertirán puntos parciales ni rangos anteriores automáticamente");
    expect(markup).toContain("Confirmar regla actual");
    expect(markup).toContain("1 pendientes de puntuación");
    expect(markup).toContain('aria-label="Respuesta correcta Pre/Post:');
  });
  it("summarizes active points independently and hides dormant option rules in standard mode", () => {
    const rows = setAnalysisScoring(configured(), "q", "pre_post_post", { maxScore: 5, correctAnswer: "B" });
    const summary = analysisScoringText(rows[0]!);
    expect(summary).toContain("Pre/Post: máximo 3; puntos por opción: A = 0, B = 1.5");
    expect(summary).toContain("Pre/Post + Post-post: máximo 5; correcta: B");
    const standard = setAnalysisScoring(rows, "q", "pre_post", { scoringMode: "standard", correctAnswer: "A" });
    expect(analysisScoringText(standard[0]!)).not.toContain("puntos por opción");
  });
});
