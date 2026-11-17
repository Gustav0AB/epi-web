import { z } from "zod";

// ── Organizaciones y sitios (solo admin los administra) ────────────────

export const CreateOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(100),
});
export type CreateOrganizationDto = z.infer<typeof CreateOrganizationSchema>;

export const UpdateOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateOrganizationDto = z.infer<typeof UpdateOrganizationSchema>;

export type OrganizationDto = {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
};

const SiteNamesSchema = z.array(z.string().trim().min(1).max(100)).max(100).refine(
  names => new Set(names.map(name => name.toLowerCase())).size === names.length, "No se permiten nombres duplicados",
);
export const CreateSiteSchema = z.object({
  programs: SiteNamesSchema.refine(names => names.includes("Otro"), "Incluye el programa Otro").optional(),
  activityTypes: SiteNamesSchema.optional(),
  activities: SiteNamesSchema.optional(),
  name: z.string().trim().min(2).max(100),
  organizationId: z.string().uuid().nullable().optional(),
});
export type CreateSiteDto = z.infer<typeof CreateSiteSchema>;

export const UpdateSiteSchema = z.object({
  programs: SiteNamesSchema.refine(names => names.includes("Otro"), "Incluye el programa Otro").optional(),
  activityTypes: SiteNamesSchema.optional(),
  activities: SiteNamesSchema.optional(),
  name: z.string().trim().min(2).max(100).optional(),
  organizationId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateSiteDto = z.infer<typeof UpdateSiteSchema>;

export type SiteDto = {
  programs?: string[];
  activityTypes?: string[];
  activities?: string[];
  id: string;
  name: string;
  organizationId: string | null;
  isActive: boolean;
};

// ── Catálogo de categorías/subcategorías (CSV) ─────────────────────────

// Columnas del CSV: la categoría se repite por cada subcategoría.
export const CATEGORY_CSV_COLUMNS = ["category", "subcategory"] as const;

export const CreateCategorySchema = z.object({
  name: z.string().trim().min(1).max(100),
  subcategory: z.string().trim().min(1).max(100).nullable().optional(),
  organizationId: z.string().uuid().optional(), // opcional: org_admin usa la suya, system_admin debe indicarla
});
export type CreateCategoryDto = z.infer<typeof CreateCategorySchema>;

export const UpdateCategorySchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  subcategory: z.string().trim().min(1).max(100).nullable().optional(),
  organizationId: z.string().uuid().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateCategoryDto = z.infer<typeof UpdateCategorySchema>;

export type CategoryDto = {
  id: string;
  name: string;
  subcategory: string | null;
  isActive: boolean;
  organizationId: string;
  siteIds?: string[];
};

export type CategoryImportResult = {
  applied: number;
  skipped: number;
  duplicates: number;
  errors: { row: number; message: string }[];
};

export type CategoryImportPreview = {
  additions: { row: number; category: string; subcategory: string | null }[];
  duplicates: { row: number; category: string; subcategory: string | null }[];
  errors: { row: number; message: string }[];
};

// ── Catálogo de cargos institucionales (sugerencias del dropdown) ──────

export const CreateInstitutionalPositionSchema = z.object({
  name: z.string().trim().min(1).max(100),
});
export type CreateInstitutionalPositionDto = z.infer<typeof CreateInstitutionalPositionSchema>;

export type InstitutionalPositionDto = {
  id: string;
  name: string;
};
