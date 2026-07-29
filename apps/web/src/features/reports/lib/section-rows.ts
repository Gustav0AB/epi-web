import type { ReportRow } from "@epi/shared";

// Misma regla en la tarjeta interactiva y en el PDF: selectedCategories
// vacío = todas.
export function filterSectionRows(rows: ReportRow[], selectedCategories: string[]): ReportRow[] {
  return selectedCategories.length === 0 ? rows : rows.filter((r) => selectedCategories.includes(r.category));
}
