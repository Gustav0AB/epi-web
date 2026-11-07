import ExcelJS from "exceljs";
import { unzipSync } from "fflate";
import type { CategoryDto, SurveySetupDraft } from "@epi/shared";
import { categoryLabel, configColumns, questionColumns, scoreColumns, instrumentConfigRows, questionRoles, responseTypes, type ConfigQuestion, type ConfigRow } from "./instrument-config-table";

export function createInstrumentWorkbook(draft: SurveySetupDraft, questions: ConfigQuestion[], categories: CategoryDto[]) {
  const workbook = new ExcelJS.Workbook();
  const note = workbook.addWorksheet("Instrucciones");
  const lists = workbook.addWorksheet("Catálogos");
  const frozen = { views: [{ state: "frozen" as const, xSplit: 2, ySplit: 1 }] };
  const sheet = workbook.addWorksheet("Preguntas", frozen);
  const scores = workbook.addWorksheet("Ponderaciones", frozen);
  const visible = questions.filter(question => !question.sourceContext?.matrixParent);
  const { headers, rows } = instrumentConfigRows(draft, questions);
  const questionsHeaders = [...questionColumns, ...headers.filter(header => /^(Respuesta|Etiqueta de filtro|Momento) \d+$/.test(header))];
  const scoreHeaders = [...questionColumns.slice(0, 2), ...scoreColumns, ...headers.filter(header => /^No puntuable \d+$/.test(header))];
  let listColumn = 1;
  function choicesRange(name: string, values: string[], title = name) {
    const column = lists.getColumn(listColumn++);
    column.width = 30;
    column.values = [title, ...values];
    workbook.definedNames.add(`'Catálogos'!$${column.letter}$2:$${column.letter}$${Math.max(2, values.length + 1)}`, name);
  }
  choicesRange("Subcategorias", [...new Set(categories.filter(item => item.isActive && item.subcategory).map(item => categoryLabel(item.name, item.subcategory!)))], "Subcategorías (categoría)");
  choicesRange("Tipos", Object.values(responseTypes), "Tipos de respuesta");
  choicesRange("TextoAbierto", ["Texto abierto"]);
  choicesRange("Roles", Object.values(questionRoles), "Roles de pregunta");
  choicesRange("RolesInformativos", Object.entries(questionRoles).filter(([key]) => key !== "SCORED").map(([, value]) => value));
  choicesRange("SiNo", ["Sí", "No"]);
  choicesRange("Metodos", ["Respuesta correcta", "Escala"], "Métodos de puntuación");
  choicesRange("Pesos", Array.from({length: 10}, (_, index) => String(index + 1)), "Pesos de pregunta");
  choicesRange("Momentos", ["PRE", "POST"]);
  [
    "Preguntas corresponde al paso 2: tipo, rol, subcategoría, filtro y configuración de respuestas.",
    "Ponderaciones corresponde al paso 3: método, máximo, peso, correcta, inversión y porcentajes. No incluye cálculos.",
    "Puedes importar solo Preguntas; deja Ponderaciones vacía o elige omitirla en la vista previa.",
    "En Ponderaciones, los campos vacíos conservan sus valores actuales. Usa el mismo porcentaje en cada grupo.",
    "Selecciona Sí/No para filtro, inversión y respuestas no puntuables. La categoría se obtiene de la subcategoría.",
    "Las etiquetas de filtro son texto editable; los momentos PRE/POST se usan solo con el rol Momento de aplicación.",
    "Cada No puntuable N corresponde a Respuesta N de la misma pregunta. La respuesta correcta se elige de esas opciones.",
    "Reutiliza el libro entre instrumentos: las preguntas se reconocen por texto y sección si se repiten. Las opciones deben coincidir en orden.",
    "Si cambia el texto o la sección, edítalos en las dos pestañas. Edita las respuestas de referencia en Preguntas para que coincidan con el destino.",
    "El catálogo es de referencia; no modifica catálogos, preguntas ni respuestas de origen.",
    "Revisa la vista previa y guarda manualmente cada paso. La aplicación calcula los puntos e influencia fuera del Excel.",
  ].forEach(value => note.addRow([value]));
  note.getColumn(1).width = 105;
  note.eachRow(row => { row.height = 32; row.alignment = { wrapText: true, vertical: "middle" }; });
  for (const [tab, columns] of [[sheet, questionsHeaders], [scores, scoreHeaders]] as const) {
    tab.columns = columns.map((header, index) => ({ header, key: header, width: index === 1 ? 65 : index === 0 || header.startsWith("Respuesta ") ? 32 : 24 }));
    tab.getRow(1).height = 44;
    tab.getRow(1).eachCell(cell => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF194D46" } };
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.alignment = { wrapText: true, vertical: "middle" };
    });
  }
  const list = (cell: ExcelJS.Cell, range: string, strict = true) => {
    cell.dataValidation = { type: "list", allowBlank: true, showErrorMessage: strict, errorStyle: "stop", errorTitle: "Selecciona de la lista", error: "Revisa las opciones disponibles para esta pregunta.", formulae: [range] };
  };
  const rowStyle = (row: ExcelJS.Row) => {
    row.height = 52;
    row.alignment = { wrapText: true, vertical: "top" };
  };
  const answerHeaders = questionsHeaders.filter(header => /^Respuesta \d+$/.test(header));
  rows.forEach((data, index) => {
    const row = sheet.addRow(questionsHeaders.map(header => data[header] ?? ""));
    rowStyle(row);
    const open = data["Tipo de respuesta"] === "Texto abierto";
    list(row.getCell(3), open ? "TextoAbierto" : "Tipos");
    list(row.getCell(4), open ? "RolesInformativos" : "Roles");
    list(row.getCell(5), "Subcategorias");
    list(row.getCell(6), "SiNo");
    const answers = answerHeaders.flatMap(header => data[header] ? [data[header]] : []);
    const originalAnswers = `OpcionesOriginales_${index + 1}`;
    if (answers.length) choicesRange(originalAnswers, answers, data.Pregunta);
    questionsHeaders.forEach((header, column) => {
      if (/^Momento \d+$/.test(header)) list(row.getCell(column + 1), "Momentos");
      if (answers.length && /^Respuesta \d+$/.test(header)) list(row.getCell(column + 1), originalAnswers, false);
    });
    if (open) return;
    const evaluated = data["Rol de la pregunta"] === "Evaluable";
    const hasRule = visible[index]?.analysisScoring?.some(rule => rule.analysisType === "pre_post");
    const score = scores.addRow(scoreHeaders.map((header, column) => {
      if (column < 2) return data[header] ?? "";
      if (!evaluated || (!hasRule && (header === "Método de puntuación" || header === "Puntuación inversa" || header.startsWith("No puntuable ")))) return "";
      if (header === "Peso de pregunta" && visible[index]?.weight?.factor == null) return "";
      return data[header] ?? "";
    }));
    rowStyle(score);
    list(score.getCell("Método de puntuación"), "Metodos");
    list(score.getCell("Peso de pregunta"), "Pesos");
    list(score.getCell("Puntuación inversa"), "SiNo");
    if (answerHeaders.length) {
      const first = sheet.getColumn(answerHeaders[0]!).letter;
      const last = sheet.getColumn(answerHeaders[answerHeaders.length - 1]!).letter;
      const name = `Respuestas_${index + 1}`;
      workbook.definedNames.add(`Preguntas!$${first}$${row.number}:$${last}$${row.number}`, name);
      list(score.getCell("Respuesta correcta"), name);
    }
    scoreHeaders.forEach((header, column) => {
      const cell = score.getCell(column + 1);
      if (/^No puntuable \d+$/.test(header)) list(cell, "SiNo");
      if (header === "Puntaje máximo") cell.dataValidation = { type: "decimal", operator: "greaterThanOrEqual", allowBlank: true, showErrorMessage: true, formulae: [0] };
      if (header.endsWith("(%)")) cell.dataValidation = { type: "decimal", operator: "between", allowBlank: true, showErrorMessage: true, formulae: [0, 100] };
    });
  });
  for (const tab of [sheet, scores]) tab.autoFilter = { from: { row: 1, column: 1 }, to: { row: tab.rowCount, column: tab.columnCount } };
  lists.getColumn(1).width = 48;
  return workbook;
}

