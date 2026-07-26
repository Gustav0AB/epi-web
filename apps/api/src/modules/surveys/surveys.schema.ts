import { z } from "zod";

// Contrato normalizado que espera el pipeline. Jotform real manda un
// multipart con `rawRequest` (string JSON); normalizeJotform() lo aplana
// a esta forma antes de validar. Es tolerante (passthrough) porque el
// crudo completo se guarda igual en Submission.rawJsonData.
export const JotformPayloadSchema = z
  .object({
    formID: z.string().min(1),
    submissionID: z.string().min(1),
    isPrePost: z.coerce.boolean().optional().default(false),
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
    answers: z
      .array(
        z.object({
          questionId: z.string().min(1), // debe coincidir con Question.externalId
          value: z.union([z.string(), z.number(), z.array(z.any())]),
        })
      )
      .default([]),
  })
  .passthrough();

export type JotformPayload = z.infer<typeof JotformPayloadSchema>;
