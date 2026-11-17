import bcrypt from "bcryptjs";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "./prisma.js";

export async function ensureDefaultAdmin(db: Pick<PrismaClient, "user"> = prisma) {
  const admins = await db.user.findMany({ where: { role: "SYSTEM_ADMIN" }, select: { id: true, isActive: true }, take: 2 });
  if (admins.length > 1) throw new Error("Hay más de un administrador de sistema; revisa las cuentas antes de iniciar.");
  if (admins.length === 1) {
    if (!admins[0]!.isActive) throw new Error("El administrador de sistema está desactivado; revisa la cuenta antes de iniciar.");
    return;
  }
  const initialPassword = process.env.INITIAL_ADMIN_PASSWORD;
  if (!initialPassword || initialPassword.length < 12) {
    throw new Error("Define INITIAL_ADMIN_PASSWORD con al menos 12 caracteres para crear el administrador inicial.");
  }
  const password = await bcrypt.hash(initialPassword, 12);
  try {
    await db.user.create({ data: { name: "System Admin", username: "admin", email: "admin@epi.local", password, role: "SYSTEM_ADMIN", mustChangePassword: true } });
  } catch {
    const current = await db.user.findMany({ where: { role: "SYSTEM_ADMIN" }, select: { id: true, isActive: true }, take: 2 });
    if (current.length === 1 && current[0]!.isActive) return;
    throw new Error("No se pudo crear el administrador predeterminado; revisa que el usuario y correo estén disponibles.");
  }
}
