import { colors } from "./theme";

const css = `:root { ${
  Object.entries(colors)
    .map(([k, v]) => `--color-${k}: ${v};`)
    .join(" ")
} }`;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{css}</style>
      {children}
    </>
  );
}
