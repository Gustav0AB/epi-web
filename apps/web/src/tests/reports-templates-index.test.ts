import { describe, expect, it } from "vitest";
import { getReportTemplate, REPORT_TEMPLATES } from "../features/reports/templates";

describe("REPORT_TEMPLATES", () => {
  it("preserves historical keys while sharing the general report content", () => {
    const general = Object.values(REPORT_TEMPLATES)[0];
    for (const key of ["course-impacts-2026mx-ncssm", "course-impacts-2026cr-burton", "course-impacts-2026mx-templeton"]) {
      expect(getReportTemplate(key)).toEqual({ ...general, key });
    }
  });
  it("registers each template under its own key", () => {
    for (const [key, template] of Object.entries(REPORT_TEMPLATES)) {
      expect(template.key).toBe(key);
      expect(getReportTemplate(key)).toBe(template);
    }
  });

  it("returns undefined for unknown templates", () => {
    expect(getReportTemplate("missing")).toBeUndefined();
  });
});
