import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AnalysisNumericRangeSchema, analysisScoringReady, QuestionAnalysisScoringSchema, setAnalysisNumericRange, setAnalysisScoring, type SurveySetupQuestion } from "@epi/shared";
import { analysisScoringText, SetupAnalysisScoring } from "../features/surveys/SetupAnalysisScoring";

const question = (): SurveySetupQuestion & { options: string[] } => ({ externalId: "scale", text: "Escala de aprendizaje", type: "LIKERT", role: "SCORED", options: [], weight: { category: "Learning", subcategory: "Knowledge", maxScore: 9, correctAnswer: null }, analysisParticipation: [{ analysisType: "pre_post", enabled: true }, { analysisType: "pre_post_post", enabled: true }] });
const ranged = () => setAnalysisScoring([question()], "scale", "pre_post", { maxScore: 5, scoringMode: "numeric_range", numericRange: { minimum: 1, maximum: 5, direction: "direct" } });

describe("explicit numeric ranges and direction per analysis", () => {
  it("allows incomplete ranges and negative/fractional response bounds without accepting nonfinite numbers or extra fields", () => {
    expect(AnalysisNumericRangeSchema.parse({ minimum: null, maximum: null, direction: null })).toEqual({ minimum: null, maximum: null, direction: null });
    expect(AnalysisNumericRangeSchema.parse({ minimum: -2.5, maximum: -0.5, direction: "reverse" }).minimum).toBe(-2.5);
    for (const patch of [{ minimum: Infinity }, { maximum: NaN }, { minimum: "1" }, { direction: true }, { direction: "auto" }, { formula: "auto" }]) expect(AnalysisNumericRangeSchema.safeParse({ minimum: 1, maximum: 5, direction: "direct", ...patch }).success).toBe(false);
    expect(QuestionAnalysisScoringSchema.parse([{ analysisType: "pre_post", maxScore: 5, scoringMode: "numeric_range" }])[0]!.numericRange).toBeUndefined();
  });
  it("requires explicit bounds and direction without inheriting them from general scores or the other analysis", () => {
    const rows = setAnalysisScoring([question()], "scale", "pre_post", { scoringMode: "numeric_range", maxScore: 5 });
    expect(analysisScoringReady(rows, "pre_post")).toBe(false);
    const partial = setAnalysisNumericRange(rows, "scale", "pre_post", { minimum: 0 });
    expect(partial[0]!.analysisScoring![0]!.numericRange).toEqual({ minimum: 0, maximum: null, direction: null });
    expect(analysisScoringReady(partial, "pre_post")).toBe(false);
    expect(partial[0]!.weight!.maxScore).toBe(9);
  });
  it("keeps different ranges and directions for each analysis and never rewrites input", () => {
    const original = ranged(); const before = JSON.stringify(original);
    let rows = setAnalysisScoring(original, "scale", "pre_post_post", { maxScore: 10, scoringMode: "numeric_range", numericRange: { minimum: -2, maximum: 2, direction: "reverse" } });
    rows = setAnalysisNumericRange(rows, "scale", "pre_post", { maximum: 7 });
    expect(rows[0]!.analysisScoring!.find(rule => rule.analysisType === "pre_post_post")!.numericRange).toEqual({ minimum: -2, maximum: 2, direction: "reverse" });
    expect(analysisScoringReady(rows)).toBe(true);
    expect(JSON.stringify(original)).toBe(before);
    expect(rows[0]!.weight).toEqual(question().weight);
  });
  it("rejects missing, equal, inverted and unusable ranges at readiness time while preserving drafts", () => {
    for (const patch of [{ minimum: null }, { maximum: null }, { direction: null }, { minimum: 5 }, { minimum: 6 }, { minimum: -Number.MAX_VALUE, maximum: Number.MAX_VALUE }]) {
      const rows = setAnalysisNumericRange(ranged(), "scale", "pre_post", patch);
      expect(analysisScoringReady(rows, "pre_post")).toBe(false);
      expect(QuestionAnalysisScoringSchema.safeParse(rows[0]!.analysisScoring).success).toBe(true);
    }
    expect(analysisScoringReady(setAnalysisNumericRange(ranged(), "scale", "pre_post", { minimum: -5, maximum: -1 }), "pre_post")).toBe(true);
  });
  it("requires a compatible scale without fixed options, preserving rules after type changes", () => {
    const row = ranged()[0]!;
    expect(analysisScoringReady([{ ...row, type: "ONE_ANSWER" }], "pre_post")).toBe(false);
    expect(analysisScoringReady([{ ...row, options: ["A", "B"] }], "pre_post")).toBe(false);
    expect(analysisScoringReady([{ ...row, type: "FREQUENCY" }], "pre_post")).toBe(true);
    expect(analysisScoringReady([{ ...row, type: "OPEN_TEXT" }])).toBe(true);
  });
  it("retains inactive range data across method/role changes and does not edit it through inactive controls", () => {
    const standard = setAnalysisScoring(ranged(), "scale", "pre_post", { scoringMode: "standard" });
    expect(setAnalysisNumericRange(standard, "scale", "pre_post", { minimum: 2 })).toEqual(standard);
    expect(standard[0]!.analysisScoring![0]!.numericRange).toEqual(ranged()[0]!.analysisScoring![0]!.numericRange);
    const restored = setAnalysisScoring(standard, "scale", "pre_post", { scoringMode: "numeric_range" });
    expect(analysisScoringReady(restored, "pre_post")).toBe(true);
    const excluded = [{ ...restored[0]!, role: "EXCLUDED" as const }];
    expect(setAnalysisNumericRange(excluded, "scale", "pre_post", { minimum: 2 })).toEqual(excluded);
    expect(analysisScoringReady(excluded)).toBe(true);
  });
  it("renders blank fields until configured, never selects direction automatically, and gives labels unique targets", () => {
    const blank = setAnalysisScoring([question()], "scale", "pre_post", { maxScore: 5, scoringMode: "numeric_range" });
    const markup = renderToStaticMarkup(<SetupAnalysisScoring questions={[...blank, { ...blank[0]!, externalId: "second", text: "Otra escala" }]} onChange={() => {}} />);
    expect(markup).not.toContain('aria-label="Mínimo de respuesta Pre/Post:');
    expect(markup).toContain('aria-label="Puntuación inversa Pre/Post: Escala de aprendizaje"');
    expect(markup).toContain("Confirmar regla actual");
    expect(markup).toContain("2 pendientes de puntuación");
    const ids = [...markup.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("shows incompatible configurations and preserves standard choices for legacy rules", () => {
    const markup = renderToStaticMarkup(<SetupAnalysisScoring questions={[{ ...ranged()[0]!, type: "ONE_ANSWER", options: ["A", "B"] }]} onChange={() => {}} />);
    expect(markup).toContain("No se convertirán puntos parciales ni rangos anteriores automáticamente");
    const legacy = setAnalysisScoring([question()], "scale", "pre_post", { maxScore: 5 });
    expect(analysisScoringReady(legacy, "pre_post")).toBe(true);
    expect(legacy[0]!.analysisScoring![0]!.numericRange).toBeUndefined();
  });
  it("summarizes each range independently and omits dormant range data in other methods", () => {
    const rows = setAnalysisScoring(ranged(), "scale", "pre_post_post", { maxScore: 10, scoringMode: "numeric_range", numericRange: { minimum: -2, maximum: 2, direction: "reverse" } });
    expect(analysisScoringText(rows[0]!)).toContain("Pre/Post: máximo 5; rango 1 a 5; dirección directa");
    expect(analysisScoringText(rows[0]!)).toContain("Pre/Post + Post-post: máximo 10; rango -2 a 2; dirección inversa");
    const standard = setAnalysisScoring(rows, "scale", "pre_post", { scoringMode: "standard" });
    expect(analysisScoringText(standard[0]!)).not.toContain("rango 1 a 5");
  });
});
