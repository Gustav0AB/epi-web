import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { analysisScoringReady, type QuestionWithWeight, type SurveyDefinitionDto, type SurveySetupQuestion } from "@epi/shared";
import { availableAnalysisReuseDefinitions, applyInstrumentAnalysisReuse, previewInstrumentAnalysisReuse } from "../features/surveys/setup-analysis-reuse";
import { ReuseAnalysisScoring } from "../features/surveys/ReuseAnalysisScoring";
const target = (): SurveySetupQuestion & { options: string[] } => ({ externalId: "new", text: "How much did you learn?", type: "ONE_ANSWER", role: "SCORED", options: ["A", "B"], analysisParticipation: [{ analysisType: "pre_post", enabled: true }, { analysisType: "pre_post_post", enabled: true }], weight: { category: "Target", subcategory: "Target sub", maxScore: 9, correctAnswer: "A" } });
const source = (): QuestionWithWeight => ({ type: "ONE_ANSWER", role: "SCORED", options: ["A", "B"], analysisParticipation: target().analysisParticipation, externalId: "old", text: " HOW MUCH  did you learn? ", id: "source-question", answers: ["private answer not part of preview"], weight: { category: "Origin", subcategory: "Origin sub", maxScore: 99, correctAnswer: "A" }, analysisScoring: [{ analysisType: "pre_post", maxScore: 2, correctAnswer: "B" }] });
const preview = (questions = [target()], sources = [source()], definition = "definition") => previewInstrumentAnalysisReuse(questions, sources, definition, "pre_post", "pre_post_post");

