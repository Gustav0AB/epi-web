import { describe, expect, it } from "vitest";
import { questionSection, individualMatrixQuestions, preserveOpenQuestion, applyMatrixDefaults, matrixConfigurationEdits, configurationChanges, MatrixDefaultsSchema, SurveySetupDraftSchema, setAssistantScoring, type MatrixDefaults, type SurveySetupQuestion } from "@epi/shared";
const row = (index: number): SurveySetupQuestion & { options: string[] } => ({ externalId: `row:${index}`, text: `Afirmación ${index}`, type: "LIKERT", role: "SCORED", options: ["Agree", "Disagree"], sourceContext: { matrix: { externalId: "matrix", text: "Opiniones", rowKey: String(index), rowIndex: index, rowLabel: `Afirmación ${index}` } } });
const defaults = (): MatrixDefaults => [{ externalId: "matrix", role: "SCORED", classification: { category: "Learning", subcategory: "Attitudes" }, analysisParticipation: [{ analysisType: "pre_post", enabled: true }, { analysisType: "pre_post_post", enabled: false }], analysisScoring: [{ analysisType: "pre_post", maxScore: 10, correctAnswer: null, scoringMode: "ordered_scale", scaleOptions: ["Agree", "Disagree"], inverse: false, responsePolicy: { blank: "exclude", invalid: "review" } }] }];
describe("matrix inheritance and version review", () => {
  it("inherits role, classification, participation and rules while retaining identity/source/options", () => {
    const original = [row(0), row(1)]; const before = JSON.stringify(original);
    const effective = applyMatrixDefaults(original, defaults());
    expect(effective[0]!.classification).toEqual(defaults()[0]!.classification);
    expect(effective[1]!.analysisScoring![0]!.maxScore).toBe(10);
    expect(effective[1]!.sourceContext).toEqual(original[1]!.sourceContext);
    expect(effective[0]!.options).toEqual(["Agree", "Disagree"]);
    effective[0]!.analysisScoring![0]!.scaleOptions![0] = "Changed";
    expect(effective[1]!.analysisScoring![0]!.scaleOptions![0]).toBe("Agree");
    expect(JSON.stringify(original)).toBe(before);
  });
  it("marks only the edited row as an exception and restores inheritance explicitly", () => {
    const current = applyMatrixDefaults([row(0), row(1)], defaults());
    const changed = matrixConfigurationEdits(setAssistantScoring(current, "row:0", "pre_post", { maxScore: 4 }), current);
    expect(changed[0]!.matrixOverride).toBe(true);
    expect(changed[1]!.matrixOverride).not.toBe(true);
    const newDefaults = defaults();newDefaults[0]!.analysisScoring![0]!.maxScore = 20;
    const effective = applyMatrixDefaults(changed, newDefaults);
    expect(effective.map(item => item.analysisScoring![0]!.maxScore)).toEqual([4, 20]);
    const restored = matrixConfigurationEdits([{ ...changed[0]!, matrixOverride: false }, changed[1]!], changed, true);
    expect(applyMatrixDefaults(restored, newDefaults).map(item => item.analysisScoring![0]!.maxScore)).toEqual([20, 20]);
  });
  it("round trips a partial version draft and rejects duplicate/unsafe group roles", () => {
    const draft = SurveySetupDraftSchema.parse({ scoringWeightsVersion: 4, analysisWeights: [], siteId: null, type: "LOCAL", instrumentName: "Form", activityName: "Trip", baseDefinitionId: "00000000-0000-4000-8000-000000000001", matrixDefaults: defaults(), questions: [row(0)] });
    expect(SurveySetupDraftSchema.parse(JSON.parse(JSON.stringify(draft)))).toEqual(draft);
    expect(MatrixDefaultsSchema.safeParse([...defaults(), ...defaults()]).success).toBe(false);
    expect(MatrixDefaultsSchema.safeParse([{ ...defaults()[0], role: "MOMENT" }]).success).toBe(false);
  });
  it("reviews added/removed/changed rows and changes to general configuration", () => {
    const before = SurveySetupDraftSchema.parse({ scoringWeightsVersion: 4, analysisWeights: [], siteId: null, type: "LOCAL", instrumentName: "Form", activityName: "Trip", matrixDefaults: defaults(), questions: [row(0), row(1)] });
    const after = { ...before, description: "Updated", questions: [row(0), { ...row(2), matrixOverride: true }] };
    expect(configurationChanges(before, after)).toEqual(expect.arrayContaining(["Descripción", "Pregunta nueva: Afirmación 2", "Pregunta retirada: Afirmación 1"]));
    expect(configurationChanges(before, before)).toEqual([]);
  });
  it("materializes existing inherited values as independent questions without changing originals", () => {
    const source = [row(0), row(1)]; const before = JSON.stringify(source);
    const individual = individualMatrixQuestions(source, defaults());
    expect(individual.every(question => question.matrixOverride)).toBe(true);
    expect(individual[0]!.analysisScoring).toEqual(defaults()[0]!.analysisScoring);
    const changed = defaults(); changed[0]!.analysisScoring![0]!.maxScore = 50;
    expect(applyMatrixDefaults(individual, changed)[0]!.analysisScoring![0]!.maxScore).toBe(10);
    expect(JSON.stringify(source)).toBe(before);
    expect(questionSection(individual[0]!)).toEqual({ key: "matrix:matrix", label: "Opiniones" });
  });
  it("uses source headings and a no-section group without confusing duplicate section labels", () => {
    expect(questionSection({})).toEqual({ key: "unsectioned", label: "Sin sección" });
    expect(questionSection({ sourceContext: { section: { externalId: "a", text: "Datos" } } })).toEqual({ key: "section:a", label: "Datos" });
    expect(questionSection({ sourceContext: { section: { externalId: "b", text: "Datos" } } }).key).not.toBe("section:a");
  });
  it("keeps free text out of scoring while retaining source identity and permitted context roles", () => {
    const open = { ...row(0), type: "OPEN_TEXT" as const, role: "SCORED" as const, analysisScoring: defaults()[0]!.analysisScoring };
    expect(preserveOpenQuestion(open)).toMatchObject({ externalId: open.externalId, role: "INFORMATIONAL", type: "OPEN_TEXT", analysisScoring: null, analysisParticipation: null, weight: null });
    expect(preserveOpenQuestion({ ...open, role: "AGE" }).role).toBe("AGE");
  });
});
