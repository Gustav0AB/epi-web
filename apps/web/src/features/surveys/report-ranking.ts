import type { ReportRow } from "@epi/shared";

export function orderReportRows(rows: ReportRow[], order: "category" | "ranking"): ReportRow[] {
  return [...rows].sort((a, b) => {
    if (order === "ranking" && a.change !== b.change) {
      if (a.change === null) return 1;
      if (b.change === null) return -1;
      return b.change - a.change;
    }
    return a.category.localeCompare(b.category) || (a.subcategory ?? "").localeCompare(b.subcategory ?? "");
  });
}

export function mostImprovedRows(rows: ReportRow[]): ReportRow[] {
  const ranked = orderReportRows(rows, "ranking");
  const best = ranked[0]?.change;
  return best !== null && best !== undefined && best > 0 ? ranked.filter((r) => r.change === best) : [];
}
