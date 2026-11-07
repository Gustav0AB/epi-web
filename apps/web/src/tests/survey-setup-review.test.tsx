import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { matchesReviewRole, SurveySetupReview } from "../features/surveys/SurveySetupReview";

const question = { externalId: "q", text: "Una pregunta evaluable con texto extenso", type: "ONE_ANSWER" as const, options: ["Una respuesta larga", "Otra respuesta"] };

describe("instrument final review", () => {
  it("filters evaluables, context roles and both forms of filter without conflating them", () => {
    const filter = { ...question, role: "INFORMATIONAL" as const, isFilter: true };
    expect(matchesReviewRole(question, "SCORED")).toBe(true);
    expect(matchesReviewRole(filter, "SCORED")).toBe(false);
    expect(matchesReviewRole(filter, "INFORMATIONAL")).toBe(true);
    expect(matchesReviewRole(filter, "FILTER")).toBe(true);
    expect(matchesReviewRole({ ...question, role: "FILTER" }, "FILTER")).toBe(true);
    expect(matchesReviewRole({ ...question, type: "OPEN_TEXT" }, "SCORED")).toBe(false);
  });

  it("places long answers and moment mappings inside a collapsed disclosure", () => {
    const html = renderToStaticMarkup(<SurveySetupReview quality={false} questions={[
      { ...question, role: "MOMENT", momentMappings: [{ value: question.options[0]!, moment: "PRE" }] },
      { ...question, externalId: "matrix", text: "Contenedor técnico", sourceContext: { matrixParent: true } },
    ]} />);
    expect(html).toContain("Filtrar revisión por rol");
    expect(html).toContain("2 opciones</summary>");
    expect(html).toContain("Una respuesta larga → Pre");
    expect(html).not.toContain("Contenedor técnico");
  });
});
