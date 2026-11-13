import { describe, expect, it } from "vitest";
import { relativeChange } from "@epi/shared";

describe("relative change", () => {
  it("compares the later result to the initial result", () => {
    expect(relativeChange(72, 81)).toBe(12.5);
    expect(relativeChange(80, 40)).toBe(-50);
    expect(relativeChange(40, 40)).toBe(0);
  });
  it("leaves zero, missing and invalid bases unavailable", () => {
    expect(relativeChange(0, 0)).toBeNull();
    expect(relativeChange(0, 5)).toBeNull();
    expect(relativeChange(null, 5)).toBeNull();
    expect(relativeChange(5, null)).toBeNull();
    expect(relativeChange(Infinity, 5)).toBeNull();
  });
});
