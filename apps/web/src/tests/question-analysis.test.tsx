import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { canConfigureAnalysis, configuredForAnalysis, QuestionAnalysisParticipationSchema, setAnalysisParticipation, SurveySetupQuestionSchema, type SurveySetupQuestion } from "@epi/shared";
import { analysisParticipationText, QuestionAnalysisParticipation } from "../features/surveys/QuestionAnalysisParticipation";

const question = (index: number): SurveySetupQuestion => ({ externalId: `source-id-${index}`, text: `Pregunta ${index}`, type: "LIKERT", role: "SCORED", weight: { category: "Learning", subcategory: "Knowledge", maxScore: 5, correctAnswer: null } });
const selection = (pre: boolean, follow: boolean) => [{ analysisType: "pre_post" as const, enabled: pre }, { analysisType: "pre_post_post" as const, enabled: follow }];

describe("independent analysis participation approved in D4", () => {
  it("accepts all four combinations and rejects duplicates, unknown analysis and partial configuration", () => {
    for (const pre of [false, true]) for (const follow of [false, true]) expect(QuestionAnalysisParticipationSchema.safeParse(selection(pre, follow)).success).toBe(true);
    for (const value of [[], [selection(true, true)[0]], [selection(true, true)[0], selection(true, true)[0]], [{ analysisType: "unknown", enabled: true }, selection(false, false)[1]], [{ analysisType: "pre_post", enabled: "false" }, selection(false, false)[1]]]) expect(QuestionAnalysisParticipationSchema.safeParse(value).success).toBe(false);
    expect(SurveySetupQuestionSchema.parse(question(0)).analysisParticipation).toBeUndefined();
    expect(SurveySetupQuestionSchema.parse({ ...question(0), analysisParticipation: null }).analysisParticipation).toBeNull();
  });
  it("configures the 11/15 example without duplicating questions or changing their weights", () => {
    const original = Array.from({ length: 15 }, (_, index) => question(index));
    const savedOriginal = JSON.stringify(original);
    const follow = setAnalysisParticipation(original, original.map(item => item.externalId), "pre_post_post", true);
    const both = setAnalysisParticipation(follow, original.slice(0, 11).map(item => item.externalId), "pre_post", true);
    expect(both.filter(item => configuredForAnalysis(item, "pre_post"))).toHaveLength(11);
    expect(both.filter(item => configuredForAnalysis(item, "pre_post_post"))).toHaveLength(15);
    expect(new Set(both.map(item => item.externalId)).size).toBe(15);
    expect(both.map(item => item.weight)).toEqual(original.map(item => item.weight));
    expect(JSON.stringify(original)).toBe(savedOriginal);
  });
  it("supports bulk removal while preserving the other analysis and ignoring stale/unknown selections", () => {
    const rows = [{ ...question(0), analysisParticipation: selection(true, true) }, { ...question(1), analysisParticipation: selection(true, true) }];
    const result = setAnalysisParticipation(rows, [rows[0]!.externalId, "missing"], "pre_post", false);
    expect(result[0]!.analysisParticipation).toEqual(selection(false, true));
    expect(result[1]).toEqual(rows[1]);
  });
  it("deactivates effective participation for other roles and open text without losing saved choices", () => {
    const configured = { ...question(0), analysisParticipation: selection(true, true) };
    for (const role of ["EXCLUDED", "IDENTIFIER", "INFORMATIONAL", "SCHOOL_GROUP", "ACTIVITY", "MOMENT", "FILTER"] as const) {
      const changed = { ...configured, role };
      expect(canConfigureAnalysis(changed)).toBe(false);
      expect(configuredForAnalysis(changed, "pre_post")).toBe(false);
      expect(setAnalysisParticipation([changed], [changed.externalId], "pre_post", false)[0]!.analysisParticipation).toEqual(selection(true, true));
      expect(configuredForAnalysis({ ...changed, role: "SCORED" }, "pre_post")).toBe(true);
    }
    expect(configuredForAnalysis({ ...configured, type: "OPEN_TEXT" }, "pre_post")).toBe(false);
  });
  it("distinguishes untouched legacy configuration from explicit neither", () => {
    expect(analysisParticipationText(question(0))).toBe("Sin configurar");
    expect(analysisParticipationText({ ...question(0), analysisParticipation: selection(false, false) })).toBe("Ninguno");
    expect(analysisParticipationText({ ...question(0), analysisParticipation: selection(false, true) })).toBe("Pre/Post + Post-post");
    expect(analysisParticipationText({ ...question(0), role: "EXCLUDED", analysisParticipation: selection(true, true) })).toBe("No aplica por rol o tipo");
  });
  it("renders ten questions with labeled checkboxes and batch controls without showing technical IDs", () => {
    const markup = renderToStaticMarkup(<QuestionAnalysisParticipation questions={Array.from({ length: 15 }, (_, index) => question(index))} onChange={() => {}} />);
    expect(markup).toContain("Participación en análisis");
    expect(markup).toContain("Seleccionar todas las evaluables");
    expect(markup).toContain('aria-label="Pre/Post: Pregunta 0"');
    expect(markup).toContain('aria-label="Pre/Post + Post-post: Pregunta 0"');
    expect((markup.match(/<details/g) ?? [])).toHaveLength(10);
    expect(markup).not.toContain("Pregunta 10");
    expect(markup).not.toContain("source-id-");
  });
  it("keeps CQS controls disabled while its separate methodology remains pending", () => {
    const markup = renderToStaticMarkup(<QuestionAnalysisParticipation disabled questions={[question(0)]} onChange={() => {}} />);
    expect(markup).toContain("CQS requiere su metodología independiente");
    expect(markup).toMatch(/aria-label="Pre\/Post: Pregunta 0"[^>]*disabled/);
  });
});
