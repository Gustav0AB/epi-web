import { describe, expect, it } from "vitest";
import { SurveySetupDraftSchema, WeightInputSchema } from "@epi/shared";
import { canContinueSetup, isQuestionSetupReviewed, questionSetupIssue, setQuestionSetupReview } from "../features/surveys/setup-steps";

describe("instrument setup steps", () => {
  it("allows general setup before questions load or weights are complete", () => {
    expect(canContinueSetup(1, { generalReady: true, questionsReady: false, weightsReady: false })).toBe(true);
    expect(canContinueSetup(2, { generalReady: true, questionsReady: false, weightsReady: false })).toBe(false);
  });
  it("lets valid questions reach scoring with an incomplete weight draft", () => {
    const state = { generalReady: true, questionsReady: true, weightsReady: false };
    expect(canContinueSetup(2, state)).toBe(true);
    expect(canContinueSetup(3, state)).toBe(false);
    expect(canContinueSetup(4, state)).toBe(false);
  });
  it("blocks review and registration when earlier data becomes invalid", () => {
    expect(canContinueSetup(4, { generalReady: false, questionsReady: true, weightsReady: true })).toBe(false);
    expect(canContinueSetup(4, { generalReady: true, questionsReady: false, weightsReady: true })).toBe(false);
    expect(canContinueSetup(4, { generalReady: true, questionsReady: true, weightsReady: true })).toBe(true);
  });
});

it("retains question classification in an incomplete draft before scoring", () => {
  const draft = SurveySetupDraftSchema.parse({ siteId: null, type: "LOCAL", instrumentName: "Survey", activityName: "Trip", questions: [
    { externalId: "scale", text: "Question", type: "LIKERT", weight: { category: "Learning", subcategory: "Biodiversity", maxScore: null, correctAnswer: null } },
    { externalId: "excluded", text: "Ignored", type: "ONE_ANSWER", role: "EXCLUDED" },
  ] });
  const reopened = SurveySetupDraftSchema.parse(JSON.parse(JSON.stringify(draft)));
  expect(reopened.questions?.[0]?.weight).toMatchObject({ category: "Learning", subcategory: "Biodiversity", maxScore: null });
  expect(reopened.questions?.[1]?.role).toBe("EXCLUDED");
  const weight = reopened.questions![0]!.weight!;
  expect(WeightInputSchema.safeParse(weight).success).toBe(false);
  expect(WeightInputSchema.safeParse({ ...weight, maxScore: 5 }).success).toBe(true);
});


describe("question configuration status", () => {
  const base = { externalId: "question", text: "¿Qué aprendiste?", type: "ONE_ANSWER" as const, options: ["A", "B"], controlType: "control_radio" };
  const catalog = [{ id: "cat", organizationId: "org", name: "Learning", subcategory: "Knowledge", isActive: true }];
  const check = (question: Parameters<typeof questionSetupIssue>[0], others = [question], loading = false) => questionSetupIssue(question, others, catalog, "org", loading, question);
  it("requires a valid subcategory for evaluables but leaves scoring to step 3", () => {
    expect(check(base)).toMatch(/categoría/);
    const classified = { ...base, classification: { category: "Learning", subcategory: "Knowledge" } };
    expect(check(classified)).toBeNull();
    expect(check(classified, [classified], true)).toMatch(/Catálogo/);
    expect(check({ ...base, role: "EXCLUDED" })).toBeNull();
  });
  it("keeps complete defaults pending until reviewed and persists the toggle in a reopened draft", () => {
    const defaultQuestion = { ...base, role: "INFORMATIONAL" as const };
    expect(check(defaultQuestion)).toBeNull();
    expect(isQuestionSetupReviewed(defaultQuestion, check(defaultQuestion))).toBe(false);
    const reviewed = setQuestionSetupReview(defaultQuestion, true, check(defaultQuestion));
    const draft = SurveySetupDraftSchema.parse({ siteId: null, type: "LOCAL", instrumentName: "Form", activityName: "Curso", questions: [reviewed] });
    const reopened = SurveySetupDraftSchema.parse(JSON.parse(JSON.stringify(draft))).questions![0]!;
    expect(isQuestionSetupReviewed(reopened, null)).toBe(true);
    expect(isQuestionSetupReviewed(setQuestionSetupReview(reopened, false, null), null)).toBe(false);
    expect(isQuestionSetupReviewed(reopened, "La configuración requiere revisión")).toBe(false);
  });
  it("marks an edited question reviewed only once the last requirement is completed", () => {
    expect(isQuestionSetupReviewed(setQuestionSetupReview(base, true, check(base)), null)).toBe(false);
    const completed = { ...base, classification: { category: "Learning", subcategory: "Knowledge" } };
    expect(isQuestionSetupReviewed(setQuestionSetupReview(completed, true, check(completed)), null)).toBe(true);
  });
  it("keeps a Moment question pending for an unmapped source answer", () => {
    const moment = { ...base, role: "MOMENT" as const, options: ["Antes del curso", "Después del curso", "Otro"], momentMappings: [{ value: "Antes del curso", moment: "PRE" as const }, { value: "Después del curso", moment: "POST" as const }] };
    expect(check(moment)).toMatch(/cada respuesta/);
    expect(check({ ...moment, options: moment.options.slice(0, 2) })).toBeNull();
    expect(check(moment, [moment, { ...moment, externalId: "duplicate" }])).toMatch(/una pregunta/);
  });
  it("marks filters with options no longer in the source as pending", () => {
    expect(check({ ...base, role: "INFORMATIONAL", isFilter: true, optionLabels: [{ value: "Retirada", label: "Nombre" }] })).toMatch(/filtro/);
  });
});
