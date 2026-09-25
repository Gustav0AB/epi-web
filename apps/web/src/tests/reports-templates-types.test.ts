import { describe, expect, it } from "vitest";
import { getFillableTextFields, missingRequiredReportFields, type ReportTemplate } from "../features/reports/templates/types";

describe("getFillableTextFields", () => {
  it("derives fillable text fields from text blocks with dataKey", () => {
    const template: ReportTemplate = {
      key: "demo",
      title: "Demo",
      category: "test",
      filters: [],
      blocks: [
        { id: "intro", type: "text", title: "Introduccion", dataKey: "introText" },
        { id: "fixed", type: "text", title: "Fijo", content: "Sin captura" },
        { id: "notes", type: "text", dataKey: "notes" },
      ],
    };

    expect(getFillableTextFields(template)).toEqual([
      { key: "introText", label: "Introduccion" },
      { key: "notes", label: "notes" },
    ]);
  });

  it("treats dynamic images as required fillable fields", () => {
    const template: ReportTemplate = {
      key: "demo",
      title: "Demo",
      category: "test",
      filters: [{ key: "school", label: "Escuela", kind: "text", required: true }],
      blocks: [
        { id: "quote", type: "text", title: "Quote", dataKey: "quote" },
        { id: "photo", type: "image", title: "Photo", dataKey: "photoUrl" },
      ],
    };

    expect(getFillableTextFields(template)).toEqual([
      { key: "quote", label: "Quote" },
      { key: "photoUrl", label: "Photo" },
    ]);
    expect(missingRequiredReportFields(template, { kpis: {}, series: {}, tables: {}, texts: { quote: "ok" } }, {})).toEqual([
      "Escuela",
      "Photo",
      "Resultados pre/post",
    ]);
  });
});
