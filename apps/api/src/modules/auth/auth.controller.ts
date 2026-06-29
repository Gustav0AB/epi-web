import type { Request, Response, NextFunction } from "express";
import { authService } from "./auth.service.js";
import { apiSuccess, apiError } from "@epi/shared";

type AppError = Error & { statusCode?: number; code?: string };

export const authController = {
  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const token = await authService.login(req.body);
      res.json(apiSuccess(token));
    } catch (err) {
      const e = err as AppError;
      if (e.statusCode) {
        res.status(e.statusCode).json(apiError(e.code ?? "ERROR", e.message));
        return;
      }
      next(err);
    }
  },
};
