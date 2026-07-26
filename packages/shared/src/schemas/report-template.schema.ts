import { z } from "zod";

export const ReportTemplateSchema = z.object({
  id: z.string().uuid(),
  key: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
});

export const CreateReportTemplateSchema = z.object({
  key: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9_]+$/, "Only lowercase letters, numbers, and underscores"),
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
});

export const UpdateReportTemplateSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(500).optional(),
});

export type ReportTemplate = z.infer<typeof ReportTemplateSchema>;
export type CreateReportTemplateDto = z.infer<typeof CreateReportTemplateSchema>;
export type UpdateReportTemplateDto = z.infer<typeof UpdateReportTemplateSchema>;
