/**
 * Central theme config — edit here to restyle the whole app.
 * Changes here automatically update Tailwind classes (bg-primary, text-secondary, etc.)
 * and all shared components.
 */
export const colors = {
  // ── Brand ───────────────────────────────────────────────────────────────────
  primary:       "#2b6579",
  "primary-hover":  "#245668",   // darker — used for hover/active states
  "primary-muted":  "#e8f2f5",   // very light — used for active nav bg, badges

  secondary:        "#ef8200",
  "secondary-hover":"#d47300",
  "secondary-muted":"#fef3e2",

  // ── Semantic ─────────────────────────────────────────────────────────────────
  danger:           "#dc2626",
  "danger-hover":   "#b91c1c",
  "danger-muted":   "#fef2f2",

  success:          "#16a34a",
  "success-muted":  "#f0fdf4",

  warning:          "#d97706",
  "warning-muted":  "#fffbeb",
} as const;

export type ThemeColor = keyof typeof colors;
