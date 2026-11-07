import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import {
  apiSuccess,
  apiError,
  CreateOrganizationSchema,
  UpdateOrganizationSchema,
  CreateSiteSchema,
  UpdateSiteSchema,
  CreateCategorySchema,
  UpdateCategorySchema,
  CreateReportTemplateSchema,
  UpdateReportTemplateSchema,
  CreateInstitutionalPositionSchema,
  type CategoryImportResult,
} from "@epi/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { requireAuth, requireRole } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { previewCategoryRows } from "./category-import.js";
import { surveysService } from "../surveys/surveys.service.js";
import { auditService } from "../audit/audit.service.js";
import { allowedSiteIds } from "../../shared/site-scope.js";
import { usersRepository } from "../users/users.repository.js";
import { catalogService } from "./catalog.service.js";

// catalog-fields y report-templates son CRUD simple sin autorización por
// organización: se quedan inline. Organizaciones/sitios/categorías tienen
// guards de borrado y scoping por org_admin → viven en catalog.service.ts.
export const catalogRouter = Router();

type AppError = Error & { statusCode?: number; code?: string };

const wrap =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch((err: unknown) => {
      const e = err as AppError;
      if (e?.statusCode) {
        res.status(e.statusCode).json(apiError(e.code ?? "ERROR", e.message));
        return;
      }
      next(err);
    });

async function previewCategoryImport(csv: string, organizationId: string, db: Pick<Prisma.TransactionClient, "category"> = prisma) {
  const existing = await db.category.findMany({
    where: { organizationId },
    select: { name: true, subcategory: true },
  });
  try {
    return previewCategoryRows(csv, existing);
  } catch (error) {
    throw Object.assign(error instanceof Error ? error : new Error("Invalid CSV"), { statusCode: 400 });
  }
}

// ── Organizaciones ─────────────────────────────────────────────────────

catalogRouter.get(
  "/organizations",
  requireAuth,
  wrap(async (_req, res) => {
    res.json(apiSuccess(await prisma.organization.findMany({ orderBy: { name: "asc" } })));
  })
);

catalogRouter.post(
  "/organizations",
  requireAuth,
  requireRole("system_admin"),
  validate(CreateOrganizationSchema),
  wrap(async (req, res) => {
    const org = await prisma.organization.create({ data: req.body });
    res.status(201).json(apiSuccess(org));
  })
);

catalogRouter.patch(
  "/organizations/:id",
  requireAuth,
  requireRole("system_admin"),
  validate(UpdateOrganizationSchema),
  wrap(async (req, res) => {
    const org = await catalogService.updateOrganization(req.body, req.params.id!);
    res.json(apiSuccess(org));
  })
);

catalogRouter.delete(
  "/organizations/:id",
  requireAuth,
  requireRole("system_admin"),
  wrap(async (req, res) => {
    await catalogService.deleteOrganization(req.params.id!);
    res.status(204).send();
  })
);

// ── Sitios ─────────────────────────────────────────────────────────────

// system_admin ve todos los sitios, o los de una org puntual si manda
// ?organizationId= (ej. al crear un usuario de esa organización); el resto
// siempre ve solo sus sitios asignados, sin importar el query param.
catalogRouter.get(
  "/sites",
  requireAuth,
  wrap(async (req, res) => {
    const where =
      req.user!.role === "system_admin"
        ? req.query.organizationId
          ? { organizationId: req.query.organizationId as string }
          : {}
        : { organizationId: req.user!.organizationId };
    const user = await usersRepository.findById(req.user!.sub);
    if (!user) { res.status(403).json(apiError("FORBIDDEN", "User not found")); return; }
    const siteIds = await allowedSiteIds({ ...user, role: user.role.toLowerCase() });
    res.json(apiSuccess(await prisma.site.findMany({
      where: { ...where, ...(siteIds !== undefined ? { id: { in: siteIds } } : {}) },
      orderBy: { name: "asc" },
    })));
  })
);

catalogRouter.post(
  "/sites",
  requireAuth,
  requireRole("system_admin", "org_admin"),
  validate(CreateSiteSchema),
  wrap(async (req, res) => {
    const site = await catalogService.createSite(req.user!, req.body);
    res.status(201).json(apiSuccess(site));
  })
);

catalogRouter.patch(
  "/sites/:id",
  requireAuth,
  requireRole("system_admin", "org_admin"),
  validate(UpdateSiteSchema),
  wrap(async (req, res) => {
    const site = await catalogService.updateSite(req.user!, req.params.id!, req.body);
    res.json(apiSuccess(site));
  })
);

catalogRouter.delete(
  "/sites/:id",
  requireAuth,
  requireRole("system_admin", "org_admin"),
  wrap(async (req, res) => {
    await catalogService.deleteSite(req.user!, req.params.id!);
    res.status(204).send();
  })
);

// ── Categorías / subcategorías (catálogo por CSV o alta individual) ────

// system_admin ve el catálogo completo (todas las organizaciones); el resto
// solo el de su propia organización — mismo patrón que /sites.
catalogRouter.get(
  "/categories",
  requireAuth,
  wrap(async (req, res) => {
    const where =
      req.user!.role === "system_admin"
        ? req.query.organizationId
          ? { organizationId: req.query.organizationId as string }
          : {}
        : { organizationId: req.user!.organizationId! };
    res.json(
      apiSuccess(
        await prisma.category.findMany({ where, orderBy: [{ name: "asc" }, { subcategory: "asc" }] })
      )
    );
  })
);

