import { describe, expect, it } from "vitest";
import type { SurveySetupQuestion } from "@epi/shared";
import { applyBulkEdits } from "../features/surveys/setup-bulk-edit";
const input = [
  { externalId: "a", text: "A", type: "ONE_ANSWER" as const, role: "SCORED" as const, options: ["Sí", "No"] },
  { externalId: "b", text: "B", type: "OPEN_TEXT" as const, role: "INFORMATIONAL" as const, options: [] },
  { externalId: "c", text: "C", type: "ONE_ANSWER" as const, role: "INFORMATIONAL" as const, options: ["Sí", "No"] },
];
const issue = (q: SurveySetupQuestion) => q.role === "SCORED" && !("classification" in q && q.classification) ? "Falta categoría" : null;
describe("edición masiva de preguntas", () => {
  it("aplica categoría y revisión solo a preguntas compatibles, sin cambiar las demás", () => {
    const before = JSON.stringify(input);
    const result = applyBulkEdits(input, ["a", "b"], { classification: { category: "A", subcategory: "B" }, review: "reviewed" }, issue);
    expect(result.changed).toHaveLength(1); expect(result.changed[0]).toMatchObject({ externalId: "a", setupReviewed: true });
    expect(result.skipped).toBe(1); expect(JSON.stringify(input)).toBe(before);
  });
  it("mantiene pendientes los campos incompletos y permite marcar pendiente explícitamente", () => {
    expect(applyBulkEdits(input, ["a"], { review: "reviewed" }, issue).changed[0]?.setupReviewed).toBe(false);
    expect(applyBulkEdits(input, ["c"], { review: "pending" }, issue).changed[0]?.setupReviewed).toBe(false);
  });
  it("rechaza roles únicos repetidos sin cambios parciales", () => {
    const result = applyBulkEdits(input, ["a", "c"], { role: "MOMENT" }, issue);
    expect(result.error).toMatch(/una pregunta/); expect(result.changed).toEqual([]);
  });
});
