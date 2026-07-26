import { Router } from "express";
import { usersController } from "./users.controller.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { requireAuth, requireRole } from "../../middlewares/auth.middleware.js";
import { CreateUserSchema, UpdateUserSchema, ResetPasswordSchema, ChangePasswordSchema } from "@epi/shared";

export const usersRouter = Router();

// /me routes must come before /:id to avoid conflict
usersRouter.post("/me/change-password", requireAuth, validate(ChangePasswordSchema), usersController.changePassword);
usersRouter.get("/", requireAuth, usersController.getAll);
usersRouter.get("/:id", requireAuth, usersController.getById);
usersRouter.post("/", requireAuth, requireRole("system_admin", "org_admin"), validate(CreateUserSchema), usersController.create);
usersRouter.patch("/:id", requireAuth, validate(UpdateUserSchema), usersController.update);
usersRouter.delete("/:id", requireAuth, requireRole("system_admin", "org_admin"), usersController.delete);
usersRouter.post("/:id/reset-password", requireAuth, requireRole("system_admin", "org_admin"), validate(ResetPasswordSchema), usersController.resetPassword);
usersRouter.post("/:id/force-logout", requireAuth, requireRole("system_admin", "org_admin"), usersController.forceLogout);
