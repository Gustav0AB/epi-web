import { describe, expect, it } from "vitest";
import { questionCatalogIssue, type CategoryDto, type SurveySetupQuestion } from "@epi/shared";
import { categorySelectionOptions } from "../features/surveys/category-options";
const question = (category = "Learning", subcategory: string | null = "Knowledge"): SurveySetupQuestion => ({ externalId: "q", text: "Question", type: "LIKERT", role: "SCORED", weight: { category, subcategory, maxScore: null, correctAnswer: null } });
const categories: CategoryDto[] = [
  { id: "a", name: "Learning", subcategory: "Knowledge", organizationId: "org", isActive: true },
  { id: "b", name: "Learning", subcategory: "Archived sub", organizationId: "org", isActive: false },
  { id: "c", name: "Archived", subcategory: null, organizationId: "org", isActive: false },
  { id: "d", name: "Foreign", subcategory: null, organizationId: "other", isActive: true },
  { id: "e", name: "Learning", subcategory: "Foreign sub", organizationId: "other", isActive: true },
  { id: "f", name: "Direct category", subcategory: null, organizationId: "org", isActive: true },
];
describe("organization category contract", () => {
  it("accepts current classification before scores are completed without changing strings", () => {
    const row = question(); const before = JSON.stringify(row);
    expect(questionCatalogIssue(row, categories, "org")).toBeNull();
    expect(JSON.stringify(row)).toBe(before);
  });
  it("rejects inactive, missing and foreign categories even if catalog entries were supplied by the client", () => {
    for (const category of ["Archived", "Foreign", "Unknown", ""]) expect(questionCatalogIssue(question(category, null), categories, "org")).toContain("categoría activa");
    expect(questionCatalogIssue(question(), categories, null)).toContain("organización");
  });
  it("rejects subcategories from other categories, organizations or inactive entries", () => {
    for (const subcategory of ["Archived sub", "Foreign sub", "Unknown"]) expect(questionCatalogIssue(question("Learning", subcategory), categories, "org")).toContain("subcategoría activa");
    expect(questionCatalogIssue(question("Direct category", "Knowledge"), categories, "org")).not.toBeNull();
  });
  it("does not impose a new subcategory requirement on direct classifications", () => {
    expect(questionCatalogIssue(question("Direct category", null), categories, "org")).toBeNull();
    expect(questionCatalogIssue(question("Learning", null), categories, "org")).toBeNull();
  });
  it("requires classification only for evaluable non-open questions", () => {
    expect(questionCatalogIssue({ ...question(), weight: null }, categories, "org")).not.toBeNull();
    for (const row of [{ ...question(), role: "EXCLUDED" as const }, { ...question(), role: "INFORMATIONAL" as const }, { ...question(), type: "OPEN_TEXT" as const }]) expect(questionCatalogIssue(row, [], null)).toBeNull();
  });
  it("shows unapproved draft values for review without adding an Other/free-text choice", () => {
    const options = categorySelectionOptions(["Learning"], "Legacy");
    expect(options.find(option => option.value === "Legacy")!.label).toContain("fuera del catálogo activo");
    expect(options.some(option => option.value === "other")).toBe(false);
    expect(categorySelectionOptions(["other"], "other")).toContainEqual({ value: "other", label: "other" });
  });
});
