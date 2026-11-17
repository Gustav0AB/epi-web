import { colors, fonts } from "./theme";

const css = `:root { ${
  Object.entries(colors)
    .map(([k, v]) => `--color-${k}: ${v};`)
    .join(" ")
} ${Object.entries(fonts).map(([key, value]) => `--font-${key}: ${value};`).join(" ")} }`;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{css}</style>
      {children}
    </>
  );
}
