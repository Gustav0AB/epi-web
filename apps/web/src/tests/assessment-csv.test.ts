import { describe, expect, it } from "vitest";
import { csvCell, SurveySetupDraftSchema, type CategoryDto } from "@epi/shared";
import { parseAssessmentCsv, parseAssessmentQuestions } from "../features/surveys/assessment-csv";
import { assessmentCategoryKey, previewAssessmentImport } from "../features/surveys/assessment-import";
import type { ConfigQuestion } from "../features/surveys/instrument-config-table";

const sheet = (...columns: string[][]) => Array.from({ length: 19 }, (_, row) => columns.map(column => csvCell(column[row] ?? "")).join(",")).join("\r\n");
function column(type: string, question: string, letter = "C") {
  const rows = Array<string>(19).fill(""); rows[1] = "Knowledge"; rows[2] = question; rows[5] = type; rows[6] = letter;
  ["Alpha", "Beta", "Mutualistic", "Delta", "Echo"].forEach((value, i) => { rows[7 + i] = value; rows[14 + i] = String(i + 1); }); rows[13] = "0,43";
  return rows;
}
const category: CategoryDto = { id: "cat", organizationId: "org", name: "Learning", subcategory: "Knowledge", isActive: true };
const target: ConfigQuestion = { externalId: "target", text: "¿Pregunta?", type: "ONE_ANSWER", role: "SCORED", controlType: "control_radio", options: ["Alpha", "Beta", "Mutualistic", "Delta", "Echo"], classification: null, weight: null, analysisScoring: null };
const draft = SurveySetupDraftSchema.parse({ siteId: "11111111-1111-4111-8111-111111111111", type: "LOCAL", instrumentName: "Destino", activityName: "Curso", configurationMode: "instrument", scoringWeightsVersion: 4, questions: [target], analysisWeights: [{ analysisType: "pre_post", categoryWeights: [], subcategoryWeights: [] }] });

