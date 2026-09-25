import { describe, expect, it } from "vitest";
import { filterSectionRows } from "../features/reports/lib/section-rows";

const rows = [
  { category: "Asistencia", subcategory: "General", pre: 70, post: 80, change: 10 },
  { category: "Finanzas", subcategory: "General", pre: 60, post: 75, change: 15 },
];

describe("filterSectionRows", () => {
  it("returns all rows when no category is selected", () => {
    expect(filterSectionRows(rows, [])).toBe(rows);
  });

  it("keeps only selected categories", () => {
    expect(filterSectionRows(rows, ["Finanzas"])).toEqual([rows[1]]);
  });
});
