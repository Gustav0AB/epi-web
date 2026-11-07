import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { analysisScoringReady, setAnalysisScoring, SurveySetupQuestionSchema, type SurveySetupQuestion } from "@epi/shared";
import { applyAnalysisReuse, previewAnalysisReuse } from "../features/surveys/setup-analysis-reuse";
import { ReuseAnalysisScoring } from "../features/surveys/ReuseAnalysisScoring";

type Question = SurveySetupQuestion & { options: string[] };
const question = (externalId = "q"): Question => ({ externalId, text: "La misma pregunta", type: "ONE_ANSWER", role: "SCORED", options: ["A", "B"], weight: { category: "Learning", subcategory: "Knowledge", maxScore: 9, correctAnswer: "A" }, analysisParticipation: [{ analysisType: "pre_post", enabled: true }, { analysisType: "pre_post_post", enabled: true }], analysisScoring: [{ analysisType: "pre_post", maxScore: 2, correctAnswer: "B" }] });
const source = "pre_post" as const;
const target = "pre_post_post" as const;

describe("reviewed scoring reuse within an instrument draft", () => {
  it("previews the same questions without changing anything or inferring equivalence by text", () => {
    const rows = [question(), { ...question("other-id"), analysisScoring: [] }];
    const before = JSON.stringify(rows);
    const preview = previewAnalysisReuse(rows, source, target);
    expect(preview[0]).toMatchObject({ externalId: "q", status: "ready", rule: { analysisType: target, maxScore: 2, correctAnswer: "B" } });
    expect(preview[1]!.status).toBe("unconfigured");
    expect(JSON.stringify(rows)).toBe(before);
    expect(previewAnalysisReuse(rows, source, source)).toEqual([]);
  });
  it("preserves existing complete and incomplete target rules", () => {
    for (const maxScore of [null, 3]) {
      const rows = setAnalysisScoring([question()], "q", target, { maxScore });
      const preview = previewAnalysisReuse(rows, source, target);
      expect(preview[0]!.status).toBe("existing");
      expect(applyAnalysisReuse(rows, source, target, preview, ["q"])).toEqual(rows);
    }
  });
  it("only proposes eligible questions participating in both analyses", () => {
    expect(previewAnalysisReuse([{ ...question(), role: "EXCLUDED" }], source, target)).toEqual([]);
    expect(previewAnalysisReuse([{ ...question(), type: "OPEN_TEXT" }], source, target)).toEqual([]);
    const inactive = { ...question(), analysisParticipation: [{ analysisType: source, enabled: false }, { analysisType: target, enabled: true }] };
    expect(previewAnalysisReuse([inactive], source, target)[0]!.status).toBe("source_inactive");
    expect(previewAnalysisReuse([{ ...inactive, analysisParticipation: [{ analysisType: source, enabled: true }, { analysisType: target, enabled: false }] }], source, target)).toEqual([]);
  });
  it("rejects incomplete or structurally invalid origin rules and changed correct answers", () => {
    for (const patch of [{ maxScore: null }, { maxScore: Infinity }, { correctAnswer: "retired" }, { responsePolicy: { blank: "exclude" as const, invalid: null } }]) {
      const rows = setAnalysisScoring([question()], "q", source, patch);
      expect(previewAnalysisReuse(rows, source, target)[0]!.status).toBe("invalid");
    }
  });
  it("applies only selected reviewed rows and preserves source, classification and untouched questions", () => {
    const rows = [question(), question("untouched")]; const before = JSON.stringify(rows);
    const preview = previewAnalysisReuse(rows, source, target);
    expect(applyAnalysisReuse(rows, source, target, preview, [])).toEqual(rows);
    const result = applyAnalysisReuse(rows, source, target, preview, ["q"]);
    expect(result[1]).toEqual(rows[1]);
    expect(result[0]!.weight).toEqual(rows[0]!.weight);
    expect(result[0]!.analysisParticipation).toEqual(rows[0]!.analysisParticipation);
    expect(result[0]!.analysisScoring!.find(rule => rule.analysisType === source)).toEqual(rows[0]!.analysisScoring![0]);
    expect(result[0]!.analysisScoring!.find(rule => rule.analysisType === target)!.maxScore).toBe(2);
    expect(JSON.stringify(rows)).toBe(before);
    expect(analysisScoringReady([result[0]!])).toBe(true);
  });
  it("does not apply stale or modified previews after rule, text, type or options change", () => {
    const rows = [question()]; const preview = previewAnalysisReuse(rows, source, target);
    const changed = [setAnalysisScoring(rows, "q", source, { maxScore: 3 }), [{ ...rows[0]!, text: "Changed" }], [{ ...rows[0]!, options: ["A", "C"] }], [{ ...rows[0]!, type: "FREQUENCY" as const }]];
    for (const current of changed) expect(applyAnalysisReuse(current, source, target, preview, ["q"])).toEqual(current);
    const tampered = preview.map(row => ({ ...row, rule: { ...row.rule!, maxScore: 99 } }));
    expect(applyAnalysisReuse(rows, source, target, tampered, ["q"])).toEqual(rows);
    const configured = setAnalysisScoring(rows, "q", target, { maxScore: 8 });
    expect(applyAnalysisReuse(configured, source, target, preview, ["q"])).toEqual(configured);
  });
  it("copies explicit option scores, zero, exclusions and policies without sharing mutable nested data", () => {
    const rows = setAnalysisScoring([question()], "q", source, { scoringMode: "option_scores", optionScores: [{ value: "A", score: 0 }, { value: "B", score: null, excluded: true }], responsePolicy: { blank: "exclude", invalid: "review" } });
    const result = applyAnalysisReuse(rows, source, target, previewAnalysisReuse(rows, source, target), ["q"]);
    const copied = result[0]!.analysisScoring!.find(rule => rule.analysisType === target)!;
    expect(copied.optionScores).toEqual(rows[0]!.analysisScoring![0]!.optionScores);
    expect(copied.responsePolicy).toEqual({ blank: "exclude", invalid: "review" });
    copied.optionScores![0]!.score = 1;
    expect(rows[0]!.analysisScoring![0]!.optionScores![0]!.score).toBe(0);
    expect(result[0]!.analysisScoring!.find(rule => rule.analysisType === source)!.optionScores![0]!.score).toBe(0);
  });
  it("copies explicit ranges and direction and survives the existing draft serialization contract", () => {
    const rows = setAnalysisScoring([{ ...question(), type: "LIKERT" as const, options: [] }], "q", source, { maxScore: 5, scoringMode: "numeric_range", numericRange: { minimum: -2, maximum: 2, direction: "reverse" } });
    const result = applyAnalysisReuse(rows, source, target, previewAnalysisReuse(rows, source, target), ["q"]);
    const reopened = SurveySetupQuestionSchema.parse(JSON.parse(JSON.stringify(result[0])));
    expect(reopened.analysisScoring!.find(rule => rule.analysisType === target)!.numericRange).toEqual({ minimum: -2, maximum: 2, direction: "reverse" });
    expect(analysisScoringReady([reopened])).toBe(true);
  });
  it("renders an explicit source choice with no automatic preview or application", () => {
    const markup = renderToStaticMarkup(<ReuseAnalysisScoring questions={[question()]} target={target} onApply={() => { throw Error("Must not apply while rendering"); }} />);
    expect(markup).toContain("Selecciona el origen");
    expect(markup).toContain("Generar vista previa de reglas");
    expect(markup).not.toContain("Disponible para revisar");
    expect(markup).not.toContain("Aplicar 1 reglas");
    expect(markup).toContain("incluso incompletas");
  });
});
