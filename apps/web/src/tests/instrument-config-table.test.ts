import { instrumentDownloadName } from "../features/surveys/InstrumentConfigDownload";
import { prefillPreview } from "../features/surveys/instrument-prefill";
import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { zipSync, strToU8, unzipSync, strFromU8 } from "fflate";
import { assistantScoringReady, SurveySetupDraftSchema, type CategoryDto } from "@epi/shared";
import { exportInstrumentTableCsv, instrumentConfigRows, previewInstrumentTable, readInstrumentTableCsv, type ConfigQuestion } from "../features/surveys/instrument-config-table";
import { createInstrumentWorkbook, readInstrumentWorkbook } from "../features/surveys/instrument-config-workbook";
const category: CategoryDto = { id: "cat", organizationId: "org", name: "Learning", subcategory: "Knowledge", isActive: true };
const question: ConfigQuestion = { externalId: "source-q", text: '¿Por qué cuidar, "la naturaleza"?', type: "ONE_ANSWER", role: "SCORED", controlType: "control_radio", options: ["Para conservarla", "No sé"], classification: { category: "Learning", subcategory: "Knowledge" }, weight: { category: "Learning", subcategory: "Knowledge", maxScore: 0, correctAnswer: null, factor: 2 }, isFilter: true, analysisScoring: [{ analysisType: "pre_post", scoringMode: "standard", maxScore: 5, correctAnswer: "Para conservarla", responsePolicy: { blank: "exclude", invalid: "review" } }] };
const draft = SurveySetupDraftSchema.parse({ siteId: "11111111-1111-4111-8111-111111111111", type: "LOCAL", instrumentName: "Origen", activityName: "Curso", configurationMode: "instrument", scoringWeightsVersion: 4, questions: [question], analysisWeights: [{ analysisType: "pre_post", categoryWeights: [{ category: "Learning", weight: 100 }], subcategoryWeights: [{ category: "Learning", subcategory: "Knowledge", weight: 100 }] }] });
const rows = () => instrumentConfigRows(draft, [question]).rows;
const preview = (input = rows(), target = [question]) => previewInstrumentTable(input, draft, target, [category]);
const bytes = async (workbook: ExcelJS.Workbook) => new Uint8Array(await workbook.xlsx.writeBuffer()).buffer;
describe("portable one-row instrument configuration", () => {
 it("exports one row per question with no form or question identifiers and round trips usable rules", () => {
  const csv = exportInstrumentTableCsv(draft, [question]);
  expect(csv).not.toContain("source-q"); expect(csv).not.toContain("Origen"); expect(csv).not.toContain("formulario");
  const imported = readInstrumentTableCsv(csv); expect(imported).toHaveLength(1);
  const result = preview(imported); expect(result.errors).toEqual([]);
  expect(result.draft?.questions?.[0]?.weight?.factor).toBe(2);
  expect(assistantScoringReady([{ ...result.draft!.questions![0]!, options: question.options }])).toBe(true);
 });
 it("round trips multiple correct options in CSV and the Excel workbook", async () => {
  const multi = { ...question, analysisScoring: [{ ...question.analysisScoring![0]!, correctAnswers: [...question.options] }] };
  const csv = exportInstrumentTableCsv(draft, [multi]);
  const result = previewInstrumentTable(readInstrumentTableCsv(csv), draft, [multi], [category]);
  expect(result.errors).toEqual([]);
  expect(result.draft?.questions?.[0]?.analysisScoring?.[0]?.correctAnswers).toEqual(question.options);
  const workbook = createInstrumentWorkbook(draft, [multi], [category]);
  const imported = await readInstrumentWorkbook(await bytes(workbook));
  const fromExcel = previewInstrumentTable(imported.questions, draft, [multi], [category], imported.scores);
  expect(fromExcel.errors).toEqual([]);
  expect(fromExcel.draft?.questions?.[0]?.analysisScoring?.[0]?.correctAnswers).toEqual(question.options);
 });
 it("reuses the file against different IDs and preserves destination metadata and originals", () => {
  const target = { ...question, externalId: "new-id", sourceContext: { section: { externalId: "new-section", text: "Otra sección" } } };
  const ownDraft = { ...draft, analysisWeights: draft.analysisWeights!.map(rule => ({ ...rule, standardDeviation: "sample" as const })), instrumentName: "Destino", activityName: "Otro curso", baseDefinitionId: "22222222-2222-4222-8222-222222222222" };
  const before = JSON.stringify([target, ownDraft]);
  const result = previewInstrumentTable(rows(), ownDraft, [target], [category]);
  expect(result.errors).toEqual([]); expect(result.draft?.instrumentName).toBe("Destino"); expect(result.draft?.activityName).toBe("Otro curso"); expect(result.draft?.baseDefinitionId).toBe(ownDraft.baseDefinitionId);
  expect(result.draft?.analysisWeights?.[0]?.standardDeviation).toBe("sample");
  expect(result.draft?.questions?.[0]?.externalId).toBe("new-id"); expect(result.draft?.questions?.[0]?.sourceContext).toEqual(target.sourceContext); expect(JSON.stringify([target, ownDraft])).toBe(before);
 });
 it("applies compatible rows while preserving new questions and skipping removed or changed options", () => {
  const input = [...rows(), { ...rows()[0]!, Pregunta: "Una pregunta de otro instrumento" }];
  const other = { ...question, externalId: "new", text: "Una pregunta nueva", analysisScoring: null };
  const result = preview(input, [question, other]);
  expect(result.errors).toEqual([]); expect(result.questionCount).toBe(1); expect(result.unchanged).toBe(1); expect(result.matches[1]?.status).toBe("No encontrada"); expect(result.draft?.questions?.[1]?.analysisScoring).toBeNull();
  const changed = preview(rows(), [{ ...question, options: ["Otra opción", "No sé"] }]); expect(changed.draft).toBeNull(); expect(changed.matches[0]?.status).toBe("Opciones diferentes");
  const edited = rows(); edited[0]!["Respuesta 1"] = "Otra opción"; edited[0]!["Respuesta correcta"] = "Otra opción";
  expect(preview(edited, [{ ...question, options: ["Otra opción", "No sé"] }]).errors).toEqual([]);
 });
 it("requires sections to resolve duplicate question texts and rejects duplicate target rows", () => {
  const first = { ...question, sourceContext: { section: { externalId: "a", text: "Primera" } } };
  const second = { ...first, externalId: "second", sourceContext: { section: { externalId: "b", text: "Segunda" } } };
  expect(preview(rows(), [first, second]).matches[0]?.status).toBe("Ambigua");
  const input = rows(); input[0]!["Sección"] = "Segunda";
  expect(preview(input, [first, second]).draft?.questions?.[1]?.externalId).toBe("second");
  expect(preview([...rows(), ...rows()]).errors.some(error => error.message.includes("misma pregunta"))).toBe(true);
 });
 it("validates catalog, roles, filters, maxima, factors, answers and inconsistent group percentages atomically", () => {
  for (const [column, value] of [["Subcategoría", "Ajena"], ["Peso de pregunta", "11"], ["Puntaje máximo", "-1"], ["Respuesta correcta", "Desconocida"], ["No puntuable 1", "Sí"], ["Rol de la pregunta", "Desconocido"], ["Puntuación inversa", "Quizás"]]) {
   const input = rows(); input[0]![column!] = value!; expect(preview(input).draft, `${column}: ${value}`).toBeNull();
  }
  const target = { ...question, externalId: "b", text: "Otra pregunta" };
  const input = instrumentConfigRows(draft, [question, target]).rows; input[1]!["Peso categoría (%)"] = "50";
  expect(preview(input, [question, target]).errors.some(error => error.message.includes("mismo"))).toBe(true);
 });
 it("keeps free text unscored and configures scales in original order with inversion", () => {
  const open = { ...question, type: "OPEN_TEXT" as const, role: "INFORMATIONAL" as const, options: [], isFilter: false, weight: null, analysisScoring: null };
  const input = instrumentConfigRows(draft, [open]).rows;
  expect(preview(input, [open]).draft?.questions?.[0]?.analysisScoring).toBeNull();
  input[0]!["Rol de la pregunta"] = "Evaluable"; expect(preview(input, [open]).draft).toBeNull();
  const scale = rows(); scale[0]!["Tipo de respuesta"] = "Escala Likert"; scale[0]!["Método de puntuación"] = "Escala"; scale[0]!["Puntuación inversa"] = "Sí";
  const result = preview(scale); expect(result.errors).toEqual([]); expect(result.draft?.questions?.[0]?.analysisScoring?.[0]?.scaleOptions).toEqual(question.options); expect(result.draft?.questions?.[0]?.analysisScoring?.[0]?.inverse).toBe(true);
 });
 it("preserves formula-looking source text as literal CSV", () => {
  const target = { ...question, text: "=literal" }; const csv = exportInstrumentTableCsv(draft, [target]); expect(csv).toContain("'=literal"); expect(preview(readInstrumentTableCsv(csv), [target]).errors).toEqual([]);
 });
});
describe("plantilla y descarga de revisión", () => {
 it("deja vacía la configuración sin perder preguntas y opciones", async () => {
  const csvRows = readInstrumentTableCsv(exportInstrumentTableCsv(draft, [question], true));
  expect(csvRows[0]?.Pregunta).toBe(question.text);
  expect(csvRows[0]?.["Respuesta 1"]).toBe(question.options[0]);
  expect(csvRows[0]?.["Rol de la pregunta"]).toBe("");
  expect(csvRows[0]?.["Puntaje máximo"]).toBe("");
  const workbook = createInstrumentWorkbook(draft, [question], [category], true);
  const sheet = workbook.getWorksheet("Preguntas")!, scores = workbook.getWorksheet("Ponderaciones")!;
  expect(sheet.getCell("D2").value).toBe(""); expect(sheet.getCell("E2").value).toBe("");
  expect(scores.getCell("D2").value).toBe("");
  sheet.getCell("D2").value = "Evaluable"; sheet.getCell("E2").value = "Knowledge (Learning)";
  const imported = await readInstrumentWorkbook(await bytes(workbook));
  expect(previewInstrumentTable(imported.questions, draft, [question], [category], imported.scores).errors).toEqual([]);
 });
 it("usa nombre de instrumento, sitio y fecha sin caracteres de ruta", () => {
  expect(instrumentDownloadName("Curso / ambiente", "Sitio: norte", new Date(2026, 10, 12), "xlsx")).toBe("Curso ambiente-Sitio norte-11122026.xlsx");
 });
});
describe("Excel configuration validation and import", () => {
 it("writes four sheets with real list ranges and keeps step 2 separate from step 3", async () => {
  const buffer = await bytes(createInstrumentWorkbook(draft, [question], [category]));
  const read = new ExcelJS.Workbook(); await read.xlsx.load(buffer);
  expect(read.worksheets.map(sheet => sheet.name)).toEqual(["Instrucciones", "Catálogos", "Preguntas", "Ponderaciones"]);
  const sheet = read.getWorksheet("Preguntas")!, score = read.getWorksheet("Ponderaciones")!;
  expect(sheet.rowCount).toBe(2);
  expect(sheet.getRow(1).values).not.toContain("Puntaje máximo");
  expect(score.getRow(1).values).not.toContain("Rol de la pregunta");
  expect(sheet.getCell("D2").dataValidation.formulae).toEqual(["Roles"]);
  expect(sheet.getCell("E2").dataValidation.formulae).toEqual(["Subcategorias"]);
  expect(sheet.getCell("G2").dataValidation.formulae).toEqual(["OpcionesOriginales_1"]);
  expect(score.getCell("F2").dataValidation.formulae).toEqual(["Respuestas_1"]);
  expect(score.getCell("E2").dataValidation.formulae).toEqual(["Pesos"]);
  const xml = strFromU8(unzipSync(new Uint8Array(buffer))["xl/workbook.xml"]!);
  expect(xml).toMatch(/name="Roles"[^>]*>[^<]*Catálogos[^<]*\$D\$2:\$D\$10/);
  expect(xml).toMatch(/name="Subcategorias"[^>]*>[^<]*Catálogos[^<]*\$A\$2/);
  expect(read.getWorksheet("Catálogos")!.getCell("A2").value).toBe("Knowledge (Learning)");
  expect(read.getWorksheet("Catálogos")!.getCell("D2").value).toBe("Evaluable");
  const imported = await readInstrumentWorkbook(buffer);
  expect(previewInstrumentTable(imported.questions, draft, [question], [category], imported.scores).errors).toEqual([]);
 });
 it("imports just Questions, preserves existing scoring, and uses imported classification when both sheets are chosen", async () => {
  const replacement = {...category, id: "new-cat", name: "Action", subcategory: "Behavior"};
  const workbook = createInstrumentWorkbook(draft, [question], [category, replacement]);
  workbook.getWorksheet("Preguntas")!.getCell("E2").value = "Behavior (Action)";
  const score = workbook.getWorksheet("Ponderaciones")!;
  score.getCell("D2").value = 8;
  score.getCell("E2").value = 4;
  const imported = await readInstrumentWorkbook(await bytes(workbook));
  const only = previewInstrumentTable(imported.questions, draft, [question], [category, replacement], []);
  expect(only.errors).toEqual([]);
  expect(only.draft?.questions?.[0]?.classification).toEqual({category:"Action",subcategory:"Behavior"});
  expect(only.draft?.questions?.[0]?.analysisScoring).toEqual(question.analysisScoring);
  expect(only.draft?.questions?.[0]?.weight).toEqual(question.weight);
  expect(only.draft?.analysisWeights).toEqual(draft.analysisWeights);
  const both = previewInstrumentTable(imported.questions, draft, [question], [category, replacement], imported.scores);
  expect(both.errors).toEqual([]);
  expect(both.draft?.questions?.[0]?.analysisScoring?.[0]?.maxScore).toBe(8);
  expect(both.draft?.questions?.[0]?.weight?.factor).toBe(4);
  expect(both.draft?.analysisWeights?.[0]?.categoryWeights).toContainEqual({category:"Action",weight:100});
 });
 it("ignores blank scoring and keeps Questions available if Ponderaciones is invalid", async () => {
  const workbook = createInstrumentWorkbook(draft, [question], [category]);
  const score = workbook.getWorksheet("Ponderaciones")!;
  for (let i = 3; i <= score.columnCount; i++) score.getCell(2, i).value = null;
  const blank = await readInstrumentWorkbook(await bytes(workbook));
  expect(previewInstrumentTable(blank.questions, draft, [question], [category], blank.scores).draft?.questions?.[0]?.analysisScoring).toEqual(question.analysisScoring);
  score.getCell("D2").value = {formula:"1+1", result:2};
  const invalid = await readInstrumentWorkbook(await bytes(workbook));
  expect(invalid.scoreError).toContain("Ponderaciones!D2");
  expect(previewInstrumentTable(invalid.questions, draft, [question], [category], []).draft).not.toBeNull();
 });
 it("rejects formulas instead of trusting cached values, missing sheets and duplicate headers", async () => {
  const workbook = createInstrumentWorkbook(draft, [question], [category]);
  workbook.getWorksheet("Preguntas")!.getCell("H2").value = { formula: "1+1", result: 2 };
  await expect(readInstrumentWorkbook(await bytes(workbook))).rejects.toThrow("fórmulas");
  const missing = new ExcelJS.Workbook(); missing.addWorksheet("Otra"); await expect(readInstrumentWorkbook(await bytes(missing))).rejects.toThrow("Preguntas");
  const duplicate = createInstrumentWorkbook(draft, [question], [category]); duplicate.getWorksheet("Preguntas")!.getCell("C1").value = "Pregunta";
  await expect(readInstrumentWorkbook(await bytes(duplicate))).rejects.toThrow("Encabezados");
 });
 it("bounds file size and expansion before loading Excel content", async () => {
  await expect(readInstrumentWorkbook(new ArrayBuffer(2 * 1024 * 1024 + 1))).rejects.toThrow("2 MB");
  const bomb = zipSync({ "xl/worksheets/sheet1.xml": new Uint8Array(21 * 1024 * 1024) });
  await expect(readInstrumentWorkbook(new Uint8Array(bomb).buffer)).rejects.toThrow("20 MB");
  const macro = zipSync({ "xl/vbaProject.bin": strToU8("macro") });
  await expect(readInstrumentWorkbook(new Uint8Array(macro).buffer)).rejects.toThrow("macros");
 });
});