describe("reviewed scoring reuse across authorized instruments", () => {
  it("limits discovery to the same organization/program and excludes CQS and the current form", () => {
    const base: SurveyDefinitionDto = { id: "ok", siteId: "site", jotformFormId: "other", organizationId: "org", type: "LOCAL", version: 1, title: "Source", accountName: null, isWeighted: false, openQuestionsSummary: null, instrumentKind: "LEARNING" };
    const definitions = [base, { ...base, id: "foreign", organizationId: "other" }, { ...base, id: "program", type: "VISITING" }, { ...base, id: "current", jotformFormId: "current-form" }, { ...base, id: "cqs", instrumentKind: "CQS" }];
    expect(availableAnalysisReuseDefinitions(definitions, { organizationId: "org", surveyType: "LOCAL", formId: "current-form" }).map(item => item.id)).toEqual(["ok"]);
  });
  it("suggests across different IDs without inferring a link or exposing source answers in the preview", () => {
    const before = JSON.stringify([target(), source()]);
    const rows = preview();
    expect(rows[0]).toMatchObject({ externalId: "new", status: "ready", rule: { analysisType: "pre_post_post", maxScore: 2, correctAnswer: "B" } });
    expect(JSON.stringify(rows)).not.toContain("private answer");
    expect(JSON.stringify([target(), source()])).toBe(before);
  });
  it("requires matching text, type and ordered options, never chooses ambiguous candidates", () => {
    for (const candidate of [{ ...source(), text: "Another" }, { ...source(), type: "LIKERT" }, { ...source(), options: ["B", "A"] }]) expect(preview([target()], [candidate])[0]!.status).toBe("unmatched");
    expect(preview([target()], [source(), { ...source(), id: "duplicate" }])[0]!.status).toBe("ambiguous");
  });
  it("does not copy legacy weights, inactive participation, invalid rules or overwrite partial targets", () => {
    expect(preview([target()], [{ ...source(), analysisScoring: null }])[0]!.status).toBe("unconfigured");
    expect(preview([target()], [{ ...source(), analysisParticipation: null }])[0]!.status).toBe("source_inactive");
    expect(preview([target()], [{ ...source(), analysisScoring: [{ analysisType: "pre_post", maxScore: null, correctAnswer: "B" }] }])[0]!.status).toBe("invalid");
    expect(preview([{ ...target(), analysisScoring: [{ analysisType: "pre_post_post", maxScore: null, correctAnswer: null }] }])[0]!.status).toBe("existing");
  });
  it("applies only accepted rules and preserves target classification, weights, participation and other analysis", () => {
    const questions: ReturnType<typeof target>[] = [{ ...target(), analysisScoring: [{ analysisType: "pre_post" as const, maxScore: 8, correctAnswer: "A" }] }];
    const sources = [source()]; const before = JSON.stringify([questions, sources]);
    const rows = preview(questions, sources);
    expect(applyInstrumentAnalysisReuse(questions, sources, "definition", "pre_post", "pre_post_post", rows, [])).toEqual(questions);
    const result = applyInstrumentAnalysisReuse(questions, sources, "definition", "pre_post", "pre_post_post", rows, ["new"]);
    expect(result[0]!.weight).toEqual(questions[0]!.weight);
    expect(result[0]!.analysisParticipation).toEqual(questions[0]!.analysisParticipation);
    expect(result[0]!.analysisScoring!.find(rule => rule.analysisType === "pre_post")!.maxScore).toBe(8);
    expect(result[0]!.analysisScoring!.find(rule => rule.analysisType === "pre_post_post")!.maxScore).toBe(2);
    expect(analysisScoringReady(result)).toBe(true);
    expect(JSON.stringify([questions, sources])).toBe(before);
  });
  it("invalidates previews if the version, source rule, target or reviewed proposal changes", () => {
    const questions = [target()], sources = [source()], rows = preview();
    expect(applyInstrumentAnalysisReuse(questions, sources, "another-version", "pre_post", "pre_post_post", rows, ["new"])).toEqual(questions);
    const changedSources = [{ ...source(), analysisScoring: [{ analysisType: "pre_post" as const, maxScore: 3, correctAnswer: "B" }] }];
    expect(applyInstrumentAnalysisReuse(questions, changedSources, "definition", "pre_post", "pre_post_post", rows, ["new"])).toEqual(questions);
    const changedTarget = [{ ...target(), text: "Changed" }];
    expect(applyInstrumentAnalysisReuse(changedTarget, sources, "definition", "pre_post", "pre_post_post", rows, ["new"])).toEqual(changedTarget);
    const tampered = rows.map(row => ({ ...row, rule: { ...row.rule!, maxScore: 99 } }));
    expect(applyInstrumentAnalysisReuse(questions, sources, "definition", "pre_post", "pre_post_post", tampered, ["new"])).toEqual(questions);
  });
  it("copies explicit nested exclusions and policies without sharing mutable source data", () => {
    const origin: QuestionWithWeight = { ...source(), analysisScoring: [{ analysisType: "pre_post", maxScore: 2, correctAnswer: null, scoringMode: "option_scores", optionScores: [{ value: "A", score: 0 }, { value: "B", score: null, excluded: true }], responsePolicy: { blank: "exclude", invalid: "review" } }] };
    const questions = [target()], sources = [origin];
    const result = applyInstrumentAnalysisReuse(questions, sources, "definition", "pre_post", "pre_post_post", preview(questions, sources), ["new"]);
    const copied = result[0]!.analysisScoring![0]!;
    expect(copied.optionScores![1]!.excluded).toBe(true);
    expect(copied.responsePolicy!.blank).toBe("exclude");
    copied.optionScores![0]!.score = 1;
    expect(origin.analysisScoring![0]!.optionScores![0]!.score).toBe(0);
  });
  it("offers instrument and version selection without applying or preselecting any proposal", () => {
    const markup = renderToStaticMarkup(<ReuseAnalysisScoring questions={[target()]} target="pre_post_post" scope={{ organizationId: "org", formId: "current", surveyType: "LOCAL" }} onApply={() => { throw Error("Unexpected write"); }} />);
    expect(markup).toContain("Instrumento de origen para reutilizar");
    expect(markup).toContain("Este borrador");
    expect(markup).toContain("no establece equivalencias ni vínculos");
    expect(markup).not.toContain("Disponible para revisar");
  });
});
