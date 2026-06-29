import type { Request, Response, NextFunction } from "express";
import { apiError } from "@epi/shared";
import { env } from "../config/env.js";

export function errorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  console.error(err);
  const message = err instanceof Error ? err.message : "Internal server error";
  const details = env.NODE_ENV === "development" && err instanceof Error ? err.stack : undefined;
  res.status(500).json(apiError("INTERNAL_ERROR", message, details));
}
