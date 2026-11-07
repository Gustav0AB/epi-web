import { CreateCategorySchema, parseCsv, type CategoryImportPreview } from "@epi/shared";

export function previewCategoryRows(csv: string, existing: { name: string; subcategory: string | null }[]): CategoryImportPreview {
  const seen = new Set(existing.map((c) => JSON.stringify([c.name, c.subcategory])));
  const preview: CategoryImportPreview = {
    additions: [],
    duplicates: [],
    errors: [],
  };

  for (const [i, row] of parseCsv(csv, { strict: true, requiredHeaders: ["category", "subcategory"] }).entries()) {
    const category = (row.category ?? "").trim();
    const subcategory = (row.subcategory ?? "").trim() || null;
    if (!CreateCategorySchema.safeParse({ name: category, subcategory }).success) {
      preview.errors.push({ row: i + 2, message: "Invalid category/subcategory (required category, maximum 100 characters)" });
      continue;
    }
    const key = JSON.stringify([category, subcategory]);
    const item = { row: i + 2, category, subcategory };
    if (seen.has(key)) preview.duplicates.push(item);
    else {
      seen.add(key);
      preview.additions.push(item);
    }
  }
  return preview;
}
