import type { Request, Response, NextFunction } from "express";
import { apiError } from "@epi/shared";
import { ZodError } from "zod";
import { logServerError } from "../shared/http-log.js";

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
  if (status === 500) logServerError(status);
  const message = status === 500 ? "No se pudo completar la solicitud. Inténtalo de nuevo más tarde." : err instanceof Error ? err.message : "Revisa los datos de la solicitud";
  const suppliedCode = err instanceof Error && "code" in err && typeof err.code === "string" && /^[A-Z_]+$/.test(err.code) ? err.code : undefined;
  res.status(status).json(apiError(status === 500 ? "INTERNAL_ERROR" : suppliedCode ?? (status === 409 ? "CONFLICT" : "REQUEST_ERROR"), message));
}
