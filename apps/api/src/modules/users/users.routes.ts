import { Router } from "express";
import { usersController } from "./users.controller.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { requireAuth, requireRole } from "../../middlewares/auth.middleware.js";
import { CreateUserSchema, UpdateUserSchema } from "@epi/shared";

export const usersRouter = Router();

usersRouter.get("/", requireAuth, usersController.getAll);
usersRouter.get("/:id", requireAuth, usersController.getById);
usersRouter.post("/", requireAuth, requireRole("admin"), validate(CreateUserSchema), usersController.create);
usersRouter.patch("/:id", requireAuth, validate(UpdateUserSchema), usersController.update);
usersRouter.delete("/:id", requireAuth, requireRole("admin"), usersController.delete);
