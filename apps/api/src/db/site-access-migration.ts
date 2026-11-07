type MigrationUser = {
  id: string;
  role: string;
  organizationId: string | null;
  siteIds: string[];
  excludedSiteIds: string[];
};

type MigrationSite = { id: string; organizationId: string | null };

// Derive assignments from effective access, never from the old reference sites.
export function planSiteAccessMigration(users: MigrationUser[], sites: MigrationSite[]) {
  const sitesByOrg = new Map<string, string[]>();
  for (const site of sites) {
    if (site.organizationId === null) continue;
    const ids = sitesByOrg.get(site.organizationId) ?? [];
    ids.push(site.id);
    sitesByOrg.set(site.organizationId, ids);
  }

  const assignments = users.filter((user) => user.role !== "SYSTEM_ADMIN").map((user) => {
    const excluded = new Set(user.excludedSiteIds);
    const siteIds = (sitesByOrg.get(user.organizationId ?? "") ?? [])
      .filter((id) => !excluded.has(id)).sort();
    return {
      userId: user.id,
      organizationId: user.organizationId,
      previousReferenceSiteIds: user.siteIds,
      previousExcludedSiteIds: user.excludedSiteIds,
      siteIds,
      blocker: !user.organizationId ? "MISSING_ORGANIZATION"
        : siteIds.length === 0 ? "NO_ACCESSIBLE_SITES" : null,
    };
  });

  return {
    ready: assignments.every((assignment) => assignment.blocker === null),
    // System administrators currently have global access; do not infer an organization.
    systemAdminIds: users.filter((user) => user.role === "SYSTEM_ADMIN").map((user) => user.id),
    assignments,
  };
}
