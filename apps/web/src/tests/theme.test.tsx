import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Button } from "@epi/ui";
import { brandColors, colors, fonts } from "../config/theme";
import { ThemeProvider } from "../config/ThemeProvider";

function contrast(first: string, second: string) {
  const luminance = (hex: string) => {
    const channel = (offset: number) => { const value = parseInt(hex.slice(offset, offset + 2), 16) / 255; return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  };
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0]! + 0.05) / (values[1]! + 0.05);
}

describe("tema EPI", () => {
  it("uses the requested blue and accessible contrast for interactive text", () => {
    expect(colors.primary).toBe("#4197B5");
    expect(contrast(colors.primary, colors["primary-contrast"])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors["primary-hover"], brandColors.white)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors["primary-ink"], colors["primary-muted"])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(brandColors.orange, brandColors.black)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors["danger-ink"], colors["danger-muted"])).toBeGreaterThanOrEqual(4.5);
  });
  it("provides shared fonts and readable button variants", () => {
    const html = renderToStaticMarkup(<ThemeProvider><Button>Guardar</Button><Button variant="secondary">Atrás</Button></ThemeProvider>);
    expect(html).toContain("--font-body:"); expect(html).toContain("--font-heading:");
    expect(fonts.heading).toContain("Cambria"); expect(fonts.body).toContain("Calibri");
    expect(html).toContain("bg-primary text-primary-contrast");
    expect(html).toContain("bg-primary-muted text-primary");
  });
});
