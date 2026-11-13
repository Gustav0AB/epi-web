import { z } from "zod";
import type { SchoolCatalogDto } from "@epi/shared";
import { schoolContext } from "./school-context.js";

const SourceSchema = z.object({
  schoolContext: z.object({ original: z.unknown(), school: z.string().nullable().optional() }).optional(),
  participant: z.object({ school: z.unknown().optional() }).passthrough().optional(),
}).passthrough();

type SchoolRow = {
  id: string;
  reviewSchool: string | null;
  rawJsonData: unknown;
  surveyDefinition: { site: { id: string; name: string } } | null;
};

export function schoolCatalog(rows: SchoolRow[]): SchoolCatalogDto {
  const schools = new Map<string, SchoolCatalogDto["schools"][number]>();
  const seen = new Set<string>();
  let unresolvedCount = 0;
  for (const row of rows) {
    if (!row.surveyDefinition || seen.has(row.id)) continue;
    seen.add(row.id);
    const source = SourceSchema.safeParse(row.rawJsonData);
    // Read each submission's original school, never the mutable participant profile.
    const detected = source.success ? schoolContext(source.data.schoolContext ? source.data.schoolContext.original : source.data.participant?.school) : null;
    const confirmed = row.reviewSchool?.trim().replace(/\s+/g, " ");
    const stored = source.success ? source.data.schoolContext : undefined;
    const recoverDated = stored?.school === null && typeof stored.original === "string" && /^\s*\d{1,2}\/\d{1,2}\/(?:\d{2}|\d{4})\s*[-–—]/.test(stored.original);
    const name = confirmed || (stored?.school !== undefined && !recoverDated ? stored.school?.trim().replace(/\s+/g, " ") : detected?.school);
    if (!name) { unresolvedCount++; continue; }
    const site = row.surveyDefinition.site;
    const key = JSON.stringify([site.id, name.toLowerCase()]);
    const entry = schools.get(key) ?? { siteId: site.id, siteName: site.name, name, responseCount: 0, confirmedCount: 0 };
    entry.responseCount++;
    if (confirmed) entry.confirmedCount++;
    schools.set(key, entry);
  }
  return { schools: [...schools.values()].sort((a, b) => a.siteName.localeCompare(b.siteName) || a.name.localeCompare(b.name) || a.siteId.localeCompare(b.siteId)), unresolvedCount };
}
