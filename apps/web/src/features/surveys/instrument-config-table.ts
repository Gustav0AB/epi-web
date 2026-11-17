import { correctAnswerValues, csvCell, parseCsv, questionSection, questionClassification, instrumentQuestion, preserveOpenQuestion, SurveySetupDraftSchema, SurveySetupQuestionSchema, type SurveySetupDraft, type SurveySetupQuestion, type CategoryDto } from "@epi/shared";

export const encodeCorrectAnswers = (values: string[]) => values.length > 1 ? JSON.stringify(values) : values[0] ?? "";
export function decodeCorrectAnswers(value: string, options: string[]): string[] {
  if (!value) return [];
  if (options.includes(value)) return [value];
  try { const parsed: unknown = JSON.parse(value); return Array.isArray(parsed) && parsed.every(item => typeof item === "string") ? parsed : [value]; } catch { return [value]; }
}
export type ConfigQuestion = SurveySetupQuestion & { options: string[]; controlType?: string };
export type ConfigRow = Record<string, string>;
export const responseTypes = { LIKERT: "Escala Likert", ONE_ANSWER: "Respuesta correcta", FREQUENCY: "Frecuencia", OPEN_TEXT: "Texto abierto" };
export const questionRoles = { SCORED: "Evaluable", INFORMATIONAL: "Informativa", IDENTIFIER: "Identificador", MOMENT: "Momento de aplicación", SCHOOL_GROUP: "Escuela / Grupo", ACTIVITY: "Actividad / Curso", GENDER: "Género", AGE: "Edad", EXCLUDED: "Excluir" };
export const configColumns = ["Sección", "Pregunta", "Tipo de respuesta", "Rol de la pregunta", "Subcategoría", "Usar como filtro", "Método de puntuación", "Puntaje máximo", "Peso de pregunta", "Respuesta correcta", "Puntuación inversa", "Peso subcategoría (%)", "Peso categoría (%)"];
export const questionColumns = configColumns.slice(0, 6);
export const scoreColumns = configColumns.slice(6);
export const configRowKey = (row: ConfigRow) => JSON.stringify([normalized(row["Sección"] ?? ""), normalized(row.Pregunta ?? "")]);
export const hasScoreValues = (row: ConfigRow) => Object.entries(row).some(([key, value]) => (scoreColumns.includes(key) || /^No puntuable \d+$/.test(key)) && value.trim());
export const optionColumn = (kind: "Respuesta" | "Etiqueta de filtro" | "No puntuable" | "Momento", index: number) => `${kind} ${index + 1}`;
export function configHeaders(optionCount: number) {
  return [...configColumns, ...(["Respuesta", "Etiqueta de filtro", "No puntuable", "Momento"] as const).flatMap(kind => Array.from({ length: optionCount }, (_, i) => optionColumn(kind, i)))];
}
export const categoryLabel = (category: string, subcategory: string) => `${subcategory} (${category})`;
const normalized = (value: string) => value.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("es");
const unsafe = (value: string) => /^[=+@\-'\t\r]/.test(value);
const protect = (value: string) => unsafe(value) ? "'" + value : value;
const unprotect = (value: string) => value.startsWith("'") && unsafe(value.slice(1)) ? value.slice(1) : value;
export function instrumentConfigRows(draft: SurveySetupDraft, questions: ConfigQuestion[]) {
  const weights = draft.analysisWeights?.find(item => item.analysisType === "pre_post");
  const visible = questions.filter(question => !question.sourceContext?.matrixParent);
  const headers = configHeaders(Math.min(500, Math.max(0, ...visible.map(question => question.options.length)) + 3));
  const rows = visible.map(question => {
    const rule = question.analysisScoring?.find(rule => rule.analysisType === "pre_post");
    const group = questionClassification(question);
    const legacy = rule && (rule.optionScores !== undefined || rule.numericRange !== undefined || rule.scoringMode === "option_scores" || rule.scoringMode === "numeric_range");
    const row: ConfigRow = {
      "Sección": questionSection(question).label, "Pregunta": question.text, "Tipo de respuesta": responseTypes[question.type],
      "Rol de la pregunta": questionRoles[question.role === "FILTER" ? "INFORMATIONAL" : question.role ?? "SCORED"],
      "Subcategoría": group?.subcategory ? categoryLabel(group.category, group.subcategory) : "",
      "Usar como filtro": question.isFilter || question.role === "FILTER" ? "Sí" : "No",
      "Método de puntuación": legacy ? "Requiere revisión" : rule?.scoringMode === "ordered_scale" ? "Escala" : question.type === "ONE_ANSWER" ? "Respuesta correcta" : "Escala",
      "Puntaje máximo": String(rule?.maxScore ?? ""), "Peso de pregunta": String(question.weight?.factor ?? 1),
      "Respuesta correcta": encodeCorrectAnswers(correctAnswerValues(rule)), "Puntuación inversa": rule?.inverse ? "Sí" : "No",
      "Peso subcategoría (%)": String(weights?.subcategoryWeights.find(item => item.category === group?.category && item.subcategory === group?.subcategory)?.weight ?? ""),
      "Peso categoría (%)": String(weights?.categoryWeights.find(item => item.category === group?.category)?.weight ?? ""),
    };
    question.options.forEach((value, index) => {
      row[optionColumn("Respuesta", index)] = value;
      row[optionColumn("Etiqueta de filtro", index)] = question.optionLabels?.find(item => item.value === value)?.label ?? value;
      row[optionColumn("No puntuable", index)] = rule?.excludedOptions?.includes(value) ? "Sí" : "No";
      row[optionColumn("Momento", index)] = question.momentMappings?.find(item => item.value === value)?.moment ?? "";
    });
    return row;
  });
  return { headers, rows };
}
export function blankInstrumentConfig(row: ConfigRow): ConfigRow {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, ["Sección", "Pregunta", "Tipo de respuesta"].includes(key) || /^Respuesta \d+$/.test(key) ? value : ""]));
}
export function exportInstrumentTableCsv(draft: SurveySetupDraft, questions: ConfigQuestion[], blank = false) {
  const { headers, rows: configuredRows } = instrumentConfigRows(draft, questions);
  const rows = blank ? configuredRows.map(blankInstrumentConfig) : configuredRows;
  return "\uFEFF" + [headers.map(csvCell).join(","), ...rows.map(row => headers.map(header => csvCell(protect(row[header] ?? ""))).join(","))].join("\r\n");
}
export function readInstrumentTableCsv(text: string): ConfigRow[] {
  if (text.length > 2 * 1024 * 1024) throw Error("El archivo supera 2 MB");
  return parseCsv(text, { strict: true, requiredHeaders: configColumns }).map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, unprotect(value)])));
}
export type ConfigMatch = { row: number; question: string; target: string; status: "Compatible" | "Opciones diferentes" | "No encontrada" | "Ambigua"; detail: string };
export type TableConfigPreview = { draft: SurveySetupDraft | null; errors: { row: number; message: string }[]; matches: ConfigMatch[]; questionCount: number; unchanged: number };
export function previewInstrumentTable(rows: ConfigRow[], draft: SurveySetupDraft, questions: ConfigQuestion[], categories: CategoryDto[], scoringRows?: ConfigRow[]): TableConfigPreview {
  const errors: TableConfigPreview["errors"] = [], matches: ConfigMatch[] = [], edits = new Map<string, ConfigQuestion>();
  const fail = (row: number, message: string) => errors.push({ row, message });
  const scoring = new Map<string, ConfigRow>();
  const questionKeys = new Set(rows.map(configRowKey));
  scoringRows?.forEach((row, index) => {
    if (!hasScoreValues(row)) return;
    const key = configRowKey(row);
    if (!questionKeys.has(key)) { fail(index + 2, "Ponderaciones: no hay una fila con esta sección y pregunta en Preguntas"); return; }
    if (scoring.has(key)) { fail(index + 2, "Ponderaciones: pregunta repetida"); return; }
    scoring.set(key, row);
  });
  const source = questions.filter(question => !question.sourceContext?.matrixParent);
  const seen = new Set<string>();
  const categoryWeights = new Map<string, number | null>(), subcategoryWeights = new Map<string, { category: string; subcategory: string; weight: number | null }>();
  const percent = (value: string, line: number) => {
    if (!value.trim()) return null;
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0 || number > 100) fail(line, "Los porcentajes deben estar entre 0 y 100");
    return number;
  };
  const bool = (value: string, line: number) => {
    if (!["sí", "si", "no", "true", "false", ""].includes(normalized(value))) fail(line, "Usa Sí o No en los selectores");
    return ["sí", "si", "true"].includes(normalized(value));
  };
  const decode = <T extends string>(labels: Record<T, string>, value: string) => (Object.keys(labels) as T[]).find(key => normalized(value) === normalized(labels[key]) || value === key);
  if (!rows.length || rows.length > 500) fail(1, "El archivo debe contener entre 1 y 500 preguntas");
  rows.slice(0, 500).forEach((row, index) => {
    const line = index + 2;
    if ((scoringRows === undefined ? configColumns : questionColumns).some(column => row[column] === undefined)) { fail(line, "Faltan columnas de configuración"); return; }
    const candidates = source.filter(question => normalized(question.text) === normalized(row.Pregunta!));
    const sameSection = candidates.filter(question => normalized(questionSection(question).label) === normalized(row["Sección"]!));
    const target = candidates.length === 1 ? candidates[0] : sameSection.length === 1 ? sameSection[0] : undefined;
    if (!target) {
      matches.push({ row: line, question: row.Pregunta!, target: "—", status: candidates.length ? "Ambigua" : "No encontrada", detail: candidates.length ? "Hay preguntas iguales: especifica su sección exacta. No se aplicará esta fila." : "Esta pregunta no existe en el instrumento seleccionado. Se omitirá." });
      return;
    }
    if (seen.has(target.externalId)) { fail(line, "Dos filas corresponden a la misma pregunta"); return; }
    seen.add(target.externalId);
    const answerColumns = Object.keys(row).filter(key => /^Respuesta \d+$/.test(key)).sort((a, b) => Number(a.split(" ")[1]) - Number(b.split(" ")[1]));
    const answerCells = answerColumns.map(key => row[key]!.trim());
    while (answerCells[answerCells.length - 1] === "") answerCells.pop();
    if (JSON.stringify(answerCells) !== JSON.stringify(target.options.map(value => value.trim()))) {
      matches.push({ row: line, question: row.Pregunta!, target: target.text, status: "Opciones diferentes", detail: `No se aplicará. Opciones actuales, en orden: ${target.options.join(" | ") || "Texto abierto"}` });
      return;
    }
    matches.push({ row: line, question: row.Pregunta!, target: target.text, status: "Compatible", detail: "Se cargará su configuración; el texto y las respuestas originales se conservan." });
    const type = decode(responseTypes, row["Tipo de respuesta"]!);
    const role = decode(questionRoles, row["Rol de la pregunta"]!);
    if (!type || !role) { fail(line, "Tipo de respuesta o rol desconocido"); return; }
    if (target.type === "OPEN_TEXT" && (type !== "OPEN_TEXT" || role === "SCORED")) { fail(line, "El texto abierto no puede convertirse en evaluable"); return; }
    const subcategory = row["Subcategoría"]!.trim();
    const groups = categories.filter(item => item.isActive && item.subcategory && (categoryLabel(item.name, item.subcategory) === subcategory || item.subcategory === subcategory));
    const unique = [...new Map(groups.map(group => [JSON.stringify([group.name, group.subcategory]), group])).values()];
    if (subcategory && unique.length !== 1) { fail(line, "Subcategoría desconocida o ambigua en el catálogo del sitio"); return; }
    const group = unique[0];
    const score = scoringRows === undefined ? row : scoring.get(configRowKey(row));
    const scored = role === "SCORED" && type !== "OPEN_TEXT";
    const previous = target.analysisScoring?.find(rule => rule.analysisType === "pre_post");
    const cell = (column: string) => score?.[column]?.trim() ?? "";
    const factor = cell("Peso de pregunta") ? Number(cell("Peso de pregunta")) : target.weight?.factor ?? 1;
    const maximum = cell("Puntaje máximo") ? Number(cell("Puntaje máximo")) : previous?.maxScore ?? null;
    if (score && scored && (!Number.isInteger(factor) || factor < 1 || factor > 10)) fail(line, "El peso de pregunta debe ser entero de 1 a 10");
    if (score && scored && maximum !== null && (!Number.isFinite(maximum) || maximum < 0)) fail(line, "El puntaje máximo debe ser un número mayor o igual a cero");
    if (score && scored && !group && factor !== 1) fail(line, "Selecciona subcategoría para configurar el peso de la pregunta");
    const isFilter = bool(row["Usar como filtro"]!, line);
    if (isFilter && (!["control_radio", "control_dropdown", "control_yesno"].includes(target.controlType ?? "") || !target.options.length)) fail(line, "El control original de esta pregunta no admite filtro");
    const excluded = target.options.filter((value, i) => {
      const choice = cell(optionColumn("No puntuable", i));
      return choice ? bool(choice, line) : previous?.excludedOptions?.includes(value);
    });
    const inverse = cell("Puntuación inversa") ? bool(cell("Puntuación inversa"), line) : previous?.inverse ?? false;
    const method = normalized(cell("Método de puntuación"));
    const standard = method ? method === "respuesta correcta" : previous?.scoringMode !== "ordered_scale" && type === "ONE_ANSWER";
    const changesRule = !!score && scored && (scoringRows === undefined || ["Método de puntuación", "Puntaje máximo", "Respuesta correcta", "Puntuación inversa"].some(column => cell(column)) || target.options.some((_, i) => cell(optionColumn("No puntuable", i))));
    if (changesRule && method && method !== "respuesta correcta" && method !== "escala") fail(line, "Selecciona Respuesta correcta o Escala; las reglas antiguas requieren revisión");
    if (changesRule && !method && (previous?.optionScores || previous?.numericRange)) fail(line, "Selecciona un método antes de reemplazar la regla anterior");
    if (changesRule && standard && type !== "ONE_ANSWER") fail(line, "Respuesta correcta requiere el tipo Respuesta correcta");
    const correct = cell("Respuesta correcta") ? decodeCorrectAnswers(cell("Respuesta correcta"), target.options) : scoringRows !== undefined ? correctAnswerValues(previous) : [];
    if (changesRule && standard && (new Set(correct).size !== correct.length || correct.some(value => !target.options.includes(value)))) fail(line, "Las respuestas correctas deben existir y no repetirse");
    if (changesRule && standard && correct.some(value => excluded.includes(value))) fail(line, "Una respuesta correcta no puede ser no puntuable");
    const mappings = role === "MOMENT" ? target.options.flatMap((value, i) => {
      const moment = row[optionColumn("Momento", i)]?.trim();
      if (!moment) return [];
      if (moment !== "PRE" && moment !== "POST") { fail(line, "Momento: PRE o POST; seguimiento se asocia como complementario"); return []; }
      return [{ value, moment }];
    }) : target.momentMappings;
    const edit = { ...target, setupReviewed: false, type, role, classification: group ? { category: group.name, subcategory: group.subcategory } : { category: "", subcategory: null }, isFilter,
      weight: score && scored && group ? { category: group.name, subcategory: group.subcategory, maxScore: 0, correctAnswer: null, factor } : target.weight,
      optionLabels: target.options.map((value, i) => ({ value, label: row[optionColumn("Etiqueta de filtro", i)]?.trim() || value })), momentMappings: mappings,
      analysisScoring: changesRule ? [{ analysisType: "pre_post", scoringMode: standard ? "standard" : "ordered_scale", maxScore: maximum, correctAnswer: standard ? correct[0] ?? null : null, ...(standard && correct.length > 1 ? { correctAnswers: correct } : {}), excludedOptions: excluded, responsePolicy: { blank: "exclude", invalid: "review" }, ...(!standard ? { inverse, scaleOptions: [...target.options] } : {}) }] : target.analysisScoring,
    };
    const checked = SurveySetupQuestionSchema.safeParse(edit);
    if (!checked.success) { fail(line, checked.error.issues.map(issue => issue.message).join("; ")); return; }
    edits.set(target.externalId, instrumentQuestion(type === "OPEN_TEXT" ? preserveOpenQuestion({ ...target, ...checked.data }) : { ...target, ...checked.data }));
    if (group && scored && score) {
      if (cell("Peso categoría (%)") || scoringRows === undefined) {
        const weight = percent(cell("Peso categoría (%)"), line);
        if (categoryWeights.has(group.name) && categoryWeights.get(group.name) !== weight) fail(line, "El peso de categoría debe ser el mismo en todas sus preguntas");
        categoryWeights.set(group.name, weight);
      }
      if (cell("Peso subcategoría (%)") || scoringRows === undefined) {
        const weight = percent(cell("Peso subcategoría (%)"), line);
        const key = JSON.stringify([group.name, group.subcategory]);
        if (subcategoryWeights.has(key) && subcategoryWeights.get(key)!.weight !== weight) fail(line, "El peso de subcategoría debe ser el mismo en todas sus preguntas");
        subcategoryWeights.set(key, { category: group.name, subcategory: group.subcategory!, weight });
      }
    }
  });
  const weights = draft.analysisWeights?.find(item => item.analysisType === "pre_post");
  const input = { ...draft, configurationMode: "instrument", matrixDefaults: [], questions: questions.map(question => edits.get(question.externalId) ?? question), analysisWeights: !categoryWeights.size && !subcategoryWeights.size ? draft.analysisWeights : [{ ...weights, analysisType: "pre_post", categoryWeights: [...(weights?.categoryWeights ?? []).filter(item => !categoryWeights.has(item.category)), ...[...categoryWeights].map(([category, weight]) => ({ category, weight }))], subcategoryWeights: [...(weights?.subcategoryWeights ?? []).filter(item => !subcategoryWeights.has(JSON.stringify([item.category, item.subcategory]))), ...subcategoryWeights.values()] }] };
  const checked = SurveySetupDraftSchema.safeParse(input);
  if (!checked.success) fail(1, checked.error.issues.map(issue => issue.message).join("; "));
  if (!edits.size) fail(1, "No hay preguntas compatibles para aplicar");
  return { draft: !errors.length && checked.success ? checked.data : null, errors, matches, questionCount: edits.size, unchanged: source.length - edits.size };
}
