import { describe, expect, it } from "vitest";
import { formatValue } from "../features/reports/lib/format";

describe("formatValue", () => {
  it("keeps string values unchanged", () => {
    expect(formatValue("N/A", "percent")).toBe("N/A");
  });

  it("formats numbers, percents, and MXN currency", () => {
    expect(formatValue(1234, "number", "en-US")).toBe("1,234");
    expect(formatValue(87, "percent")).toBe("87%");
    expect(formatValue(1500, "currency", "es-MX")).toBe("$1,500");
  });
});
