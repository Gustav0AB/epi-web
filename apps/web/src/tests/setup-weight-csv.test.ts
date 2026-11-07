import { describe, expect, it } from "vitest";
import type { SurveySetupQuestion } from "@epi/shared";
import { applySetupWeightRows, previewSetupWeights } from "../features/surveys/setup-weight-csv";

const questions: (SurveySetupQuestion & { options: string[] })[] = [
  { externalId: "scale", text: "Edited scale", type: "LIKERT", options: [] },
  { externalId: "choice", text: "Choice", type: "ONE_ANSWER", options: ["Yes", "No"] },
  { externalId: "info", text: "Info", type: "FREQUENCY", role: "INFORMATIONAL", options: [] },
  { externalId: "open", text: "Open", type: "OPEN_TEXT", options: [] },
];
const header = "externalId,category,subcategory,maxScore,correctAnswer\n";

describe("setup weight CSV", () => {
  it("previews valid weights including quoted categories without mutating questions", () => {
    const before = JSON.stringify(questions);
    const rows = previewSetupWeights(header + 'scale,"Learning, science",Ecology,5,\nchoice,Learning,,2,Yes', questions);
    expect(rows.map(row => row.error)).toEqual([null, null]);
    expect(rows[0]?.weight).toEqual({ category: "Learning, science", subcategory: "Ecology", maxScore: 5, correctAnswer: null });
    expect(JSON.stringify(questions)).toBe(before);
  });
  it("rejects every duplicate row instead of taking the last weight", () => {
    const rows = previewSetupWeights(header + "scale,A,,1,\nscale,B,,2,", questions);
    expect(rows.map(row => row.error)).toEqual(["duplicate", "duplicate"]);
    expect(rows.every(row => row.weight === null)).toBe(true);
  });
  it("reports invalid roles, IDs, weights and answers per row", () => {
    const rows = previewSetupWeights(header + "missing,A,,1,\ninfo,A,,1,\nopen,A,,1,\nscale,A,,Infinity,\nchoice,A,,1,Other", questions);
    expect(rows.map(row => row.error)).toEqual(["unknown", "notScored", "notScored", "invalidWeight", "invalidAnswer"]);
  });
  it("requires headers, valid quoting and consistent columns", () => {
    for (const csv of ["", "category,maxScore\nA,2", header + 'scale,"A,,1,', header + "scale,A,1", "externalId,category,maxScore,maxScore\nscale,A,1,2"]) {
      expect(() => previewSetupWeights(csv, questions)).toThrow();
    }
  });
  it("accepts BOM and optional columns and refuses oversized row sets", () => {
    expect(previewSetupWeights("\uFEFFexternalId,category,maxScore\r\nscale,A,0", questions)[0]?.weight?.maxScore).toBe(0);
    expect(() => previewSetupWeights(header + Array.from({ length: 501 }, () => "scale,A,,1,").join("\n"), questions)).toThrow();
  });
  it("applies only approved weights and preserves other edits", () => {
    const other: SurveySetupQuestion = { ...questions[2]!, text: "Preserved info" };
    const before: SurveySetupQuestion[] = [{ ...questions[0]!, weight: { category: "Old", subcategory: null, maxScore: 1, correctAnswer: null } }, other];
    const approved = previewSetupWeights(header + "scale,New,,5,\nmissing,Ignore,,1,", questions).flatMap(row => row.weight ? [{ externalId: row.externalId, weight: row.weight }] : []);
    const result = applySetupWeightRows(before, questions, approved);
    expect(result.find(question => question.externalId === "scale")).toMatchObject({ text: "Edited scale", type: "LIKERT", weight: { category: "New", maxScore: 5 } });
    expect(result.find(question => question.externalId === "info")).toEqual(other);
    expect(result).toHaveLength(2);
    expect(before[0]?.weight?.category).toBe("Old");
  });
});

it("preserves the configured factor when importing an older CSV without that column", () => {
  const target = { ...questions[0]!, weight: { category: "Old", subcategory: null, maxScore: 5, correctAnswer: null, factor: 4 } };
  const rows = previewSetupWeights(header + "scale,New,,3,", [target]);
  const applied = applySetupWeightRows([target], [target], rows.flatMap(row => row.weight ? [{ externalId: row.externalId, weight: row.weight }] : []));
  expect(applied[0]?.weight).toMatchObject({ category: "New", maxScore: 3, factor: 4 });
});
