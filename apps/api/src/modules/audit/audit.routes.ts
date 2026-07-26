import { Router } from "express";
import { apiSuccess } from "@epi/shared";
import { requireAuth, requireRole } from "../../middlewares/auth.middleware.js";
import { auditService } from "./audit.service.js";

export const auditRouter = Router();

// Solo system_admin: la bitácora cruza organizaciones (login, altas/bajas,
// cambios de rol, reset de contraseña, import CSV de cualquier organización).
auditRouter.get("/audit-logs", requireAuth, requireRole("system_admin"), async (req, res, next) => {
  try {
    const page = Number(req.query.page ?? 1);
    const pageSize = Math.min(Number(req.query.pageSize ?? 50), 200);
    const { logs, total } = await auditService.list(page, pageSize);
    res.json(apiSuccess(logs, { total, page, pageSize, totalPages: Math.ceil(total / pageSize) }));
  } catch (err) {
    next(err);
  }
});
