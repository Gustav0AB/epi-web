import { createContext, useContext } from "react";

const messages = {
  "es": {
    "table.loading": "Cargando…",
    "table.noData": "Sin datos.",
    "table.rowsPerPage": "Filas por página:",
    "table.of": "de",
    "table.prevPage": "Página anterior",
    "table.nextPage": "Página siguiente",
    "pagination.label": "Paginación",
    "modal.close": "Cerrar",
    "common.genericError": "Error",
    "common.cancel": "Cancelar",
    "common.delete": "Eliminar",
    "datePicker.placeholder": "Seleccionar fecha",
    "datePicker.clear": "Limpiar"
  },
  "en": {
    "table.loading": "Loading…",
    "table.noData": "No data.",
    "table.rowsPerPage": "Rows per page:",
    "table.of": "of",
    "table.prevPage": "Previous page",
    "table.nextPage": "Next page",
    "pagination.label": "Pagination",
    "modal.close": "Close",
    "common.genericError": "Error",
    "common.cancel": "Cancel",
    "common.delete": "Delete",
    "datePicker.placeholder": "Select a date",
    "datePicker.clear": "Clear"
  }
} as const;
export type UiTextKey = keyof typeof messages.es;
type UiI18n = { lang: "es" | "en"; t: (key: UiTextKey) => string };
const UiContext = createContext<UiI18n>({ lang: "es", t: (key) => messages.es[key] });

export function UiProvider({ children, lang = "es", t }: { children: React.ReactNode; lang?: "es" | "en"; t?: (key: UiTextKey) => string }) {
  return <UiContext.Provider value={{ lang, t: t ?? ((key) => messages[lang][key]) }}>{children}</UiContext.Provider>;
}

export function useI18n() { return useContext(UiContext); }
