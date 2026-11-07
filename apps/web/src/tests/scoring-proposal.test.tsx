import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { analysisScoringReady, scaleOptionPoints, setAnalysisScoring, SurveySetupQuestionSchema, type SurveySetupQuestion } from "@epi/shared";
import { applyAutomaticScoringProposal, applyScoringProposal, previewScoringProposal, validatedScoringProposal } from "../features/surveys/setup-scoring-proposal";
import { ScoringProposal } from "../features/surveys/ScoringProposal";
type Question = SurveySetupQuestion & { options: string[] };
const question = (externalId = "q"): Question => ({ externalId, text: "Escala numérica", type: "LIKERT", role: "SCORED", options: ["0", "1", "2.5"], weight: { category: "Learning", subcategory: "Knowledge", maxScore: 99, correctAnswer: null }, analysisParticipation: [{ analysisType: "pre_post", enabled: true }, { analysisType: "pre_post_post", enabled: true }] });
const analysis = "pre_post" as const;

describe("reviewed numeric scoring proposals", () => {
  it("suggests explicit numeric values including zero/decimals without mutating questions or copying general scores", () => {
    const questions = [question()]; const before = JSON.stringify(questions);
    const proposal = previewScoringProposal(questions, analysis)[0]!;
    expect(proposal.rule).toMatchObject({ analysisType: analysis, maxScore: 2.5, scoringMode: "option_scores", correctAnswer: null, optionScores: [{ value: "0", score: 0 }, { value: "1", score: 1 }, { value: "2.5", score: 2.5 }] });
    expect(proposal.rule!.numericRange).toBeUndefined();
    expect(proposal.rule!.responsePolicy).toBeUndefined();
    expect(JSON.stringify(questions)).toBe(before);
  });
  it("leaves answer correctness, categorical scales, raw ranges and ambiguous numeric formats for manual review", () => {
    const manual = [{ ...question(), type: "ONE_ANSWER" as const }, ...[[], ["0", "No aplica"], ["A", "B"], ["1", "1"], ["0", "-1"], ["0", "1,5"], ["0", "1e3"], ["0", "0"], ["1"], ["1", "02"]].map(options => ({ ...question(), options }))];
    for (const row of manual) expect(previewScoringProposal([row], analysis)[0]!.rule).toBeNull();
    expect(previewScoringProposal([{ ...question(), type: "ONE_ANSWER" }], analysis)[0]!.reason).toContain("decisión manual");
  });
  it("only considers enabled evaluable questions and preserves partial rules", () => {
    expect(previewScoringProposal([{ ...question(), role: "EXCLUDED" }, { ...question(), type: "OPEN_TEXT" }, { ...question(), analysisParticipation: null }], analysis)).toEqual([]);
    const existing = setAnalysisScoring([question()], "q", analysis, { maxScore: null });
    expect(previewScoringProposal(existing, analysis)[0]!.rule).toBeNull();
  });
  it("accepts only selected proposals and allows editing points before acceptance", () => {
    const questions = [question(), question("untouched")];
    const preview = previewScoringProposal(questions, analysis);
    const edited = preview.map(row => row.externalId !== "q" ? row : { ...row, rule: { ...row.rule!, maxScore: 5, optionScores: [{ value: "0", score: 5 }, { value: "1", score: 2 }, { value: "2.5", score: 0 }] } });
    expect(applyScoringProposal(questions, analysis, edited, [])).toEqual(questions);
    const result = applyScoringProposal(questions, analysis, edited, ["q"]);
    expect(result[0]!.analysisScoring![0]!.optionScores).toEqual(edited[0]!.rule!.optionScores);
    expect(result[1]).toEqual(questions[1]);
    expect(result[0]!.weight).toEqual(questions[0]!.weight);
    expect(result[0]!.analysisParticipation).toEqual(questions[0]!.analysisParticipation);
    expect(analysisScoringReady(result, analysis)).toBe(false); // Unselected question remains unconfigured.
    expect(analysisScoringReady([result[0]!], analysis)).toBe(true);
  });
  it("rejects incomplete edits, out-of-range values and wrong analysis or method", () => {
    const row = previewScoringProposal([question()], analysis)[0]!;
    for (const patch of [{ maxScore: null }, { maxScore: 1 }, { maxScore: Infinity }, { analysisType: "pre_post_post" as const }, { scoringMode: "standard" as const }, { optionScores: [{ value: "0", score: null }] }, { optionScores: [{ value: "0", score: -1 }] }]) expect(validatedScoringProposal(question(), analysis, { ...row, rule: { ...row.rule!, ...patch } })).toBeNull();
  });
  it("requires a new preview after options, role, participation, text or classification change", () => {
    const original = [question()]; const reviewed = previewScoringProposal(original, analysis);
    const changed = [{ ...question(), options: ["1", "2"] }, { ...question(), role: "EXCLUDED" as const }, { ...question(), analysisParticipation: null }, { ...question(), text: "Changed" }, { ...question(), weight: { ...question().weight!, category: "Changed" } }];
    for (const row of changed) expect(applyScoringProposal([row], analysis, reviewed, ["q"])).toEqual([row]);
  });
  it("never overwrites a rule added after preview and preserves the other analysis", () => {
    const questions = setAnalysisScoring([question()], "q", "pre_post_post", { maxScore: 7 });
    const reviewed = previewScoringProposal(questions, analysis);
    const result = applyScoringProposal(questions, analysis, reviewed, ["q"]);
    expect(result[0]!.analysisScoring!.find(rule => rule.analysisType === "pre_post_post")!.maxScore).toBe(7);
    const existing = setAnalysisScoring(questions, "q", analysis, { maxScore: null });
    expect(applyScoringProposal(existing, analysis, reviewed, ["q"])).toEqual(existing);
  });
  it("copies accepted nested rules independently and preserves the existing draft contract", () => {
    const questions = [question()], preview = previewScoringProposal(questions, analysis);
    const result = applyScoringProposal(questions, analysis, preview, ["q"]);
    const reopened = SurveySetupQuestionSchema.parse(JSON.parse(JSON.stringify(result[0])));
    expect(reopened.analysisScoring).toEqual(result[0]!.analysisScoring);
    result[0]!.analysisScoring![0]!.optionScores![0]!.score = 1;
    expect(preview[0]!.rule!.optionScores![0]!.score).toBe(0);
    expect(questions[0]!.analysisScoring).toBeUndefined();
  });
  it("can suggest a frequency scale without deducing direction from labels or text", () => {
    const original = { ...question(), type: "FREQUENCY" as const, text: "A negative statement" };
    expect(previewScoringProposal([original], analysis)[0]!.rule).toEqual(previewScoringProposal([question()], analysis)[0]!.rule);
  });
  it("applies the scale points in one action, preserving existing rules and questions needing manual answers", () => {
    const scale = question();
    const manual = { ...question("correct"), type: "ONE_ANSWER" as const };
    const existing: Question = { ...question("existing"), analysisScoring: [{ analysisType: analysis, maxScore: null, correctAnswer: null }] };
    const excluded = { ...question("excluded"), role: "EXCLUDED" as const };
    const result = applyAutomaticScoringProposal([scale, manual, existing, excluded], analysis);
    const rule = result[0]!.analysisScoring![0]!;
    expect(scaleOptionPoints(rule.scaleOptions!, rule.maxScore, rule.inverse).map(option => option.score)).toEqual([3, 2, 1]);
    expect(result[0]!.weight).toEqual(scale.weight);
    expect(result.slice(1)).toEqual([manual, existing, excluded]);
    expect(applyAutomaticScoringProposal(result, analysis)).toBe(result);
    expect(scale.analysisScoring).toBeUndefined();
  });
  it("only renders the generation action initially; opening the section does not write or select proposals", () => {
    const markup = renderToStaticMarkup(<ScoringProposal questions={[question()]} analysis={analysis} onApply={() => { throw Error("Unexpected write"); }} />);
    expect(markup).toContain("Generar propuesta de puntuación");
    expect(markup).toContain("no decide respuestas correctas ni dirección inversa");
    expect(markup).not.toContain("Aceptar 1 propuestas");
    expect(markup).not.toContain("Revisar y modificar puntos");
  });
});
