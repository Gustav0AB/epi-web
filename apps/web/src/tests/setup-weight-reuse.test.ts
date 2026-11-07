import { describe, expect, it } from "vitest";
import type { QuestionWithWeight, SurveySetupQuestion } from "@epi/shared";
import { previewReusedWeights } from "../features/surveys/setup-weight-reuse";
import { applySetupWeightRows } from "../features/surveys/setup-weight-csv";

const target: SurveySetupQuestion & { options: string[] } = { externalId: "new_id", text: "How much did you learn?", type: "LIKERT", options: ["1", "2", "3"] };
const source: QuestionWithWeight = { id: "old-question", externalId: "old_id", text: " HOW MUCH  did you learn? ", type: "LIKERT", role: "SCORED", options: ["3", "1", "2"], answers: [], weight: { category: "Learning", subcategory: "Science", maxScore: 3, correctAnswer: null } };

describe("reuse setup weights", () => {
  it("matches text/type/options across different IDs without mutating either question", () => {
    const snapshot = JSON.stringify([target, source]);
    const rows = previewReusedWeights([target], [source]);
    expect(rows[0]).toMatchObject({ externalId: "new_id", sourceId: "old_id", status: "ready", weight: source.weight });
    expect(JSON.stringify([target, source])).toBe(snapshot);
  });
  it("requires compatible text, type and complete options", () => {
    for (const changed of [{ ...source, text: "Different question" }, { ...source, type: "FREQUENCY" }, { ...source, options: ["1", "2"] }]) {
      expect(previewReusedWeights([target], [changed])[0]?.status).toBe("unmatched");
    }
  });
  it("does not choose between duplicate matches even when weights agree", () => {
    expect(previewReusedWeights([target], [source, { ...source, id: "second", externalId: "second" }])[0]).toMatchObject({ status: "ambiguous", weight: null });
  });
  it("preserves complete or partial weights already in the draft", () => {
    for (const weight of [source.weight!, { category: "", subcategory: null, maxScore: 2, correctAnswer: null }]) {
      expect(previewReusedWeights([{ ...target, weight }], [source])[0]).toMatchObject({ status: "existing", weight: null });
    }
  });
  it("offers reuse when only the question classification has been configured", () => {
    const classified = { ...target, weight: { category: "Learning", subcategory: "Science", maxScore: null, correctAnswer: null } };
    expect(previewReusedWeights([classified], [source])[0]).toMatchObject({ status: "ready", weight: source.weight });
    expect(classified.weight.maxScore).toBeNull();
  });
  it("excludes non-scored fields and sources without weights", () => {
    expect(previewReusedWeights([{ ...target, role: "IDENTIFIER" }, { ...target, type: "OPEN_TEXT" }], [source])).toEqual([]);
    expect(previewReusedWeights([target], [{ ...source, role: "INFORMATIONAL" }])[0]?.status).toBe("unmatched");
    expect(previewReusedWeights([target], [{ ...source, weight: null }])[0]?.status).toBe("unmatched");
  });
  it("rejects invalid scores and correct answers", () => {
    expect(previewReusedWeights([target], [{ ...source, weight: { ...source.weight!, maxScore: Infinity } }])[0]?.status).toBe("invalid");
    const choice = { ...target, type: "ONE_ANSWER" as const };
    expect(previewReusedWeights([choice], [{ ...source, type: "ONE_ANSWER", weight: { ...source.weight!, correctAnswer: "missing" } }])[0]?.status).toBe("invalid");
  });
  it("applies the selected source weight while preserving target configuration", () => {
    const ready = previewReusedWeights([target], [source]).flatMap((row) => row.weight ? [{ externalId: row.externalId, weight: row.weight }] : []);
    const applied = applySetupWeightRows([], [target], ready);
    expect(applied).toEqual([{ ...target, weight: source.weight }]);
    expect(previewReusedWeights(applied.map((question) => ({ ...question, options: target.options })), [source])[0]?.status).toBe("existing");
  });
});
