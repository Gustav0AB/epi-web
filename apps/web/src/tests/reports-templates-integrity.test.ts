import { describe, expect, it } from "vitest";
import { REPORT_TEMPLATES } from "../features/reports/templates";

describe("report templates integrity", () => {
  it("uses unique block ids inside each template", () => {
    for (const template of Object.values(REPORT_TEMPLATES)) {
      const ids = template.blocks.map((block) => block.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("has valid chart definitions", () => {
    for (const template of Object.values(REPORT_TEMPLATES)) {
      for (const block of template.blocks) {
        if (block.type !== "chart") continue;
        expect(block.dataKey).not.toBe("");
        expect(block.xKey).not.toBe("");
        expect(block.series.length).toBeGreaterThan(0);
        for (const series of block.series) {
          expect(series.key).not.toBe("");
          expect(series.label).not.toBe("");
          expect(series.color).toMatch(/^#[0-9a-f]{6}$/i);
        }
      }
    }
  });
});
