import type { Request, Response, NextFunction } from "express";
import { usersService } from "./users.service.js";
import { apiSuccess, apiError } from "@epi/shared";

type AppError = Error & { statusCode?: number; code?: string };

export const usersController = {
  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const page = Number(req.query["page"] ?? 1);
      const pageSize = Number(req.query["pageSize"] ?? 20);
      const { users, meta } = await usersService.getAll(req.user!, page, pageSize);
      res.json(apiSuccess(users, meta));
    } catch (err) {
      next(err);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await usersService.getById(req.user!, req.params["id"]!);
      res.json(apiSuccess(user));
    } catch (err) {
      const e = err as AppError;
      if (e.statusCode) {
        res.status(e.statusCode).json(apiError(e.code ?? "ERROR", e.message));
        return;
      }
      next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await usersService.create(req.user!, req.body);
      res.status(201).json(apiSuccess(user));
    } catch (err) {
      const e = err as AppError;
      if (e.statusCode) {
        res.status(e.statusCode).json(apiError(e.code ?? "ERROR", e.message));
        return;
      }
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await usersService.update(req.user!, req.params["id"]!, req.body);
      res.json(apiSuccess(user));
    } catch (err) {
      const e = err as AppError;
      if (e.statusCode) {
        res.status(e.statusCode).json(apiError(e.code ?? "ERROR", e.message));
        return;
      }
      next(err);
    }
  },

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      await usersService.delete(req.user!, req.params["id"]!);
      res.status(204).send();
    } catch (err) {
      const e = err as AppError;
      if (e.statusCode) {
        res.status(e.statusCode).json(apiError(e.code ?? "ERROR", e.message));
        return;
      }
      next(err);
    }
  },

  async resetPassword(req: Request, res: Response, next: NextFunction) {
    try {
      await usersService.resetPassword(req.user!, req.params["id"]!, req.body.password);
      res.json(apiSuccess(null));
    } catch (err) {
      const e = err as AppError;
      if (e.statusCode) {
        res.status(e.statusCode).json(apiError(e.code ?? "ERROR", e.message));
        return;
      }
      next(err);
    }
  },

  async forceLogout(req: Request, res: Response, next: NextFunction) {
    try {
      await usersService.forceLogout(req.user!, req.params["id"]!);
      res.json(apiSuccess(null));
    } catch (err) {
      const e = err as AppError;
      if (e.statusCode) {
        res.status(e.statusCode).json(apiError(e.code ?? "ERROR", e.message));
        return;
      }
      next(err);
    }
  },

  async changePassword(req: Request, res: Response, next: NextFunction) {
    try {
      await usersService.changePassword(req.user!.sub, req.body.currentPassword, req.body.newPassword);
      res.json(apiSuccess(null));
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
