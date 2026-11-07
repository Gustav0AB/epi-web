import { describe, expect, it } from "vitest";
import type { SurveyDefinitionDto, SiteDto } from "@epi/shared";
import { currentYearRange, surveyFilterOptions } from "../features/surveys/survey-filter-options";
const sites: SiteDto[] = ["a", "b"].map((id) => ({ id, name: id, organizationId: "org", isActive: true }));
const definitions: SurveyDefinitionDto[] = ["a", "b"].map((siteId) => ({ id: `def-${siteId}`, siteId, jotformFormId: siteId, title: siteId, type: "LOCAL", version: 1, organizationId: "org", accountName: null, isWeighted: true, openQuestionsSummary: null }));
describe("survey filters", () => {
  it("defaults to the current local calendar year", () => {
    expect(currentYearRange(new Date(2027, 0, 1))).toEqual({ from: "2027-01-01", to: "2027-12-31" });
    expect(currentYearRange(new Date(2026, 11, 31))).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  });
  it("narrows instruments by site and sites by instrument", () => {
    expect(surveyFilterOptions(definitions, sites, "a", "").definitions.map((d) => d.id)).toEqual(["def-a"]);
    expect(surveyFilterOptions(definitions, sites, "", "def-b").sites.map((s) => s.id)).toEqual(["b"]);
    expect(surveyFilterOptions(definitions, sites, "", "")).toEqual({ definitions, sites });
  });
  it("keeps only weighted definitions and never adds unauthorized sites", () => {
    expect(surveyFilterOptions([{ ...definitions[0]!, isWeighted: false }], sites, "", "").definitions).toEqual([]);
    expect(surveyFilterOptions(definitions, [sites[0]!], "", "def-b").sites).toEqual([]);
  });
});
