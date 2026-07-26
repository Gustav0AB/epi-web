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
import { prisma } from "../../db/prisma.js";
import { requireAuth, requireRole } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { parseCsv } from "../surveys/csv.js";
import { surveysService } from "../surveys/surveys.service.js";
import { auditService } from "../audit/audit.service.js";
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
// siempre ve solo los de su propia organización, sin importar el query param.
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
    res.json(apiSuccess(await prisma.site.findMany({ where, orderBy: { name: "asc" } })));
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

// El CSV es la fuente de verdad del catálogo de UNA organización: importarlo
// reemplaza completo solo ese catálogo, no el de las demás. org_admin siempre
// importa a la suya; system_admin debe indicar ?organizationId=.
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
    const rows = parseCsv(csv);
    const result: CategoryImportResult = { applied: 0, skipped: 0, errors: [] };
    const seen = new Set<string>();
    const data: { name: string; subcategory: string | null; organizationId: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const name = (rows[i]!.category ?? "").trim();
      const subcategory = (rows[i]!.subcategory ?? "").trim() || null;
      if (!name) {
        result.errors.push({ row: i + 2, message: "category vacío" });
        continue;
      }
      const key = `${name}||${subcategory ?? ""}`;
      if (seen.has(key)) continue; // duplicado en el archivo → se ignora
      seen.add(key);
      data.push({ name, subcategory, organizationId });
    }

    // Reemplazo fantasma: desactiva todo lo previo de esta organización y
    // luego reactiva/crea lo que trae el CSV — nunca se borra una fila real.
    // findFirst (no upsert por clave compuesta): Postgres no trata dos NULL
    // como iguales para unicidad, así que subcategory=null no es una clave
    // de upsert válida — se busca y se decide a mano.
    await prisma.$transaction(async (tx) => {
      await tx.category.updateMany({ where: { organizationId }, data: { isActive: false } });
      for (const d of data) {
        const existing = await tx.category.findFirst({
          where: { organizationId: d.organizationId, name: d.name, subcategory: d.subcategory },
        });
        if (existing) {
          await tx.category.update({ where: { id: existing.id }, data: { isActive: true } });
        } else {
          await tx.category.create({ data: { ...d, isActive: true } });
        }
      }
    });
    result.applied = data.length;
    result.skipped = result.errors.length;
    await auditService.record(req.user!, "CATEGORY_IMPORT", { type: "Organization", id: organizationId }, { applied: result.applied, skipped: result.skipped });
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
