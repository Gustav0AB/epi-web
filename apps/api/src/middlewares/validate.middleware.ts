import type { Request, Response, NextFunction } from "express";
import type { ZodSchema } from "zod";
import { apiError } from "@epi/shared";

type ValidateTarget = "body" | "query" | "params";

export function validate(schema: ZodSchema, target: ValidateTarget = "body") {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors;
      const firstEntry = Object.entries(fieldErrors)[0];
      const message = firstEntry
        ? `${firstEntry[0]}: ${firstEntry[1]?.[0] ?? "invalid value"}`
        : "Invalid request data";
      res.status(400).json(apiError("VALIDATION_ERROR", message, fieldErrors));
      return;
    }
    req[target] = result.data;
    next();
  };
}
