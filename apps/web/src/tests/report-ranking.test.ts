import { describe, expect, it } from "vitest";
import type { ReportRow } from "@epi/shared";
import { mostImprovedRows, orderReportRows } from "../features/surveys/report-ranking";
const row = (category: string, change: number | null, subcategory: string | null = null): ReportRow => ({ category, subcategory, pre: 50, post: change === null ? null : 50 + change, change });

describe("comparison ranking", () => {
  it("orders by category and subcategory without mutating the response", () => {
    const rows = [row("B", 20), row("A", 5, "Z"), row("A", 10, "A")];
    expect(orderReportRows(rows, "category").map(r => r.subcategory ?? r.category)).toEqual(["A", "Z", "B"]);
    expect(rows[0]?.category).toBe("B");
  });
  it("places positive changes first, then zero and losses, with missing pairs last", () => {
    const rows = [row("Missing", null), row("Loss", -10), row("Zero", 0), row("Better", 20)];
    expect(orderReportRows(rows, "ranking").map(r => r.category)).toEqual(["Better", "Zero", "Loss", "Missing"]);
  });
  it("shows every tied winner and uses category names to break display ties", () => {
    expect(mostImprovedRows([row("Z", 10), row("A", 10), row("B", 5)]).map(r => r.category)).toEqual(["A", "Z"]);
  });
  it("does not call a loss or unchanged category an improvement", () => {
    expect(mostImprovedRows([row("A", -5), row("B", 0), row("C", null)])).toEqual([]);
    expect(mostImprovedRows([])).toEqual([]);
  });
});