describe("prefill from another instrument", () => {
 it("copies matching question and scoring while preserving target identity and new questions", () => {
  const target = { ...question, externalId: "target-id", isFilter: false, weight: null, analysisScoring: null, classification: null };
  const extra = { ...target, externalId: "extra", text: "Otra pregunta" };
  const source = { ...question, isFilter: false };
  const result = prefillPreview({ ...draft, questions: [target, extra], analysisWeights: [] }, [target, extra], [category], { questions: [source], analysisWeights: draft.analysisWeights });
  expect(result.count).toBe(1); expect(result.total).toBe(2); expect(result.errors).toEqual([]);
  expect(result.draft?.questions?.[0]?.externalId).toBe("target-id");
  expect(result.draft?.questions?.[0]?.analysisScoring?.[0]?.maxScore).toBe(5);
  expect(result.draft?.questions?.[1]?.analysisScoring).toBeNull();
 });
 it("does not overwrite reviewed questions or infer ambiguous and changed options", () => {
  const target = { ...question, externalId: "target-id", setupReviewed: true };
  expect(prefillPreview(draft, [target], [category], { questions: [question], analysisWeights: draft.analysisWeights }).count).toBe(0);
  expect(prefillPreview(draft, [{ ...target, setupReviewed: false }], [category], { questions: [question, question], analysisWeights: draft.analysisWeights }).matches[0]?.status).toContain("Ambigua");
  expect(prefillPreview(draft, [{ ...target, setupReviewed: false, options: ["Distinta"] }], [category], { questions: [question], analysisWeights: draft.analysisWeights }).count).toBe(0);
 });
});

