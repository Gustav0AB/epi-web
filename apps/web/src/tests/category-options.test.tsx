import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CategoryDto } from "@epi/shared";
import { categoryOptions } from "../features/surveys/category-options";
import { CatalogNameField } from "../shared/components/CatalogNameField";

const row = (id: string, name: string, subcategory: string | null, organizationId = "a", isActive = true): CategoryDto => ({ id, name, subcategory, organizationId, isActive });
const rows = [row("1", "Learning", "Science"), row("2", "Learning", "Art"), row("3", "Learning", "Science"), row("4", "Context", null), row("5", "Archived", "Old", "a", false), row("6", "Foreign", "Secret", "b")];

describe("category choices", () => {
  it("limits choices to active categories of the selected organization", () => {
    const options = categoryOptions(rows, "a");
    expect(options.categoryNames).toEqual(["Context", "Learning"]);
    expect(options.subcategoriesByCategory.get("Learning")).toEqual(["Art", "Science"]);
    expect(options.subcategoriesByCategory.get("Context")).toEqual([]);
  });
  it("does not reuse another organization's choices when changing sites", () => {
    expect(categoryOptions(rows, "b").categoryNames).toEqual(["Foreign"]);
    expect(categoryOptions(rows, null).categoryNames).toEqual([]);
    expect(categoryOptions(rows, undefined).subcategoriesByCategory.size).toBe(0);
  });
  it("preserves a manual or archived value as editable text", () => {
    const html = renderToStaticMarkup(createElement(CatalogNameField, { label: "Category", value: "Legacy category", options: ["Learning"], onChange: () => {} }));
    expect(html).toContain('value="Legacy category"');
    expect(html).toContain('value="other" selected=""');
  });
  it("selects catalog names even when they match the Other sentinel", () => {
    const html = renderToStaticMarkup(createElement(CatalogNameField, { label: "Category", value: "other", options: ["other"], onChange: () => {} }));
    expect(html).toContain('value="option:other" selected=""');
    expect(html).not.toContain('<input');
  });
  it("gives repeated category labels separate accessible controls", () => {
    const field = () => createElement(CatalogNameField, { label: "Category", value: "", options: [], onChange: () => {} });
    const html = renderToStaticMarkup(createElement(Fragment, null, field(), field()));
    const ids = [...html.matchAll(/<select id="([^"]+)"/g)].map((match) => match[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) expect(html).toContain(`for="${id}"`);
  });
});
