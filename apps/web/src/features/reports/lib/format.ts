import type { FormatKind } from "../templates/types";

export function formatValue(value: number | string, format?: FormatKind, locale = "es-MX"): string {
  if (typeof value === "string") return value;
  switch (format) {
    case "percent":
      return `${value}%`;
    case "currency":
      // La moneda (MXN) es una decisión de negocio de EPI, independiente del idioma de la UI.
      return value.toLocaleString(locale, { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
    case "number":
    default:
      return value.toLocaleString(locale);
  }
}
