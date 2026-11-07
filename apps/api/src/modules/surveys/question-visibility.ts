import type { QuestionVisibility } from "@epi/shared";
import type { JotformQuestion } from "./jotform-client.js";

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
function decode(value: unknown): unknown {
  if (typeof value !== "string") return value;
  return JSON.parse(value);
}
function entries(value: unknown): unknown[] {
  if (value === "") return [];
  const parsed = decode(value);
  if (Array.isArray(parsed)) return parsed;
  if (record(parsed)) return "type" in parsed || "visibility" in parsed || "field" in parsed ? [parsed] : Object.values(parsed);
  throw new Error("Unsupported conditions format");
}

/** Describe source rules; do not execute them or infer when a missing answer was visible. */
export function questionVisibility(questions: JotformQuestion[], source: unknown) {
  const byId = new Map<string, JotformQuestion>();
  const visibility = new Map<string, QuestionVisibility>();
  for (const question of questions) {
    for (const id of [question.qid, question.name, question.qid ? `input_${question.qid}` : undefined]) if (id) byId.set(id, question);
    visibility.set(question.name?.trim() ? question.name : `qid:${question.qid ?? "sin-id"}`, { hidden: ["1", "yes", "true"].includes(String(question.hidden).toLowerCase()), rules: [] });
  }
  const warnings: string[] = [];
  const original = source === undefined ? "[]" : typeof source === "string" ? source : JSON.stringify(source);
  try {
    for (const [index, raw] of entries(source ?? [] ).entries()) {
      if (!record(raw)) { warnings.push(`Regla ${index + 1}: formato no reconocido`); continue; }
      if ([true, 1, "1"].includes(raw.disabled as string)) continue;
      if (raw.type !== "field") { warnings.push(`Regla ${index + 1}: tipo ${String(raw.type ?? "desconocido")} conservado para revisión`); continue; }
      try {
        const terms = entries(raw.terms ?? []).map(term => {
          if (!record(term)) throw new Error("Invalid term");
          const referenced = byId.get(String(term.field));
          if (!referenced?.name || typeof term.operator !== "string") throw new Error("Unknown term field or operator");
          return { field: referenced.name, operator: term.operator, value: typeof term.value === "string" ? term.value : JSON.stringify(term.value ?? "") };
        });
        for (const action of entries(raw.action ?? [])) {
          if (!record(action)) throw new Error("Invalid action");
          const ids = action.fields ?? action.field;
          const targets = Array.isArray(ids) ? ids : typeof ids === "string" ? ids.split(",") : [ids];
          for (const id of targets) {
            const target = byId.get(String(id).trim());
            const targetVisibility = target?.name ? visibility.get(target.name) : undefined;
            if (!targetVisibility) throw new Error("Unknown target");
            const operation = String(action.visibility ?? action.action ?? "").toLowerCase().replace(/multiple$/, "");
            if (!["show", "hide"].includes(operation)) throw new Error("Unknown visibility action");
            targetVisibility.rules.push({ id: String(raw.id ?? index + 1), action: operation, link: String(raw.link ?? "All"), terms, raw: JSON.stringify(raw) });
          }
        }
      } catch { warnings.push(`Regla ${index + 1}: no se pudo interpretar completamente; se conserva el original para revisión`); }
    }
  } catch { warnings.push("No se pudo interpretar la lista de condiciones; se conserva el original para revisión"); }
  return { visibility, warnings, original };
}
