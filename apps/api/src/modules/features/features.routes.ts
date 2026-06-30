import { Router } from "express";
import { featuresController } from "./features.controller.js";
import { requireAuth } from "../../middlewares/auth.middleware.js";

export const featuresRouter = Router();

featuresRouter.get("/", requireAuth, featuresController.getAll);
