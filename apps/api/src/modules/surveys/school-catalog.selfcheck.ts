import assert from "node:assert/strict";
import { schoolCatalog } from "./school-catalog.js";
import { prisma } from "../../db/prisma.js";
import { surveysRepository } from "./surveys.repository.js";

const row = (id: string, original: unknown, siteId = "a", reviewSchool: string | null = null) => ({ id, reviewSchool, rawJsonData: { schoolContext: { original }, secret: "not returned" }, surveyDefinition: { site: { id: siteId, name: siteId } } });
const rows = [row("1", "04/11/2026 - CBTIS 230"), row("2", "  cbtis   230  "), row("3", "CBTIS 230", "b"), row("4", "31/02/2026 - Wrong"), row("5", null), row("6", "Ambiguous", "a", " CBTIS   230 "), row("1", "04/11/2026 - CBTIS 230")];
const result = schoolCatalog(rows);
assert.deepEqual(result, { schools: [
  { siteId: "a", siteName: "a", name: "CBTIS 230", responseCount: 3, confirmedCount: 1 },
  { siteId: "b", siteName: "b", name: "CBTIS 230", responseCount: 1, confirmedCount: 0 },
], unresolvedCount: 2 });
assert(!JSON.stringify(result).includes("secret"));
assert.equal(schoolCatalog([{ ...row("legacy", null), rawJsonData: { participant: { school: "Legacy School" } } }]).schools[0]!.name, "Legacy School");
assert.equal(schoolCatalog([{ ...row("ambiguous", null), rawJsonData: { schoolContext: { original: null }, participant: { school: "Must not fall back" } } }]).schools.length, 0);
assert.equal(schoolCatalog([{ ...row("unassigned", "School"), surveyDefinition: null }]).schools.length, 0);
assert.equal(schoolCatalog([{ ...row("ambiguous-name", "Unresolved"), rawJsonData: { schoolContext: { original: "Unresolved", school: null } } }]).schools.length, 0);
assert.equal(schoolCatalog([{ ...row("dated", null), rawJsonData: { schoolContext: { original: "8/17/26 - Abington Friends Middle School", school: null } } }]).schools[0]?.name, "Abington Friends Middle School");
assert.equal(schoolCatalog([row("no-date", "School")]).schools.length, 1, "Missing a grouping date must not hide a valid school");
assert.equal(schoolCatalog([row("a", "CBTIS 230"), row("b", "CBTIS230")]).schools.length, 2, "Do not guess school equivalences");
prisma.submission.findMany = (async (args: { where: unknown; select: { surveyDefinition: unknown } }) => {
  assert.deepEqual(args.where, { surveyDefinition: { is: { siteId: { in: ["allowed"] }, id: { notIn: ["excluded"] } } } });
  assert.deepEqual(args.select.surveyDefinition, { select: { site: { select: { id: true, name: true } } } });
  return [];
}) as unknown as typeof prisma.submission.findMany;
await surveysRepository.schoolCatalogRows({ siteIds: ["allowed"], excludedSurveyDefinitionIds: ["excluded"] });
console.log("✓ school catalog normalization, originals, confirmation, privacy and scope passed");