export async function readInstrumentWorkbook(bytes: ArrayBuffer): Promise<{ questions: ConfigRow[]; scores?: ConfigRow[]; scoreError?: string }> {
  if (bytes.byteLength > 2 * 1024 * 1024) throw Error("El archivo supera 2 MB");
  let expanded = 0, files = 0;
  // Inspect ZIP metadata without extracting it before loading the workbook.
  unzipSync(new Uint8Array(bytes), { filter: file => {
    expanded += file.originalSize;
    if (++files > 1000 || !Number.isFinite(expanded) || expanded > 20 * 1024 * 1024) throw Error("El contenido del Excel supera el límite de 20 MB");
    if (/vbaProject\.bin$/i.test(file.name)) throw Error("Usa un archivo .xlsx sin macros");
    return false;
  } });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);
  const questions = workbook.getWorksheet("Preguntas");
  if (!questions) throw Error("Falta la hoja Preguntas");
  const scores = workbook.getWorksheet("Ponderaciones");
  const read = (sheet: ExcelJS.Worksheet, required: string[]): ConfigRow[] => {
    if (sheet.rowCount > 501 || sheet.columnCount > 2013) throw Error(`Máximo 500 preguntas y 500 respuestas por pregunta en ${sheet.name}`);
    const text = (cell: ExcelJS.Cell) => {
      if (cell.value === null || cell.value === undefined) return "";
      if (["string", "number", "boolean"].includes(typeof cell.value)) return String(cell.value).trim();
      if (typeof cell.value === "object" && "richText" in cell.value) return cell.value.richText.map(item => item.text).join("").trim();
      throw Error(`No se permiten fórmulas, enlaces ni objetos en ${sheet.name}!${cell.address}; usa valores`);
    };
    const headers = Array.from({ length: sheet.columnCount }, (_, index) => text(sheet.getCell(1, index + 1)));
    if (headers.some(header => !header) || new Set(headers).size !== headers.length || required.some(column => !headers.includes(column))) throw Error(`Encabezados faltantes, vacíos o duplicados en ${sheet.name}`);
    const rows: ConfigRow[] = [];
    for (let row = 2; row <= sheet.rowCount; row++) {
      const values = headers.map((_, index) => text(sheet.getCell(row, index + 1)));
      if (values.some(value => value)) rows.push(Object.fromEntries(headers.map((header, index) => [header, values[index]!])));
    }
    return rows;
  };
  const headers = questions.getRow(1).values;
  const old = !scores && Array.isArray(headers) && headers.includes("Método de puntuación");
  const rows = read(questions, old ? configColumns : questionColumns);
  if (old) return { questions: rows };
  try {
    return { questions: rows, scores: scores?.rowCount ? read(scores, [...questionColumns.slice(0, 2), ...scoreColumns]) : [] };
  } catch (error) {
    return { questions: rows, scores: [], scoreError: error instanceof Error ? error.message : "No se pudo leer Ponderaciones" };
  }
}
