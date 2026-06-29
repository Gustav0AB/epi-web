import type { Request, Response, NextFunction } from "express";
import type { ZodSchema } from "zod";
import { apiError } from "@epi/shared";

type ValidateTarget = "body" | "query" | "params";

export function validate(schema: ZodSchema, target: ValidateTarget = "body") {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      res.status(400).json(
        apiError("VALIDATION_ERROR", "Invalid request data", result.error.flatten())
      );
      return;
    }
    req[target] = result.data;
    next();
  };
}
