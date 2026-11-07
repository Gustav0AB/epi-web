import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QuestionVisibilityRules } from "../features/surveys/QuestionVisibilityRules";

it("explains a conditional question using its source label and configured moment", () => {
  const markup = renderToStaticMarkup(<QuestionVisibilityRules visibility={{ hidden: true, rules: [{ id: "rule", link: "All", action: "show", terms: [{ field: "when", operator: "equals", value: "After" }], raw: "original" }] }} questions={[{ externalId: "when", text: "Momento de aplicación", role: "MOMENT", momentMappings: [{ value: "After", moment: "POST" }] }]} />);
  expect(markup).toContain("Oculta inicialmente");
  expect(markup).toContain("Momento de aplicación");
  expect(markup).toContain("momento POST");
  expect(markup).not.toContain("<details>");
  expect(markup).not.toContain("Ver regla original");
  expect(markup).not.toContain("original");
});

it("marks a hidden question without conditions without guessing a moment", () => {
  const markup = renderToStaticMarkup(<QuestionVisibilityRules visibility={{ hidden: true, rules: [] }} questions={[]} />);
  expect(markup).toContain("No hay una regla de aparición interpretable");
  expect(markup).not.toContain("momento POST");
});