catalogRouter.post(
  "/categories",
  requireAuth,
  requireRole("system_admin", "org_admin"),
  validate(CreateCategorySchema),
  wrap(async (req, res) => {
    const category = await catalogService.createCategory(req.user!, req.body);
    res.status(201).json(apiSuccess(category));
  })
);

catalogRouter.patch(
  "/categories/:id",
  requireAuth,
  requireRole("system_admin", "org_admin"),
  validate(UpdateCategorySchema),
  wrap(async (req, res) => {
    const category = await catalogService.updateCategory(req.user!, req.params.id!, req.body);
    res.json(apiSuccess(category));
  })
);

catalogRouter.delete(
  "/categories/:id",
  requireAuth,
  requireRole("system_admin", "org_admin"),
  wrap(async (req, res) => {
    await catalogService.deleteCategory(req.user!, req.params.id!);
    res.status(204).send();
  })
);

// La importación de categorías es aditiva: los duplicados se reportan y nunca
// se eliminan ni se desactivan categorías existentes.
catalogRouter.post(
  "/categories/import/preview",
  requireAuth,
  requireRole("system_admin", "org_admin"),
  wrap(async (req, res) => {
    const csv = typeof req.body === "string" ? req.body : "";
    if (!csv.trim()) {
      res.status(400).json(apiError("BAD_REQUEST", "CSV vacío o Content-Type no es text/csv"));
      return;
    }
    const organizationId = catalogService.resolveCategoryImportOrg(
      req.user!,
      req.query.organizationId as string | undefined
    );
    res.json(apiSuccess(await previewCategoryImport(csv, organizationId)));
  })
);

catalogRouter.post(
  "/categories/import",
  requireAuth,
  requireRole("system_admin", "org_admin"),
  wrap(async (req, res) => {
    const csv = typeof req.body === "string" ? req.body : "";
    if (!csv.trim()) {
      res.status(400).json(apiError("BAD_REQUEST", "CSV vacío o Content-Type no es text/csv"));
      return;
    }
    const organizationId = catalogService.resolveCategoryImportOrg(
      req.user!,
      req.query.organizationId as string | undefined
    );
    const result = await prisma.$transaction(async (tx) => {
      const preview = await previewCategoryImport(csv, organizationId, tx);
      const result: CategoryImportResult = {
        applied: 0,
        skipped: preview.duplicates.length + preview.errors.length,
        duplicates: preview.duplicates.length,
        errors: preview.errors,
      };
      for (const item of preview.additions) {
        await tx.category.create({ data: { name: item.category, subcategory: item.subcategory, organizationId } });
        result.applied++;
      }
      return result;
    }, { isolationLevel: "Serializable" }).catch((error: unknown) => {
      if (typeof error === "object" && error !== null && "code" in error && (error.code === "P2034" || error.code === "P2002")) {
        throw Object.assign(new Error("Category catalog changed; preview and retry the import"), { statusCode: 409 });
      }
      throw error;
    });
    await auditService.record(
      req.user!,
      "CATEGORY_IMPORT",
      { type: "Organization", id: organizationId },
      { applied: result.applied, skipped: result.skipped, duplicates: result.duplicates }
    );
    res.json(apiSuccess(result));
  })
);

// ── Campos de catálogo derivados de encuestas (CATALOG_DATA) ───────────
// Solo lectura acá: se llenan al registrar/sincronizar encuestas de Jotform
// (ver surveys.service.ts#registerDefinition / previewFormQuestions).

catalogRouter.get(
  "/catalog-fields",
  requireAuth,
  wrap(async (_req, res) => {
    res.json(apiSuccess(await surveysService.listCatalogFields()));
  })
);

// ── Plantillas de reporte (catálogo de permisos para report_viewer) ────

catalogRouter.get(
  "/report-templates",
  requireAuth,
  wrap(async (_req, res) => {
    res.json(apiSuccess(await prisma.reportTemplate.findMany({ orderBy: { name: "asc" } })));
  })
);

catalogRouter.post(
  "/report-templates",
  requireAuth,
  requireRole("system_admin"),
  validate(CreateReportTemplateSchema),
  wrap(async (req, res) => {
    const template = await prisma.reportTemplate.create({ data: req.body });
    res.status(201).json(apiSuccess(template));
  })
);

catalogRouter.patch(
  "/report-templates/:id",
  requireAuth,
  requireRole("system_admin"),
  validate(UpdateReportTemplateSchema),
  wrap(async (req, res) => {
    const template = await prisma.reportTemplate.update({ where: { id: req.params.id! }, data: req.body });
    res.json(apiSuccess(template));
  })
);

catalogRouter.delete(
  "/report-templates/:id",
  requireAuth,
  requireRole("system_admin"),
  wrap(async (req, res) => {
    await prisma.reportTemplate.delete({ where: { id: req.params.id! } });
    res.status(204).send();
  })
);

// ── Cargos institucionales (sugerencias del dropdown al crear un usuario) ─
// Sin scoping por organización: es un catálogo global compartido, igual que
// report-templates. Solo alta (no hay edición/borrado — un cargo agregado
// por error simplemente no se vuelve a elegir).

catalogRouter.get(
  "/institutional-positions",
  requireAuth,
  wrap(async (_req, res) => {
    res.json(apiSuccess(await prisma.institutionalPosition.findMany({ orderBy: { name: "asc" } })));
  })
);

catalogRouter.post(
  "/institutional-positions",
  requireAuth,
  requireRole("system_admin", "org_admin"),
  validate(CreateInstitutionalPositionSchema),
  wrap(async (req, res) => {
    const position = await prisma.institutionalPosition.upsert({
      where: { name: req.body.name },
      create: { name: req.body.name },
      update: {},
    });
    res.status(201).json(apiSuccess(position));
  })
);
