// Bitácora de auditoría: solo lectura desde el frontend (system_admin), no
// hay endpoint de escritura directo — se genera desde las acciones del backend.
export type AuditLogDto = {
  id: string;
  actorId: string | null;
  actorUsername: string;
  actorRole: string;
  actorOrganizationId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};
