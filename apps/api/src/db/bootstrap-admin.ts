import { prisma } from "./prisma.js";
import { ensureDefaultAdmin } from "./default-admin.js";

try {
  await ensureDefaultAdmin();
  console.log("Verificación del administrador inicial completada.");
} catch (error) {
  console.error(error instanceof Error ? error.message : "No se pudo crear el administrador inicial.");
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
