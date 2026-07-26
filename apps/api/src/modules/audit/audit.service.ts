import { prisma } from "../../db/prisma.js";
import type { Prisma } from "@prisma/client";
import type { JwtPayload } from "../../middlewares/auth.middleware.js";

export type AuditAction =
  | "LOGIN"
  | "USER_CREATE"
  | "USER_DELETE"
  | "USER_ROLE_CHANGE"
  | "PASSWORD_RESET"
  | "CATEGORY_IMPORT"
  | "ACCOUNT_LOCKED"
  | "FORCE_LOGOUT";

type Target = { type: string; id: string };

// El registro nunca debe tumbar la acción que audita: si falla el insert,
// se loguea y se sigue — perder un registro de auditoría es mejor que
// perder, por ejemplo, la creación de un usuario.
async function record(actor: JwtPayload, action: AuditAction, target?: Target, metadata?: Record<string, unknown>) {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: actor.sub,
        actorUsername: actor.username,
        actorRole: actor.role,
        actorOrganizationId: actor.organizationId,
        action,
        targetType: target?.type ?? null,
        targetId: target?.id ?? null,
        ...(metadata !== undefined && { metadata: metadata as Prisma.InputJsonValue }),
      },
    });
  } catch (err) {
    console.error("audit log write failed", action, err);
  }
}

async function list(page: number, pageSize: number, organizationId?: string) {
  const where = organizationId ? { actorOrganizationId: organizationId } : {};
  const [logs, total] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);
  return { logs, total };
}

export const auditService = { record, list };
