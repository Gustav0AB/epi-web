import { Router } from "express";
import { authController } from "./auth.controller.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { LoginSchema } from "@epi/shared";

export const authRouter = Router();

authRouter.post("/login", validate(LoginSchema), authController.login);
