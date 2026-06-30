import { z } from "zod";

export const FeatureSchema = z.object({
  id: z.string().uuid(),
  key: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
});

export type Feature = z.infer<typeof FeatureSchema>;
