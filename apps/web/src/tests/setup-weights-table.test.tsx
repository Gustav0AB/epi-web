import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WeightInputSchema } from "@epi/shared";
import { questionInfluence, SetupWeightsTable } from "../features/surveys/SetupWeightsTable";

const question = (id: string, factor = 1, subcategory: string | null = "Biodiversity") => ({ externalId: id, text: `Question ${id}`, type: "LIKERT" as const, options: [], weight: { category: "Knowledge", subcategory, maxScore: 5, correctAnswer: null, factor } });

describe("weight configuration table", () => {
  it("computes influence within each category/subcategory and ignores non-scored questions", () => {
    const rows = [question("a", 1), question("b", 3), question("c", 2), question("direct", 1, null), { ...question("excluded", 10), role: "EXCLUDED" as const }];
    expect(questionInfluence(rows[0]!, rows)).toBeCloseTo(16.6667);
    expect(questionInfluence(rows[1]!, rows)).toBe(50);
    expect(questionInfluence(rows[3]!, rows)).toBe(100);
    expect(questionInfluence(rows[4]!, rows)).toBeNull();
    expect(questionInfluence({ ...rows[0]!, weight: { ...rows[0]!.weight, category: "" } }, rows)).toBeNull();
  });
  it("defaults legacy factors to one and refuses to display an invalid distribution", () => {
    const legacy = { ...question("legacy"), weight: { category: "Knowledge", subcategory: "Biodiversity", maxScore: 5, correctAnswer: null } };
    expect(questionInfluence(legacy, [legacy, question("other")])).toBe(50);
    expect(questionInfluence(legacy, [legacy, question("bad", 0)])).toBeNull();
    for (const factor of [0, 11, 1.5, Infinity, true, null]) expect(WeightInputSchema.safeParse({ ...legacy.weight, factor }).success).toBe(false);
    expect(WeightInputSchema.parse({ ...legacy.weight, factor: "3" }).factor).toBe(3);
  });
  it("renders ten editable rows with expandable text and no technical IDs", () => {
    const rows = Array.from({ length: 11 }, (_, i) => question(`technical-${i}`));
    const markup = renderToStaticMarkup(<SetupWeightsTable questions={rows} onChange={() => {}} />);
    expect((markup.match(/<details/g) ?? [])).toHaveLength(10);
    const tables = [...markup.matchAll(/<table\b[\s\S]*?<\/table>/g)];
    const questionTable = tables[tables.length - 1]?.[0] ?? "";
    expect((questionTable.match(/<th /g) ?? [])).toHaveLength(7);
    expect(markup).toContain("truncate");
    expect(markup).toContain("9.1%");
    expect(markup).not.toContain("Question technical-10");
    expect(questionTable).toContain("Máximo de escala");
    expect(questionTable).not.toContain('max="10"');
  });
});

it("hides IAA for CQS/follow-up without hiding the question and subcategory configuration", () => {
  const markup = renderToStaticMarkup(<SetupWeightsTable includeIaa={false} questions={[question("a")]} onChange={() => {}} />);
  expect(markup).not.toContain("Peso IAA");
  expect(markup).not.toContain("Total IAA");
  expect(markup).toContain("Peso de subcategorías");
  expect(markup).toContain("Puntuación de preguntas");
  expect(markup).toContain("pendiente de aprobación");
});

it("shows provisional per-question maxima and subcategory weights in the paginated question table", () => {
  const questions = [question("a"), question("b"), question("c", 1, "Conservation")];
  const markup = renderToStaticMarkup(<SetupWeightsTable questions={questions} categoryWeights={[{ category: "Knowledge", weight: 100 }]} subcategoryWeights={[{ category: "Knowledge", subcategory: "Biodiversity", weight: 60 }, { category: "Knowledge", subcategory: "Conservation", weight: 40 }]} onChange={() => {}} />);
  const tables = [...markup.matchAll(/<table\b[\s\S]*?<\/table>/g)];
  const questionTable = tables[tables.length - 1]?.[0] ?? "";
  expect(questionTable).toContain("Máximo calculado (provisional)");
  expect(questionTable).toContain("Peso de subcategoría");
  expect(questionTable).toContain("0.9000");
  expect(questionTable).toContain("1.2000");
  expect(questionTable).toContain("60%");
  expect(questionTable).toContain("40%");
});
