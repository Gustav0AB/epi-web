import type { Request, Response, NextFunction } from "express";
import { usersService } from "./users.service.js";
import { apiSuccess, apiError } from "@epi/shared";

type AppError = Error & { statusCode?: number; code?: string };

export const usersController = {
  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const page = Number(req.query["page"] ?? 1);
      const pageSize = Number(req.query["pageSize"] ?? 20);
      const { users, meta } = await usersService.getAll(page, pageSize);
      res.json(apiSuccess(users, meta));
    } catch (err) {
      next(err);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await usersService.getById(req.params["id"]!);
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
      const user = await usersService.create(req.body);
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
      const user = await usersService.update(req.params["id"]!, req.body);
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
      await usersService.delete(req.params["id"]!);
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
};
