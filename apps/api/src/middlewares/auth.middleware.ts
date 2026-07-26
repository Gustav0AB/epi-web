import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { apiError } from "@epi/shared";

export type JwtPayload = {
  sub: string;
  username: string;
  role: string;
  organizationId: string | null;
  featureKeys: string[];
  // Agregado automático de jwt.sign en tokens reales (segundos desde epoch);
  // opcional porque otros lugares del código construyen un JwtPayload "a
  // mano" (selfchecks, auditoría) sin pasar por un JWT real.
  iat?: number;
};

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

// Además de validar la firma/expiración del JWT, confirma contra la DB que
// la cuenta sigue activa y que el token no fue emitido antes de un "forzar
// cierre de sesión" o cambio de contraseña (sessionValidAfter). Es una
// consulta extra por request a cambio de que desactivar/forzar-logout tenga
// efecto inmediato — antes de esto un token vigente seguía funcionando
// hasta expirar sin importar lo que hiciera el admin.
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json(apiError("UNAUTHORIZED", "Missing or invalid token"));
    return;
  }

  let payload: JwtPayload;
  try {
    const token = header.slice(7);
    payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
  } catch {
    res.status(401).json(apiError("UNAUTHORIZED", "Token expired or invalid"));
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { isActive: true, sessionValidAfter: true },
    });
    if (!user || !user.isActive) {
      res.status(401).json(apiError("UNAUTHORIZED", "Account is inactive"));
      return;
    }
    if (user.sessionValidAfter && payload.iat !== undefined && payload.iat * 1000 < user.sessionValidAfter.getTime()) {
      res.status(401).json(apiError("UNAUTHORIZED", "Session was revoked, please log in again"));
      return;
    }
  } catch (err) {
    next(err);
    return;
  }

  req.user = payload;
  next();
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json(apiError("FORBIDDEN", "Insufficient permissions"));
      return;
    }
    next();
  };
}

// system_admin/org_admin siempre pasan (gestionan toda funcionalidad de su
// alcance); functionality_user necesita al menos uno de los featureKeys
// dados; cualquier otro rol (report_viewer) no tiene acceso a funcionalidades.
export function requireFunctionality(...featureKeys: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    const allowed =
      !!user &&
      (user.role === "system_admin" ||
        user.role === "org_admin" ||
        (user.role === "functionality_user" && featureKeys.some((k) => user.featureKeys.includes(k))));
    if (!allowed) {
      res.status(403).json(apiError("FORBIDDEN", "Insufficient permissions"));
      return;
    }
    next();
  };
}
