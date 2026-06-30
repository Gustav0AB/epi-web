import type { Request, Response, NextFunction } from "express";
import { featuresService } from "./features.service.js";
import { apiSuccess } from "@epi/shared";

export const featuresController = {
  async getAll(_req: Request, res: Response, next: NextFunction) {
    try {
      const features = await featuresService.getAll();
      res.json(apiSuccess(features));
    } catch (err) {
      next(err);
    }
  },
};
