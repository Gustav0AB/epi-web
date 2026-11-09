import es from "./locales/es.json";
import en from "./locales/en.json";

let language: "es" | "en" = "es";
export function setErrorLanguage(value: "es" | "en") { language = value; }
export function errorMessage(code: string, fallback?: string, lang = language): string {
  const dictionary = lang === "en" ? en : es;
  const key = `errors.${code}` as keyof typeof es;
  // shortcut: domain validation stays in Spanish; add per-domain codes when translating these instructions.
  if (["BAD_REQUEST", "CONFLICT", "REQUEST_ERROR"].includes(code) && fallback && /[áéíóúñ¿¡]|\b(el|la|los|las|de|una|para|debe|selecciona|revisa|completa|no)\b/i.test(fallback) && !/prisma|sql|stack|token|password|exception|database|postgres|constraint|\bselect\b|\binsert\b|\bdelete\b|\bupdate\b|\/Users\/|\/app\/|\bat\s+\S+\s*\(/i.test(fallback)) return fallback;
  return dictionary[key] ?? dictionary["errors.UNKNOWN"];
}
export class ApiError extends Error {
  constructor(public code: string, message?: string, public details?: unknown) {
    super(errorMessage(code, message));
    this.name = "ApiError";
  }
}
