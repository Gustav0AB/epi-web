import { describe, expect, it } from "vitest";
import type { User } from "@epi/shared";
import { getDefaultRoute } from "../router/default-route";

const user = (patch: Partial<User>): User => ({
  id: "11111111-1111-4111-8111-111111111111",
  name: "Ana Demo",
  username: "ana_demo",
  email: "ana@example.com",
  role: "functionality_user",
  institutionalPosition: null,
  isActive: true,
  featureKeys: [],
  reportTemplateKeys: [],
  organizationId: "22222222-2222-4222-8222-222222222222",
  siteIds: [],
  excludedSiteIds: [],
  excludedSurveyDefinitionIds: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...patch,
});

describe("getDefaultRoute", () => {
  it("sends admins to home", () => {
    expect(getDefaultRoute(user({ role: "system_admin" }))).toBe("/home");
    expect(getDefaultRoute(user({ role: "org_admin" }))).toBe("/home");
  });

  it("sends functionality users to their first available feature", () => {
    expect(getDefaultRoute(user({ featureKeys: ["home"] }))).toBe("/home");
    expect(getDefaultRoute(user({ featureKeys: ["surveys"] }))).toBe("/surveys");
    expect(getDefaultRoute(user({ featureKeys: ["scoring"] }))).toBe("/scoring");
    expect(getDefaultRoute(user({ featureKeys: [] }))).toBe("/no-access");
  });

  it("sends report viewers to their assigned report surface", () => {
    expect(getDefaultRoute(user({ role: "report_viewer", reportTemplateKeys: ["reports"] }))).toBe("/reports");
    expect(getDefaultRoute(user({ role: "report_viewer", reportTemplateKeys: ["interactive_reports"] }))).toBe("/interactive-reports");
    expect(getDefaultRoute(user({ role: "report_viewer", reportTemplateKeys: [] }))).toBe("/no-access");
  });
});
