import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { analysisScoringReady, QuestionAnalysisScoringSchema, setAnalysisScoring, type SurveySetupQuestion } from "@epi/shared";
import { analysisScoringText, SetupAnalysisScoring } from "../features/surveys/SetupAnalysisScoring";

const question = (externalId: string): SurveySetupQuestion & { options: string[] } => ({ externalId, text: `Pregunta ${externalId}`, type: "ONE_ANSWER", role: "SCORED", options: ["A", "B"], weight: { category: "Learning", subcategory: "Knowledge", maxScore: 9, correctAnswer: "A" }, analysisParticipation: [{ analysisType: "pre_post", enabled: true }, { analysisType: "pre_post_post", enabled: true }] });

describe("independent scoring configuration per analysis", () => {
  it("saves partial rules but rejects duplicates, unknown fields and invalid maxima", () => {
    expect(QuestionAnalysisScoringSchema.parse([{ analysisType: "pre_post", maxScore: null }])).toEqual([{ analysisType: "pre_post", maxScore: null, correctAnswer: null }]);
    for (const maxScore of [-1, Infinity, NaN, true]) expect(QuestionAnalysisScoringSchema.safeParse([{ analysisType: "pre_post", maxScore }]).success).toBe(false);
    const rule = { analysisType: "pre_post", maxScore: 1, correctAnswer: "A" };
    expect(QuestionAnalysisScoringSchema.safeParse([rule, rule]).success).toBe(false);
    expect(QuestionAnalysisScoringSchema.safeParse([{ ...rule, analysisType: "unknown" }]).success).toBe(false);
    expect(QuestionAnalysisScoringSchema.safeParse([{ ...rule, factor: 3 }]).success).toBe(false);
  });
  it("does not copy general scores or overwrite the other analysis", () => {
    const original = [question("q")];
    const before = JSON.stringify(original);
    let rows = setAnalysisScoring(original, "q", "pre_post", { maxScore: 2, correctAnswer: "B" });
    expect(rows[0]!.analysisScoring).toEqual([{ analysisType: "pre_post", maxScore: 2, correctAnswer: "B" }]);
    expect(analysisScoringReady(rows)).toBe(false);
    rows = setAnalysisScoring(rows, "q", "pre_post_post", { maxScore: 5, correctAnswer: "A" });
    rows = setAnalysisScoring(rows, "q", "pre_post", { maxScore: 3 });
    expect(rows[0]!.analysisScoring?.find(rule => rule.analysisType === "pre_post_post")).toEqual({ analysisType: "pre_post_post", maxScore: 5, correctAnswer: "A" });
    expect(rows[0]!.weight).toEqual(original[0]!.weight);
    expect(JSON.stringify(original)).toBe(before);
    expect(analysisScoringReady(rows)).toBe(true);
  });
  it("keeps inactive rules when participation, role or type changes", () => {
    const row = { ...question("q"), analysisScoring: [{ analysisType: "pre_post" as const, maxScore: 2, correctAnswer: "B" }] };
    const disabled = { ...row, analysisParticipation: [{ analysisType: "pre_post" as const, enabled: false }, { analysisType: "pre_post_post" as const, enabled: false }] };
    expect(setAnalysisScoring([disabled], "q", "pre_post", { maxScore: 8 })).toEqual([disabled]);
    expect(analysisScoringReady([disabled])).toBe(true);
    expect(setAnalysisScoring([{ ...row, role: "EXCLUDED" }], "q", "pre_post", { maxScore: 8 })[0]!.analysisScoring).toEqual(row.analysisScoring);
    expect(analysisScoringReady([{ ...row, type: "OPEN_TEXT" }])).toBe(true);
    expect(analysisScoringText(disabled)).toContain("inactiva");
  });
  it("requires a valid correct answer against current options in each enabled analysis", () => {
    let rows = setAnalysisScoring([question("q")], "q", "pre_post", { maxScore: 1, correctAnswer: "B" });
    expect(analysisScoringReady(rows, "pre_post")).toBe(true);
    expect(analysisScoringReady(rows, "pre_post_post")).toBe(false);
    expect(analysisScoringReady([{ ...rows[0]!, options: ["A", "C"] }], "pre_post")).toBe(false);
    rows = setAnalysisScoring(rows, "q", "pre_post", { correctAnswer: null });
    expect(analysisScoringReady(rows, "pre_post")).toBe(false);
  });
  it("only renders enabled questions for the selected analysis and keeps numeric fields empty until configured", () => {
    const base = question("visible");
    const other = { ...question("follow-only"), analysisParticipation: [{ analysisType: "pre_post" as const, enabled: false }, { analysisType: "pre_post_post" as const, enabled: true }] };
    const markup = renderToStaticMarkup(<SetupAnalysisScoring questions={[base, other]} onChange={() => {}} />);
    expect(markup).toContain("Análisis que estás configurando");
    expect(markup).toContain("Pregunta visible");
    expect(markup).not.toContain("Pregunta follow-only");
    expect(markup).not.toMatch(/aria-label="Máximo Pre\/Post: Pregunta visible"[^>]*value="9"/);
    expect(markup).toContain("1 pendientes de puntuación");
  });
  it("renders ten questions per page and provides manual answers when source options are absent", () => {
    const rows = Array.from({ length: 11 }, (_, index) => ({ ...question(String(index)), options: [] }));
    const markup = renderToStaticMarkup(<SetupAnalysisScoring questions={rows} onChange={() => {}} />);
    expect((markup.match(/class="min-w-48 max-w-md whitespace-pre-wrap break-words"/g) ?? [])).toHaveLength(10);
    expect(markup).toContain("Todas las categorías");
    expect((markup.match(/Blancos y no puntuables fuera del cálculo/g) ?? [])).toHaveLength(1);
    expect(markup).not.toContain("Pregunta 10");
    expect(markup).toContain('aria-label="Respuesta correcta Pre/Post: Pregunta 0"');
  });
  it("summarizes each analysis independently for final review", () => {
    let rows = setAnalysisScoring([question("q")], "q", "pre_post", { maxScore: 2, correctAnswer: "B" });
    rows = setAnalysisScoring(rows, "q", "pre_post_post", { maxScore: 5, correctAnswer: "A" });
    expect(analysisScoringText(rows[0]!)).toContain("Pre/Post: máximo 2; correctas: B");
    expect(analysisScoringText(rows[0]!)).toContain("Pre/Post + Post-post: máximo 5; correctas: A");
  });
});
