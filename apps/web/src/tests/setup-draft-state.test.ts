import { describe, expect, it } from "vitest";
import type { SurveySetupDraft } from "@epi/shared";
import { shouldSaveSetupDraft } from "../features/surveys/setup-steps";
import { editableDraft } from "../features/surveys/JotformFormsCatalog";

const draft: SurveySetupDraft = { siteId: null, type: "LOCAL", instrumentName: "Instrumento", activityName: "Actividad", questions: [] };
describe("estado del borrador del instrumento", () => {
  it("normaliza los valores iniciales y detecta cambios y reversiones", () => {
    const initial = editableDraft(draft);
    expect(editableDraft({ ...draft, programName: "Local", description: "", analysisWeights: [], matrixDefaults: [] })).toBe(initial);
    expect(editableDraft({ ...draft, activityName: "Otra actividad" })).not.toBe(initial);
    expect(editableDraft({ ...draft })).toBe(initial);
  });
  it("guarda al registrar solo si hay cambios, preguntas nuevas o aún no existe el borrador", () => {
    expect(shouldSaveSetupDraft(false, true, [], [])).toBe(false);
    expect(shouldSaveSetupDraft(true, true, [], [])).toBe(true);
    expect(shouldSaveSetupDraft(false, false, [], [])).toBe(true);
    const question = { externalId: "q1", text: "Pregunta", type: "LIKERT" as const };
    expect(shouldSaveSetupDraft(false, true, [question], [])).toBe(true);
  });
});
