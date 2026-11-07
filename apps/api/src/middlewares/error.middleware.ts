import type { Request, Response, NextFunction } from "express";
import { apiError } from "@epi/shared";
import { ZodError } from "zod";
import { env } from "../config/env.js";

export function errorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof ZodError) {
    res.status(400).json(apiError("VALIDATION_ERROR", err.issues.map(issue => issue.message).join("; ")));
    return;
  }
  const requestedStatus = err instanceof Error && "statusCode" in err ? err.statusCode : null;
  const status = typeof requestedStatus === "number" && Number.isInteger(requestedStatus) && requestedStatus >= 400 && requestedStatus < 500 ? requestedStatus : 500;
  if (status === 500) console.error(err);
  const message = err instanceof Error ? err.message : "Internal server error";
  const details = env.NODE_ENV === "development" && err instanceof Error ? err.stack : undefined;
  res.status(status).json(apiError(status === 500 ? "INTERNAL_ERROR" : status === 409 ? "CONFLICT" : "REQUEST_ERROR", message, details));
}
