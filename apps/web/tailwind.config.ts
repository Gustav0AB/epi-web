import type { Config } from "tailwindcss";

/**
 * Color names here must match the keys in src/config/theme.ts.
 * Actual hex values live in theme.ts — Tailwind reads them at runtime
 * via CSS custom properties injected by ThemeProvider.
 */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary:          "var(--color-primary)",
        "primary-hover":  "var(--color-primary-hover)",
        "primary-muted":  "var(--color-primary-muted)",

        secondary:        "var(--color-secondary)",
        "secondary-hover":"var(--color-secondary-hover)",
        "secondary-muted":"var(--color-secondary-muted)",

        danger:           "var(--color-danger)",
        "danger-hover":   "var(--color-danger-hover)",
        "danger-muted":   "var(--color-danger-muted)",

        success:          "var(--color-success)",
        "success-muted":  "var(--color-success-muted)",

        warning:          "var(--color-warning)",
        "warning-muted":  "var(--color-warning-muted)",
      },
    },
  },
  plugins: [],
} satisfies Config;
