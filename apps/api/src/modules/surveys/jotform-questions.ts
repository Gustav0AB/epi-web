import { createHash } from "node:crypto";
import { incompleteLearningMoment, preserveOpenQuestion, questionClassification, WeightInputSchema, type WeightInput, type QuestionVisibility, type FormQuestionsPreviewDto, type SurveySetupQuestion } from "@epi/shared";
import type { QuestionType } from "@prisma/client";
import type { JotformQuestion } from "./jotform-client.js";

// Controles estructurales de Jotform — no son preguntas respondibles
// (encabezados, separadores de sección, botón de enviar).
const STRUCTURAL_TYPES = new Set([
  "control_head",
  "control_text",
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
  control_number: "OPEN_TEXT",
  control_email: "OPEN_TEXT",
  control_fullname: "OPEN_TEXT",
  control_yesno: "ONE_ANSWER",
  control_rating: "LIKERT",
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
function splitOptions(options: unknown): string[] {
  return typeof options === "string" ? options.split("|").map((o) => o.trim()).filter((o) => o.length > 0) : [];
}

export type MappedQuestion = { sourceContext?: SurveySetupQuestion["sourceContext"]; matrixOverride?: boolean | undefined; classification?: SurveySetupQuestion["classification"]; analysisScoring?: SurveySetupQuestion["analysisScoring"]; analysisParticipation?: SurveySetupQuestion["analysisParticipation"]; isFilter?: boolean; visibility?: QuestionVisibility; controlType?: string; optionLabels?: { value: string; label: string }[]; weight?: WeightInput; momentMappings?: { value: string; moment: "PRE" | "POST" | "POST_POST" }[]; role?: "SCORED" | "INFORMATIONAL" | "IDENTIFIER" | "MOMENT" | "FILTER" | "SCHOOL_GROUP" | "ACTIVITY" | "GENDER" | "AGE" | "EXCLUDED"; externalId: string; text: string; type: QuestionType; options: string[] };
export type CatalogMatch = { key: string; label: string; options: string[] };
export type MapQuestionsResult = {
  scoredQuestions: MappedQuestion[];
  catalogMatches: CatalogMatch[];
  skipped: FormQuestionsPreviewDto["skipped"];
};

/**
 * - scoredQuestions: preguntas configurables, incluidas las informativas.
 * - catalogMatches: opciones reutilizables; los controles soportados también
 *   se conservan como preguntas informativas para permitir asignarles una función.
 * - skipped: controles sin configuración compatible o identificador inequívoco.
 * externalId = Jotform `name` (ej. "q3_dropdown1"): es el único identificador
 * estable presente tanto en la API de preguntas como en las respuestas
 * (webhook y API de submissions), a diferencia de `qid` que no viaja en el
 * webhook real.
 */
export function mapJotformQuestions(questions: JotformQuestion[], catalogLabels: string[]): MapQuestionsResult {
  const scoredQuestions: MappedQuestion[] = [];
  const catalogMatches: CatalogMatch[] = [];
  const skipped: MapQuestionsResult["skipped"] = [];
  const names = new Map<string, number>();
  for (const question of questions) {
    if (!STRUCTURAL_TYPES.has(question.type) && question.name) names.set(question.name, (names.get(question.name) ?? 0) + 1);
  }

  let section: { externalId: string; text: string } | undefined;
  for (const q of questions) {
    if (q.type === "control_head" && q.name) section = { externalId: q.name, text: q.text };
    if (STRUCTURAL_TYPES.has(q.type)) continue;
    if (q.type === "control_matrix" && q.name && (names.get(q.name) ?? 0) === 1) {
      const rows = splitOptions(q.mrows);
      const options = splitOptions(q.mcolumns);
      if (!rows.length || !options.length || rows.length > 400 || new Set(rows).size !== rows.length || new Set(options).size !== options.length || (q.inputType != null && q.inputType !== "Radio Button")) {
        skipped.push({ externalId: q.name, text: q.text, type: q.type, reason: "Matriz sin filas/opciones inequívocas o con tipo de celda no compatible; se conserva el origen para revisión" });
        continue;
      }
      scoredQuestions.push({ externalId: q.name, text: q.text, type: "OPEN_TEXT", role: "INFORMATIONAL", options: [], controlType: q.type, sourceContext: { ...(section ? { section } : {}), matrixParent: true } });
      const prefix = createHash("sha256").update(q.name).digest("hex").slice(0, 32);
      rows.forEach((rowLabel, rowIndex) => scoredQuestions.push({
        externalId: `matrix:${prefix}:${rowIndex}`, text: rowLabel, type: "LIKERT", options: [...options], controlType: q.type,
        sourceContext: { ...(section ? { section } : {}), matrix: { externalId: q.name!, text: q.text, rowKey: String(rowIndex), rowIndex, rowLabel, ...(q.qid ? { qid: q.qid } : {}) } },
      }));
      continue;
    }

    const ratingMaximum = typeof q.stars === "string" || typeof q.stars === "number" ? Number(q.stars) : NaN;
    const ratingReady = q.type !== "control_rating" || Number(q.scaleFrom) === 1 && Number.isSafeInteger(ratingMaximum) && ratingMaximum >= 1 && ratingMaximum <= 100;
    const reason = !q.name?.trim() ? "Falta el identificador de la pregunta"
      : (names.get(q.name) ?? 0) > 1 ? "Identificador repetido"
      : !TYPE_MAP[q.type] ? "Tipo de control pendiente de configuración"
      : !ratingReady ? "Valoración sin límites compatibles; se requiere revisar su escala original"
      : q.options != null && typeof q.options !== "string" ? "Opciones estructuradas pendientes de configuración"
      : undefined;
    if (reason) skipped.push({ externalId: q.name?.trim() ? q.name : `qid:${q.qid ?? "sin-id"}`, type: q.type, text: q.text, reason });
    if (!q.name?.trim() || (names.get(q.name) ?? 0) > 1) continue;

    const normalized = normalizeLabel(q.text);
    const isCatalog = catalogLabels.includes(normalized);
    if (isCatalog) {
      catalogMatches.push({ key: normalized, label: q.text, options: splitOptions(q.options) });
    }

    const type = TYPE_MAP[q.type];
    if (!type || reason) continue;
    scoredQuestions.push({ ...(isCatalog || type === "OPEN_TEXT" ? { role: "INFORMATIONAL" as const } : {}), ...(section ? { sourceContext: { section } } : {}), controlType: q.type, externalId: q.name, text: q.text, type, options: q.type === "control_rating" ? Array.from({ length: ratingMaximum }, (_, index) => String(index + 1)) : splitOptions(q.options) });
  }

  const repeated = new Set(scoredQuestions.filter((question, index) => scoredQuestions.findIndex(item => item.externalId === question.externalId) !== index).map(question => question.externalId));
  return { scoredQuestions: scoredQuestions.filter(question => !repeated.has(question.externalId)), catalogMatches, skipped: [...skipped, ...[...repeated].map(externalId => ({ externalId, type: "unknown", reason: "Identificador de fila/pregunta en conflicto" }))] };
}

/** Recheck IDs against the current form so upstream changes cannot silently drop edits. */
export function applySetupQuestions(questions: MappedQuestion[], edits: SurveySetupQuestion[] = [], version?: 2 | 3 | 4): MappedQuestion[] {
  const ids = new Set(questions.map((question) => question.externalId));
  if (edits.some((edit) => !ids.has(edit.externalId))) {
    throw Object.assign(new Error("Configured questions changed in Jotform; reopen and review the form"), { statusCode: 409, code: "CONFLICT" });
  }
  const byId = new Map(edits.map((edit) => [edit.externalId, edit]));
  return questions.map((question) => {
    const configured = byId.get(question.externalId);
    const edit = configured && question.type === "OPEN_TEXT" ? preserveOpenQuestion(configured) : configured;
    if (edit?.role === "MOMENT") {
      const mappings = edit.momentMappings ?? [];
      const invalid = version === 4
        ? incompleteLearningMoment({ options: question.options, momentMappings: mappings })
        : !question.options.length || mappings.length !== question.options.length || question.options.some((option) => !mappings.some((mapping) => mapping.value === option));
      if (invalid) {
        throw Object.assign(new Error("Relaciona al menos una respuesta con Pre y otra con Post; revisa las opciones actuales del momento."), { statusCode: 400, code: "BAD_REQUEST" });
      }
    }
    if ((edit?.isFilter || edit?.role === "FILTER") && (!["control_radio", "control_dropdown", "control_yesno"].includes(question.controlType ?? "") || !question.options.length || edit.optionLabels?.some((item) => !question.options.includes(item.value)))) {
      throw Object.assign(new Error("Filter options changed or are missing; review the form"), { statusCode: 400, code: "BAD_REQUEST" });
    }
    if (!edit) return { ...question };
    if (question.sourceContext?.matrix && edit.sourceContext?.matrix && JSON.stringify(question.sourceContext.matrix) !== JSON.stringify(edit.sourceContext.matrix)) throw Object.assign(new Error(`Las filas de la matriz cambiaron; revisa y confirma la fila: ${question.text}`), { statusCode: 409, code: "CONFLICT" });
    const { weight, text: _text, sourceContext: _context, ...configuration } = edit;
    const role = edit.role === "FILTER" ? "INFORMATIONAL" : edit.role ?? question.role ?? "SCORED";
    const isFilter = edit.isFilter ?? (edit.role === "FILTER" || question.isFilter === true);
    if (version === 3 || version === 4) {
      const classification = questionClassification(edit);
      const oldWeight = WeightInputSchema.safeParse(weight);
      return { ...question, ...configuration, ...(classification ? { classification } : {}), role, isFilter, momentMappings: edit.momentMappings ?? [], optionLabels: edit.optionLabels ?? [], ...(oldWeight.success && role === "SCORED" && edit.type !== "OPEN_TEXT" ? { weight: oldWeight.data } : {}) };
    }
    if (weight) {
      const parsed = WeightInputSchema.safeParse(weight);
      if (role !== "SCORED" || edit.type === "OPEN_TEXT" || !parsed.success || (edit.type === "ONE_ANSWER" && (!parsed.data.correctAnswer || (question.options.length > 0 && !question.options.includes(parsed.data.correctAnswer))))) {
        throw Object.assign(new Error(`Complete or remove the weight for question ${edit.externalId}`), { statusCode: 400, code: "BAD_REQUEST" });
      }
      return { ...question, ...configuration, role, isFilter, momentMappings: edit.momentMappings ?? [], optionLabels: edit.optionLabels ?? [], weight: parsed.data };
    }
    return { ...question, ...configuration, role, isFilter, momentMappings: edit.momentMappings ?? [], optionLabels: edit.optionLabels ?? [] };
  });
}
