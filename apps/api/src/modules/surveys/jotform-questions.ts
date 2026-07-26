import type { QuestionType } from "@prisma/client";
import type { JotformQuestion } from "./jotform-client.js";

// Controles estructurales de Jotform — no son preguntas respondibles
// (encabezados, separadores de sección, botón de enviar).
const STRUCTURAL_TYPES = new Set([
  "control_head",
  "control_collapse",
  "control_button",
  "control_page",
  "control_pagebreak",
]);

// Tipo de control de Jotform → nuestro QuestionType. FREQUENCY no tiene
// equivalente automático (estructuralmente es igual a un radio/dropdown) —
// el admin lo corrige a mano con PATCH /questions/:id, igual que hoy.
const TYPE_MAP: Partial<Record<string, QuestionType>> = {
  control_scale: "LIKERT",
  control_radio: "ONE_ANSWER",
  control_dropdown: "ONE_ANSWER",
  control_checkbox: "ONE_ANSWER",
  control_textarea: "OPEN_TEXT",
  control_textbox: "OPEN_TEXT",
};

// Compara etiquetas de pregunta sin distinguir mayúsculas ni acentos, para
// que "Tipo de Programa" (Jotform) matchee "TIPO DE PROGRAMA" (env var).
export function normalizeLabel(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

// CATALOG_DATA="GRUPO,GRADO,TIPO DE PROGRAMA,EDAD" → lista normalizada.
export function parseCatalogLabels(catalogData: string): string[] {
  return catalogData
    .split(",")
    .map((s) => normalizeLabel(s))
    .filter((s) => s.length > 0);
}

// "A|B|C" (formato de Jotform) → ["A", "B", "C"].
function splitOptions(options: string | undefined): string[] {
  return options ? options.split("|").map((o) => o.trim()).filter((o) => o.length > 0) : [];
}

export type MappedQuestion = { externalId: string; text: string; type: QuestionType; options: string[] };
export type CatalogMatch = { key: string; label: string; options: string[] };
export type MapQuestionsResult = {
  scoredQuestions: MappedQuestion[];
  catalogMatches: CatalogMatch[];
  skipped: { externalId: string; type: string }[];
};

/**
 * Separa las preguntas de un formulario en tres grupos:
 * - scoredQuestions: preguntas reales que se ponderan (Question).
 * - catalogMatches: preguntas cuyo texto coincide con CATALOG_DATA — se
 *   guardan como CatalogField (label + opciones), no como Question.
 * - skipped: tipos de control que no sabemos mapear (ninguno hoy, salvo que
 *   Jotform agregue un tipo nuevo) — el admin las revisa manualmente.
 * externalId = Jotform `name` (ej. "q3_dropdown1"): es el único identificador
 * estable presente tanto en la API de preguntas como en las respuestas
 * (webhook y API de submissions), a diferencia de `qid` que no viaja en el
 * webhook real.
 */
export function mapJotformQuestions(questions: JotformQuestion[], catalogLabels: string[]): MapQuestionsResult {
  const scoredQuestions: MappedQuestion[] = [];
  const catalogMatches: CatalogMatch[] = [];
  const skipped: { externalId: string; type: string }[] = [];

  for (const q of questions) {
    if (STRUCTURAL_TYPES.has(q.type)) continue;

    const normalized = normalizeLabel(q.text);
    if (catalogLabels.includes(normalized)) {
      catalogMatches.push({ key: normalized, label: q.text, options: splitOptions(q.options) });
      continue;
    }

    const type = TYPE_MAP[q.type];
    if (!type) {
      skipped.push({ externalId: q.name, type: q.type });
      continue;
    }
    scoredQuestions.push({ externalId: q.name, text: q.text, type, options: splitOptions(q.options) });
  }

  return { scoredQuestions, catalogMatches, skipped };
}