describe("Assessment CSV", () => {
 it("reads A–E answer keys, ordered types, quoted text, decimals and post-only without deleting them", () => {
  const keys = ["A", "B", "C", "D", "E"].map(letter => column("One_Answer", `Pregunta ${letter}`, letter));
  const likert = column("Likert", '¿Por qué, "cuidar"?\nExplica');
  const frequency = column("Frequency", "Frecuencia"); frequency[4] = "POST ONLY";
  const other = column("Other", "Texto libre");
  const parsed = parseAssessmentQuestions(sheet(...keys, likert, frequency, other));
  expect(parsed.map(item => item.correctAnswer)).toEqual(["Alpha", "Beta", "Mutualistic", "Delta", "Echo", null, null, null]);
  expect(parsed.slice(0, 5).every(item => item.type === "one_answer" && item.maxScore === 5 && item.subcategory === "Knowledge")).toBe(true);
  expect(parsed[5]).toMatchObject({ type: "likert", maxScore: 0.43, question: '¿Por qué, "cuidar"?\nExplica' });
  expect(parsed[6]).toMatchObject({ type: "frequency", maxScore: 0.43, exclude: true });
  expect(parsed[7]).toMatchObject({ type: "informativa", maxScore: null, correctAnswer: null });
 });
 it("keeps 66 synthetic questions and all post-only markers", () => {
  const groups: [string, number][] = [["One_Answer", 13], ["Likert", 33], ["Frequency", 16], ["Other", 4]];
  const input = groups.flatMap(([type, count]) => Array.from({ length: count }, (_, i) => column(type, `${type} ${i}`)));
  for (const index of [2, 25, 55]) input[index]![4] = "Post Only";
  const questions = parseAssessmentQuestions(sheet(...input));
  expect(questions).toHaveLength(66); expect(questions.filter(item => item.exclude)).toHaveLength(3);
  expect(["one_answer", "likert", "frequency", "informativa"].map(type => questions.filter(item => item.type === type).length)).toEqual([13, 33, 16, 4]);
 });
 it("ignores the Assessment auxiliary column instead of warning about it", () => {
  const auxiliary = column("Question type", "Question Pre");
  const result = parseAssessmentCsv(sheet(auxiliary, column("Likert", "Pregunta real")));
  expect(result.columns).toHaveLength(1); expect(result.warnings).toEqual([]);
 });
 it("keeps valid questions when individual columns have invalid or missing data", () => {
  const invalid = column("One_Answer", "Mala", "Z"); invalid[14] = ""; invalid[15] = "NaN"; invalid[16] = ""; invalid[17] = ""; invalid[18] = "";
  const unknown = column("Unknown", "Sin tipo"); const blank = column("Likert", "");
  const result = parseAssessmentCsv(sheet(column("Likert", "Buena"), invalid, unknown, blank));
  expect(result.columns).toHaveLength(2); expect(result.columns[1]!.question).toMatchObject({ correctAnswer: null, maxScore: null });
  expect(result.columns[1]!.warnings).toHaveLength(2); expect(result.warnings[0]!.column).toBe(3);
 });
 it("rejects empty, truncated and malformed CSV", () => {
  expect(() => parseAssessmentCsv("")).toThrow(/vacío/); expect(() => parseAssessmentCsv("a,b\nc,d")).toThrow(/19/); expect(() => parseAssessmentCsv('"sin cerrar')).toThrow(/CSV/);
 });
 it("previews a matching question without saving or copying identifiers, and keeps Post Only for review", () => {
  const original = column("One_Answer", "¿Pregunta?"); const initial = JSON.stringify(draft);
  const result = previewAssessmentImport(parseAssessmentCsv(sheet(original)), draft, [target], [category], []);
  expect(result.errors).toEqual([]); expect(result.count).toBe(1); expect(result.draft?.questions?.[0]?.externalId).toBe("target");
  expect(result.draft?.questions?.[0]).toMatchObject({ role: "SCORED", classification: { category: "Learning", subcategory: "Knowledge" }, setupReviewed: true });
  expect(result.draft?.questions?.[0]?.analysisScoring?.[0]).toMatchObject({ maxScore: 5, correctAnswer: "Mutualistic" });
  expect(JSON.stringify(draft)).toBe(initial);
  original[4] = "Post Only";
  const postOnly = previewAssessmentImport(parseAssessmentCsv(sheet(original)), draft, [target], [category], []);
  expect(postOnly.rows[0]).toMatchObject({ postOnly: true, status: "Post Only: requiere revisión" }); expect(postOnly.draft).toBeNull();
 });
 it("matches a unique truncated matrix row and imports its frequency type", () => {
  const text = "Una pregunta suficientemente larga para reconocer la fila completa";
  const matrix: ConfigQuestion = { ...target, text, type: "LIKERT", sourceContext: { matrix: { externalId: "matrix", text: "Título de matriz", rowKey: "0", rowIndex: 0, rowLabel: text } } };
  const legacy = column("Frequency", "Título anterior >> Una pregunta suficientemente larga...");
  ["0.09", "0.17", "0.26", "0.34", "0.43"].forEach((value, index) => { legacy[14 + index] = value; });
  const input = parseAssessmentCsv(sheet(legacy));
  const result = previewAssessmentImport(input, draft, [matrix], [category], []);
  expect(result.count).toBe(1); expect(result.errors).toEqual([]);
  expect(result.rows[0]).toMatchObject({ matchedQuestion: text, status: "Lista para cargar; revisar fila de matriz" });
  expect(result.draft?.questions?.[0]).toMatchObject({ type: "FREQUENCY", role: "SCORED", classification: { category: "Learning", subcategory: "Knowledge" }, setupReviewed: true, analysisScoring: [{ scoringMode: "ordered_scale", maxScore: 0.43, inverse: false }] });
  legacy[14] = "0.43"; legacy[15] = "0.34"; legacy[16] = "0.26"; legacy[17] = "0.17"; legacy[18] = "0.09";
  expect(previewAssessmentImport(parseAssessmentCsv(sheet(legacy)), draft, [matrix], [category], []).draft?.questions?.[0]?.analysisScoring?.[0]?.inverse).toBe(false);
  legacy[16] = "0.40";
  expect(previewAssessmentImport(parseAssessmentCsv(sheet(legacy)), draft, [matrix], [category], []).draft?.questions?.[0]?.analysisScoring?.[0]?.inverse).toBe(false);
  expect(previewAssessmentImport(input, draft, [{ ...matrix, options: ["Alpha"] }], [category], []).count).toBe(0);
  expect(previewAssessmentImport(input, draft, [matrix, { ...matrix, externalId: "other", text: `${text} distinta` }], [category], []).count).toBe(0);
  expect(previewAssessmentImport(parseAssessmentCsv(sheet(column("Frequency", "Matriz >> Una..."))), draft, [matrix], [category], []).count).toBe(0);
 });
 it("marks previously imported matching questions reviewed without changing their configuration", () => {
  const input = parseAssessmentCsv(sheet(column("One_Answer", "¿Pregunta?")));
  const first = previewAssessmentImport(input, draft, [target], [category], []);
  const existing = { ...target, ...first.draft!.questions![0]!, setupReviewed: false };
  const previous = { ...draft, questions: [existing] };
  const result = previewAssessmentImport(input, previous, [existing], [category], [target.externalId]);
  expect(result.count).toBe(1);
  expect(result.rows[0]?.status).toBe("Configuración coincidente; marcar revisada");
  expect(result.draft?.questions?.[0]).toEqual({ ...existing, setupReviewed: true });
  const changed = { ...existing, analysisScoring: [{ ...existing.analysisScoring![0]!, maxScore: 3 }] };
  expect(previewAssessmentImport(input, previous, [changed], [category], [target.externalId]).count).toBe(0);
 });
 it("lets the user map an unknown or ambiguous subcategory to an active catalog entry", () => {
  const first = column("One_Answer", "¿Pregunta?"); first[1] = "Nombre anterior";
  const second = column("One_Answer", "Otra pregunta"); second[1] = "Nombre anterior";
  const other = { ...target, externalId: "other", text: "Otra pregunta" };
  const input = parseAssessmentCsv(sheet(first, second));
  const pending = previewAssessmentImport(input, draft, [target, other], [category], []);
  expect(pending.count).toBe(0);
  expect(pending.rows[0]).toMatchObject({ subcategory: "Nombre anterior", needsCategoryChoice: true });
  const selection = { [assessmentCategoryKey("Nombre anterior", input.columns[0]!.column)]: category.id };
  const result = previewAssessmentImport(input, draft, [target, other], [category], [], {}, selection);
  expect(result.count).toBe(2);
  expect(result.draft?.questions?.every(question => question.setupReviewed && question.classification?.subcategory === "Knowledge")).toBe(true);
  expect(previewAssessmentImport(input, draft, [target], [{ ...category, isActive: false }], [], {}, selection).count).toBe(0);
  const ambiguous = previewAssessmentImport(parseAssessmentCsv(sheet(column("One_Answer", "¿Pregunta?"))), draft, [target], [category, { ...category, id: "other-category", name: "Other" }], [], {}, { knowledge: "other-category" });
  expect(ambiguous.draft?.questions?.[0]?.classification).toMatchObject({ category: "Other", subcategory: "Knowledge" });
 });
 it("keeps imported informational questions pending review", () => {
  const informational = { ...target, text: "Información", role: "INFORMATIONAL" as const };
  const result = previewAssessmentImport(parseAssessmentCsv(sheet(column("Other", "Información"))), draft, [informational], [category], []);
  expect(result.count).toBe(1);
  expect(result.draft?.questions?.[0]).toMatchObject({ role: "INFORMATIONAL", setupReviewed: false });
 });
 it("offers changed questions with identical options only after explicit confirmation", () => {
  const input = parseAssessmentCsv(sheet(column("One_Answer", "Texto anterior")));
  const pending = previewAssessmentImport(input, draft, [target], [category], []);
  expect(pending.rows[0]).toMatchObject({ status: "Coincidencia sugerida; confirmar", matchedQuestion: target.text });
  expect(pending.count).toBe(0);
  const accepted = previewAssessmentImport(input, draft, [target], [category], [], { [input.columns[0]!.column]: target.externalId });
  expect(accepted.count).toBe(1);
  expect(previewAssessmentImport(input, draft, [target], [category], [target.externalId], { [input.columns[0]!.column]: target.externalId }).count).toBe(0);
  expect(previewAssessmentImport(input, draft, [target, { ...target, externalId: "other" }], [category], []).rows[0]?.suggestedId).toBeNull();
 });
 it("does not overwrite reviewed questions or assume changed options and ambiguous categories", () => {
  const input = parseAssessmentCsv(sheet(column("One_Answer", "¿Pregunta?")));
  expect(previewAssessmentImport(input, draft, [target], [category], ["target"]).count).toBe(0);
  expect(previewAssessmentImport(input, draft, [{ ...target, options: ["Alpha"] }], [category], []).count).toBe(0);
  expect(previewAssessmentImport(input, draft, [target], [category, { ...category, id: "other", name: "Other" }], []).count).toBe(0);
 });
});
