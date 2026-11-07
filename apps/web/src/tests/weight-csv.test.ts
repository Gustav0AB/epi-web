import { describe, expect, it } from "vitest";
import { csvCell, parseCsv, type SurveySetupQuestion } from "@epi/shared";
import { exportWeightCsv } from "../features/surveys/weight-csv";
import { previewSetupWeights } from "../features/surveys/setup-weight-csv";

describe("weight CSV round trip", () => {
  it("preserves identifiers, escaped text, weights and correct answers", () => {
    const question = {
      externalId: 'id,"1"', text: 'Question, "quoted"\nsecond line', type: "ONE_ANSWER" as const,
      options: ['Yes, "indeed"'], weight: { category: "Ocean, life", subcategory: "Skills", factor: 3, maxScore: 0, correctAnswer: 'Yes, "indeed"' },
    };
    const csv = exportWeightCsv([question]);
    expect(parseCsv(csv, { strict: true })[0]?.text).toBe(question.text);
    expect(previewSetupWeights(csv, [question])).toEqual([{ row: 2, externalId: question.externalId, weight: question.weight, error: null }]);
  });
  it("exports partial drafts and only scored questions, preserving saved zero", () => {
    const base: SurveySetupQuestion = { externalId: "1", text: "Scale", type: "LIKERT" };
    const csv = exportWeightCsv([
      base,
      { ...base, externalId: "2", weight: { category: "", maxScore: null, subcategory: null, correctAnswer: null } },
      { ...base, externalId: "3", weight: { category: "Saved", maxScore: 0, subcategory: null, correctAnswer: null } },
      { ...base, role: "INFORMATIONAL" }, { ...base, role: "FILTER" }, { ...base, type: "OPEN_TEXT" },
    ], 5);
    expect(parseCsv(csv).map((row) => row.maxScore)).toEqual(["5", "5", "0"]);
    expect(parseCsv(exportWeightCsv([base]))[0]?.maxScore).toBe("");
  });
  it("quotes carriage returns and doubles quotes for category exports too", () => {
    expect(csvCell('a\rb')).toBe('"a\rb"');
    expect(csvCell('a"b')).toBe('"a""b"');
    expect(parseCsv(`category,subcategory\n${csvCell('Ocean, life')},${csvCell('A"B')}`, { strict: true })).toEqual([{ category: "Ocean, life", subcategory: 'A"B' }]);
  });
});
