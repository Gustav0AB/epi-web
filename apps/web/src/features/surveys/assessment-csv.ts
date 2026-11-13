import { parseCsvRows } from "@epi/shared";

export type AssessmentQuestion = { question: string; type: "one_answer" | "likert" | "frequency" | "informativa"; maxScore: number | null; subcategory: string | null; correctAnswer: string | null; exclude: boolean };
export type AssessmentColumn = { column: number; question: AssessmentQuestion; options: string[]; optionScores: (number | null)[]; warnings: string[] };
export type AssessmentParseResult = { columns: AssessmentColumn[]; warnings: { column: number; message: string }[] };

// El formato documenta filas desde 1; estos índices corresponden a arreglos desde 0.
const ROW = { subcategory: 1, question: 2, postOnly: 4, type: 5, correct: 6, optionStart: 7, max: 13, optionScoreStart: 14, minimumRows: 19 } as const;
const TYPES = { one_answer: "one_answer", likert: "likert", frequency: "frequency", other: "informativa" } as const;
const numberValue = (value: string): number | null => {
  const text = value.trim().replace(",", ".");
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(text)) return null;
  const valueNumber = Number(text);
  return Number.isFinite(valueNumber) ? valueNumber : null;
};
export function parseAssessmentCsv(text: string): AssessmentParseResult {
  if (!text.trim()) throw new Error("El archivo está vacío.");
  let rows: string[][];
  try { rows = parseCsvRows(text, true); } catch { throw new Error("El CSV no tiene comillas o delimitadores válidos."); }
  if (rows.length < ROW.minimumRows) throw new Error("Faltan filas del formato Assessment: se esperan al menos 19.");
  const width = Math.max(...rows.map(row => row.length));
  if (width > 2000) throw new Error("El archivo tiene demasiadas columnas.");
  const columns: AssessmentColumn[] = [], warnings: AssessmentParseResult["warnings"] = [];
  for (let column = 0; column < width; column++) {
    const cell = (row: number) => (rows[row]?.[column] ?? "").trim();
    const question = cell(ROW.question), typeText = cell(ROW.type).toLowerCase();
    if (!question || (typeText === "question type" && /^question(?:\s+(?:pre|post))?$/i.test(question))) continue;
    if (!typeText) {
      if (!/^(question|pregunta)$/i.test(question)) warnings.push({ column: column + 1, message: `Falta el tipo de «${question}»; no se importó.` });
      continue;
    }
    const type = TYPES[typeText as keyof typeof TYPES];
    if (!type) { warnings.push({ column: column + 1, message: `Tipo desconocido «${cell(ROW.type)}» para «${question}»; no se importó.` }); continue; }
    const options = Array.from({ length: 5 }, (_, i) => cell(ROW.optionStart + i));
    const issues: string[] = [];
    const letter = cell(ROW.correct).toUpperCase();
    const correctAnswer = type === "one_answer" && /^[A-E]$/.test(letter) ? options[letter.charCodeAt(0) - 65] || null : null;
    if (type === "one_answer" && !correctAnswer) issues.push("La letra correcta no tiene una opción válida.");
    const optionScores = options.map((_, i) => numberValue(cell(ROW.optionScoreStart + i)));
    const scores = optionScores.filter((score): score is number => score !== null);
    const maxScore = type === "one_answer" ? scores.length ? Math.max(...scores) : null : type === "likert" || type === "frequency" ? numberValue(cell(ROW.max)) : null;
    if (type !== "informativa" && maxScore === null) issues.push("No se encontró un puntaje máximo numérico.");
    columns.push({ column: column + 1, question: { question, type, maxScore, subcategory: cell(ROW.subcategory) || null, correctAnswer, exclude: cell(ROW.postOnly).toLowerCase() === "post only" }, options, optionScores, warnings: issues });
  }
  if (!columns.length && !warnings.length) throw new Error("No se encontraron preguntas con un tipo reconocido.");
  return { columns, warnings };
}
export function parseAssessmentQuestions(text: string): AssessmentQuestion[] {
  return parseAssessmentCsv(text).columns.map(item => item.question);
}
