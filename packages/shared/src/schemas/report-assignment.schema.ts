import { z } from "zod";

// Documentos de reporte asignados a un usuario puntual (permisos por
// documento). templateKey referencia el registro de plantillas del
// frontend (features/reports/templates) — no se valida acá porque las
// plantillas (bloques, colores, formato) son un detalle de presentación,
// no un dato de negocio que el backend necesite conocer.
export const REPORT_ASSIGNMENT_STATUSES = ["pending", "in_review", "published"] as const;
export type ReportAssignmentStatus = (typeof REPORT_ASSIGNMENT_STATUSES)[number];

export const CreateAssignedReportSchema = z.object({
  userId: z.string().uuid(),
  templateKey: z.string().trim().min(1).max(100),
  title: z.string().trim().min(2).max(150),
  filters: z.record(z.unknown()).nullable().optional(),
});
export type CreateAssignedReportDto = z.infer<typeof CreateAssignedReportSchema>;

export const UpdateAssignedReportSchema = z.object({
  templateKey: z.string().trim().min(1).max(100).optional(),
  title: z.string().trim().min(2).max(150).optional(),
  status: z.enum(REPORT_ASSIGNMENT_STATUSES).optional(),
  filters: z.record(z.unknown()).nullable().optional(),
});
export type UpdateAssignedReportDto = z.infer<typeof UpdateAssignedReportSchema>;

export type AssignedReportDto = {
  id: string;
  userId: string;
  templateKey: string;
  title: string;
  status: ReportAssignmentStatus;
  filters: Record<string, unknown> | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type AssignedReportVersionDto = {
  id: string;
  reportId: string;
  version: number;
  title: string;
  status: ReportAssignmentStatus;
  filters: Record<string, unknown> | null;
  actorUsername: string;
  createdAt: string;
};

// Forma que espera el renderer de reportes (features/reports/templates/types.ts
// en el frontend). Vive acá también porque GET /:id/data la devuelve —
// hoy siempre vacía: no hay fuente de datos real conectada a las plantillas.
export type ReportDataDto = {
  kpis: Record<string, number | string>;
  series: Record<string, Record<string, unknown>[]>;
  tables: Record<string, Record<string, unknown>[]>;
};