describe("prefilled workbook", () => {
 it("exports and reimports accepted scoring without transferring source IDs", async () => {
  const target = { ...question, externalId: "destination-id", isFilter: false, weight: null, analysisScoring: null, classification: null };
  const result = prefillPreview({ ...draft, questions: [target], analysisWeights: [] }, [target], [category], { questions: [{ ...question, isFilter: false }], analysisWeights: draft.analysisWeights });
  expect(result.draft).not.toBeNull();
  const configured = { ...target, ...result.draft!.questions![0]! };
  const workbook = createInstrumentWorkbook(result.draft!, [configured], [category]);
  const imported = await readInstrumentWorkbook(await bytes(workbook));
  const checked = previewInstrumentTable(imported.questions, { ...draft, questions: [target], analysisWeights: [] }, [target], [category], imported.scores);
  expect(checked.errors).toEqual([]);
  expect(checked.draft?.questions?.[0]?.analysisScoring?.[0]?.maxScore).toBe(5);
  expect(checked.draft?.questions?.[0]?.externalId).toBe("destination-id");
 });
});

describe("prefilled filters", () => {
 it("copies filter labels only for a compatible original control", () => {
  const target = { ...question, externalId: "target-filter", role: "INFORMATIONAL" as const, isFilter: false, weight: null, classification: null, analysisScoring: null };
  const source = { ...target, externalId: "source-filter", isFilter: true, optionLabels: [{ value: "No sé", label: "Sin respuesta" }] };
  const result = prefillPreview({ ...draft, questions: [target] }, [target], [category], { questions: [source], analysisWeights: draft.analysisWeights });
  expect(result.errors).toEqual([]);
  expect(result.draft?.questions?.[0]?.isFilter).toBe(true);
  expect(result.draft?.questions?.[0]?.optionLabels).toContainEqual({ value: "No sé", label: "Sin respuesta" });
 });
});
