import type { CategoryDto } from "./schemas/org.schema.js";
import type { SurveySetupQuestion } from "./schemas/survey.schema.js";

import { questionClassification } from "./question-classification.js";

type CatalogEntry = Pick<CategoryDto, "name" | "subcategory" | "organizationId" | "isActive">;
export function questionCatalogIssue(question: SurveySetupQuestion, categories: CatalogEntry[], organizationId: string | null | undefined, requireSubcategory = false): string | null {
  if ((question.role ?? "SCORED") !== "SCORED" || question.type === "OPEN_TEXT") return null;
  if (!organizationId) return "El sitio requiere una organización para seleccionar categorías.";
  const classification = questionClassification(question);
  const category = classification?.category.trim();
  const available = categories.filter(item => item.isActive && item.organizationId === organizationId && item.name === category);
  if (!category || !available.length) return "Selecciona una categoría activa del catálogo de la organización.";
  const subcategory = classification?.subcategory?.trim();
  if (requireSubcategory && !subcategory) return "Selecciona una subcategoría activa; la categoría se obtiene automáticamente.";
  if (subcategory && !available.some(item => item.subcategory === subcategory)) return "Selecciona una subcategoría activa que pertenezca a esa categoría.";
  return null;
}
