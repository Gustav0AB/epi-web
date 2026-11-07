import { z } from "zod";

export type AnswerJson = string | number | boolean | null | AnswerJson[] | { [key: string]: AnswerJson };
export const AnswerJsonSchema: z.ZodType<AnswerJson> = z.lazy(() => z.union([
  z.string(), z.number().finite(), z.boolean(), z.null(), z.array(AnswerJsonSchema), z.record(AnswerJsonSchema),
]));

// Contrato normalizado que espera el pipeline. Jotform real manda un
// multipart con `rawRequest` (string JSON); normalizeJotform() lo aplana
// a esta forma antes de validar. Es tolerante (passthrough) porque el
// crudo completo se guarda igual en Submission.rawJsonData.
export const JotformPayloadSchema = z
  .object({
    formID: z.string().min(1),
    submissionID: z.string().min(1),
    isPrePost: z.boolean().optional(),
    surveyMoment: z.enum(["PRE", "POST", "POST_POST", "CQS", "UNKNOWN"]).optional().default("UNKNOWN"),
    participant: z
      .object({
        id: z.string().min(1),
        name: z.string().optional(),
        age: z.coerce.number().int().optional(),
        gender: z.string().optional(),
        school: z.string().optional(),
        group: z.string().optional(),
      })
      .passthrough()
      .optional(),
    sourceAnswers: z.record(AnswerJsonSchema).optional(),
    unresolvedAnswers: z.array(z.object({
      sourceId: z.string(),
      reason: z.enum(["MISSING_NAME", "DUPLICATE_NAME", "INVALID_ENTRY"]),
    })).optional(),
    answers: z
      .array(
        z.object({
          questionId: z.string().min(1), // debe coincidir con Question.externalId
          value: AnswerJsonSchema,
        })
      )
      .default([]),
  })
  .passthrough();

export type JotformPayload = z.infer<typeof JotformPayloadSchema>;
