import { describe, expect, it } from "vitest";
import { applyBulkRole } from "../features/surveys/setup-bulk-role";

describe("bulk question roles", () => {
  const questions = [
    { externalId: "a", text: "A", type: "ONE_ANSWER" as const, role: "INFORMATIONAL" as const, isFilter: true, options: ["Sí", "No"] },
    { externalId: "b", text: "B", type: "OPEN_TEXT" as const, role: "INFORMATIONAL" as const, options: [] },
  ];
  it("updates compatible selected questions and leaves open text untouched", () => {
    const result = applyBulkRole(questions, ["a", "b"], "SCORED");
    expect(result.skipped).toBe(1); expect(result.changed).toHaveLength(1);
    expect(result.changed[0]).toMatchObject({ externalId: "a", role: "SCORED", isFilter: false, setupReviewed: false });
    expect(questions[0]!.role).toBe("INFORMATIONAL");
  });
  it("prevents duplicate unique roles and protects unselected questions", () => {
    expect(applyBulkRole(questions, ["a", "b"], "MOMENT").error).toMatch(/una pregunta/);
    expect(applyBulkRole([{ ...questions[0]!, role: "MOMENT" }, questions[1]!], ["b"], "MOMENT").error).toMatch(/una pregunta/);
    expect(applyBulkRole(questions, ["b"], "EXCLUDED").changed.map(item => item.externalId)).toEqual(["b"]);
  });
});
