import { prisma } from "../db/prisma.js";

export type ScopedUser = {
  role: string;
  organizationId: string | null;
  excludedSiteIds: string[];
};

async function siteIdsForOrg(organizationId: string): Promise<string[]> {
  const sites = await prisma.site.findMany({ where: { organizationId }, select: { id: true } });
  return sites.map((s) => s.id);
}

// Sitios que el usuario puede ver/gestionar. undefined = sin restricción.
// El sitio ya no es un allow-list: todo usuario ve todos los sitios de su
// organización salvo los que tenga explícitamente excluidos
// (excludedSiteIds). `siteIds` (aparte, no usado aquí) es solo el sitio de
// referencia para la vista por defecto — no restringe.
// - system_admin: sin restricción.
// - resto de roles: todos los sitios de su organización menos excludedSiteIds.
export async function allowedSiteIds(user: ScopedUser): Promise<string[] | undefined> {
  if (user.role === "system_admin") return undefined;
  if (!user.organizationId) return [];
  const all = await siteIdsForOrg(user.organizationId);
  if (user.excludedSiteIds.length === 0) return all;
  return all.filter((id) => !user.excludedSiteIds.includes(id));
}
