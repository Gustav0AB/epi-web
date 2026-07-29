import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { apiSuccess, apiError, CreateAssignedReportSchema, UpdateAssignedReportSchema } from "@epi/shared";
import { requireAuth, requireRole } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { assignedReportsService } from "./assigned-reports.service.js";

export const assignedReportsRouter = Router();

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

// "Mis reportes" — cualquier usuario autenticado, acotado a sí mismo.
assignedReportsRouter.get(
  "/assigned",
  requireAuth,
  wrap(async (req, res) => {
    const status = req.query.status as string | undefined;
    res.json(apiSuccess(await assignedReportsService.listMine(req.user!, status)));
  })
);

// Panel de administración: alta/edición/baja de asignaciones.
assignedReportsRouter.get(
  "/assignments",
  requireAuth,
  requireRole("system_admin", "org_admin"),
  wrap(async (req, res) => {
    res.json(apiSuccess(await assignedReportsService.listManaged(req.user!)));
  })
);

assignedReportsRouter.post(
  "/assignments",
  requireAuth,
  requireRole("system_admin", "org_admin"),
  validate(CreateAssignedReportSchema),
  wrap(async (req, res) => {
    const report = await assignedReportsService.create(req.user!, req.body);
    res.status(201).json(apiSuccess(report));
  })
);

assignedReportsRouter.patch(
  "/assignments/:id",
  requireAuth,
  requireRole("system_admin", "org_admin"),
  validate(UpdateAssignedReportSchema),
  wrap(async (req, res) => {
    const report = await assignedReportsService.update(req.user!, req.params.id!, req.body);
    res.json(apiSuccess(report));
  })
);

assignedReportsRouter.delete(
  "/assignments/:id",
  requireAuth,
  requireRole("system_admin", "org_admin"),
  wrap(async (req, res) => {
    await assignedReportsService.remove(req.user!, req.params.id!);
    res.status(204).send();
  })
);

assignedReportsRouter.get(
  "/assignments/:id/versions",
  requireAuth,
  requireRole("system_admin", "org_admin"),
  wrap(async (req, res) => {
    res.json(apiSuccess(await assignedReportsService.versions(req.user!, req.params.id!)));
  })
);

// Datos del documento — el asignado o un admin en su alcance.
assignedReportsRouter.get(
  "/:id/data",
  requireAuth,
  wrap(async (req, res) => {
    const siteId = typeof req.query.siteId === "string" && req.query.siteId ? req.query.siteId : undefined;
    res.json(apiSuccess(await assignedReportsService.getData(req.user!, req.params.id!, siteId)));
  })
);
