import { prisma } from "../db/prisma.js";

export type ScopedUser = {
  role: string;
  organizationId: string | null;
  siteIds: string[];
};

// undefined means global access; an empty assignment always denies access.
export async function allowedSiteIds(user: ScopedUser): Promise<string[] | undefined> {
  if (user.role === "system_admin") return undefined;
  if (!user.organizationId || user.siteIds.length === 0) return [];
  const sites = await prisma.site.findMany({
    where: { organizationId: user.organizationId, id: { in: user.siteIds } },
    select: { id: true },
  });
  return sites.map((site) => site.id);
}
