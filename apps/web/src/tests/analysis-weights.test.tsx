import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { activeAnalysisWeights, analysisWeightsReady, AnalysisWeightsSchema, scoringGroups, setAnalysisParticipation, setAnalysisWeights, type AnalysisWeights, type SurveySetupQuestion } from "@epi/shared";
import { AnalysisWeightsSummary, SetupAnalysisScoring } from "../features/surveys/SetupAnalysisScoring";

const questions: (SurveySetupQuestion & { options: string[] })[] = Array.from({ length: 15 }, (_, index) => ({ externalId: String(index), text: `Pregunta ${index}`, type: "LIKERT", role: "SCORED", options: [], weight: { category: "Learning", subcategory: index < 11 ? "Knowledge" : "Action", maxScore: 5, correctAnswer: null }, analysisParticipation: [{ analysisType: "pre_post", enabled: index < 11 }, { analysisType: "pre_post_post", enabled: true }] }));
const pre = { analysisType: "pre_post" as const, categoryWeights: [{ category: "Learning", weight: 100 }], subcategoryWeights: [{ category: "Learning", subcategory: "Knowledge", weight: 100 }] };
const follow = { analysisType: "pre_post_post" as const, categoryWeights: [{ category: "Learning", weight: 100 }], subcategoryWeights: [{ category: "Learning", subcategory: "Knowledge", weight: 60 }, { category: "Learning", subcategory: "Action", weight: 40 }] };

