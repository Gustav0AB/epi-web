import { describe, expect, it } from "vitest";
import { getReportTemplate, REPORT_TEMPLATES } from "../features/reports/templates";

describe("REPORT_TEMPLATES", () => {
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