describe("independent group distributions per analysis", () => {
  it("accepts incomplete drafts but rejects duplicate analysis/groups and out-of-range weights", () => {
    expect(AnalysisWeightsSchema.parse([{ ...pre, categoryWeights: [{ category: "Learning", weight: null }] }])[0]!.categoryWeights[0]!.weight).toBe(null);
    for (const value of [[pre, pre], [{ ...pre, categoryWeights: [...pre.categoryWeights, ...pre.categoryWeights] }], [{ ...follow, subcategoryWeights: [...follow.subcategoryWeights, follow.subcategoryWeights[0]] }], [{ ...pre, unknown: true }], [{ ...pre, categoryWeights: [{ category: "Learning", weight: 101 }] }]]) expect(AnalysisWeightsSchema.safeParse(value).success).toBe(false);
  });
  it("counts only enabled questions and requires separate weights without inheriting", () => {
    expect(scoringGroups(questions.filter(q => q.analysisParticipation![0]!.enabled))[0]!.categoryQuestionCount).toBe(11);
    expect(scoringGroups(questions)[0]!.categoryQuestionCount).toBe(15);
    expect(activeAnalysisWeights(questions, [pre], "pre_post_post", true).subcategoryWeights.every(item => item.weight === null)).toBe(true);
    expect(analysisWeightsReady(questions, [pre], true)).toBe(false);
    expect(analysisWeightsReady(questions, [pre, follow], true)).toBe(true);
  });
  it("edits one analysis without changing the other or the input", () => {
    const original = [pre, follow]; const before = JSON.stringify(original);
    const changed = setAnalysisWeights(original, "pre_post_post", { subcategoryWeights: [{ category: "Learning", subcategory: "Knowledge", weight: 70 }, { category: "Learning", subcategory: "Action", weight: 30 }] });
    expect(changed.find(item => item.analysisType === "pre_post")).toEqual(pre);
    expect(changed.find(item => item.analysisType === "pre_post_post")!.categoryWeights).toEqual(follow.categoryWeights);
    expect(JSON.stringify(original)).toBe(before);
    expect(analysisWeightsReady(questions, changed, true)).toBe(true);
  });
  it("keeps dormant groups through edits and restores their weights when reenabled", () => {
    const disabled = setAnalysisParticipation(questions, questions.slice(11).map(q => q.externalId), "pre_post_post", false);
    const active = activeAnalysisWeights(disabled, [follow], "pre_post_post", true);
    expect(active.subcategoryWeights).toHaveLength(1);
    const changed = setAnalysisWeights([follow], "pre_post_post", { subcategoryWeights: [{ ...active.subcategoryWeights[0]!, weight: 100 }] });
    expect(changed[0]!.subcategoryWeights.find(item => item.subcategory === "Action")!.weight).toBe(40);
    expect(analysisWeightsReady(disabled, [pre, ...changed], true)).toBe(true);
    const restored = activeAnalysisWeights(questions, changed, "pre_post_post", true);
    expect(restored.subcategoryWeights.find(item => item.subcategory === "Action")!.weight).toBe(40);
    expect(analysisWeightsReady(questions, [pre, ...changed], true)).toBe(false); // Restored 140% needs review.
  });
  it("excludes inactive roles and text, requires current classifications and checks both 100% totals", () => {
    expect(analysisWeightsReady(questions, [pre, { ...follow, categoryWeights: [{ category: "Learning", weight: 90 }] }], true)).toBe(false);
    expect(analysisWeightsReady(questions, [pre, { ...follow, subcategoryWeights: [{ ...follow.subcategoryWeights[0]!, weight: 99 }] }], true)).toBe(false);
    expect(analysisWeightsReady([{ ...questions[0]!, weight: null }], [pre, follow], true)).toBe(false);
    expect(analysisWeightsReady(questions.map(q => ({ ...q, role: "EXCLUDED" })), [], true)).toBe(true);
    expect(analysisWeightsReady(questions.map(q => ({ ...q, type: "OPEN_TEXT" })), [], true)).toBe(true);
  });
  it("keeps IAA inactive for follow-up without deleting saved learning weights", () => {
    const settings: AnalysisWeights = [pre, follow];
    expect(activeAnalysisWeights(questions, settings, "pre_post_post", false).categoryWeights).toEqual([]);
    expect(analysisWeightsReady(questions, settings, false)).toBe(true);
    expect(activeAnalysisWeights(questions, settings, "pre_post_post", true).categoryWeights).toEqual(follow.categoryWeights);
  });
  it("shows weights for the same selected analysis, no duplicate general score editor, and separate final summaries", () => {
    const markup = renderToStaticMarkup(<SetupAnalysisScoring questions={questions} onChange={() => {}} weights={[pre, follow]} onWeightsChange={() => {}} />);
    expect(markup).toContain('aria-label="Peso de Learning / Knowledge"');
    expect(markup).not.toContain('aria-label="Peso de Learning / Action"');
    expect(markup).not.toContain('aria-label="Máximo de escala:');
    const summary = renderToStaticMarkup(<AnalysisWeightsSummary questions={questions} weights={[pre, follow]} includeIaa />);
    expect(summary).toMatch(/<dt[^>]*>Knowledge<\/dt><dd[^>]*>100%<\/dd>/);
    expect(summary).toMatch(/<dt[^>]*>Knowledge<\/dt><dd[^>]*>60%<\/dd>/);
    expect(summary).toMatch(/<dt[^>]*>Action<\/dt><dd[^>]*>40%<\/dd>/);
    expect(markup).toContain("Solo configuradas");
    expect(markup).toContain("Solo pendientes");
  });
});

it("validates and preserves instrument standard-deviation settings when weights change", () => {
 const configured = AnalysisWeightsSchema.parse([{ ...pre, standardDeviation: "sample" }]);
 expect(setAnalysisWeights(configured, "pre_post", { categoryWeights: [{ category: "Learning", weight: 80 }] })[0]?.standardDeviation).toBe("sample");
 expect(setAnalysisWeights(configured, "pre_post", { standardDeviation: "population" })[0]?.categoryWeights).toEqual(pre.categoryWeights);
 expect(AnalysisWeightsSchema.safeParse([{ ...pre, standardDeviation: "manual-number" }]).success).toBe(false);
 expect(renderToStaticMarkup(<AnalysisWeightsSummary instrumentMode questions={questions} weights={configured} includeIaa />)).toContain("Muestral");
 expect(renderToStaticMarkup(<SetupAnalysisScoring instrumentMode questions={questions} onChange={() => {}} weights={configured} onWeightsChange={() => {}} />)).toContain("Desviación estándar del instrumento");
});
