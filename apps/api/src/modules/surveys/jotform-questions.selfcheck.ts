// Auto-check del mapeo de preguntas de Jotform (tipos + detección de
// catálogo), usando el JSON real de /form/{id}/questions que compartió EPI
// para el form 262046014002034. Correr:
// tsx src/modules/surveys/jotform-questions.selfcheck.ts
import assert from "node:assert";
import { mapJotformQuestions, normalizeLabel, parseCatalogLabels } from "./jotform-questions.js";
import type { JotformQuestion } from "./jotform-client.js";

const CATALOG_DATA = "GRUPO,GRADO,TIPO DE PROGRAMA,EDAD";

// Fixture real (recortado a los campos que jotform-client ya tipa + options).
const questions: JotformQuestion[] = [
  { qid: "1", name: "q1_header", text: "Encuesta de Programa - Formulario 2", type: "control_head" },
  { qid: "2", name: "q2_head0", text: "Datos generales", type: "control_head" },
  { qid: "3", name: "q3_dropdown1", text: "Grupo", type: "control_dropdown", options: "Grupo 1|Grupo 2|Grupo 3|Grupo 4" },
  { qid: "4", name: "q4_dropdown2", text: "Grado", type: "control_dropdown", options: "Grado 1|Grado 2|Grado 3" },
  { qid: "5", name: "q5_number3", text: "Edad", type: "control_number" },
  { qid: "6", name: "q6_radio4", text: "Tipo de Programa", type: "control_radio", options: "Local|Visiting" },
  { qid: "7", name: "q7_radio5", text: "Género", type: "control_radio", options: "Masculino|Femenino|Otro|Prefiero no responder" },
  { qid: "8", name: "q8_textarea6", text: "¿Qué fue lo que más te gustó del programa?", type: "control_textarea" },
  { qid: "9", name: "q9_textarea7", text: "¿Qué actividad te pareció más útil y por qué?", type: "control_textarea" },
  { qid: "10", name: "q10_scale8", text: "Me sentí cómodo/a participando y expresando mis ideas durante el programa.", type: "control_scale" },
  { qid: "11", name: "q11_scale9", text: "Las actividades me ayudaron a comprender mejor los temas del programa.", type: "control_scale" },
  { qid: "12", name: "q12_collapse10", text: "Actividad de exploración", type: "control_collapse" },
  { qid: "13", name: "q13_radio11", text: "¿Te gustó participar en la actividad de exploración?", type: "control_radio", options: "Sí|No|Más o menos|No estoy seguro/a" },
  { qid: "14", name: "q14_radio12", text: "¿Cómo calificas la explicación de los instructores durante la actividad?", type: "control_radio", options: "Excelente|Buena|Regular|Mala" },
  { qid: "15", name: "q15_radio13", text: "¿La actividad te ayudó a conocer algo nuevo sobre el entorno?", type: "control_radio", options: "Sí|No|Un poco" },
  { qid: "16", name: "q16_radio14", text: "¿Recomendarías esta actividad a otros estudiantes?", type: "control_radio", options: "Sí|No|Tal vez" },
  { qid: "17", name: "q17_submit", text: "Enviar", type: "control_button" },
];

assert.deepStrictEqual(parseCatalogLabels(CATALOG_DATA), ["GRUPO", "GRADO", "TIPO DE PROGRAMA", "EDAD"]);
assert.strictEqual(normalizeLabel("Tipo de Programa"), "TIPO DE PROGRAMA");
assert.strictEqual(normalizeLabel("Género"), "GENERO"); // acentos fuera, no es catálogo así que no debe importar

const catalogLabels = parseCatalogLabels(CATALOG_DATA);
const result = mapJotformQuestions(questions, catalogLabels);

// control_head/control_collapse/control_button se descartan (no son preguntas).
assert.strictEqual(result.skipped.length, 0, "control_number no debería marcarse 'skipped': cae en catálogo (Edad)");

// Grupo/Grado/Tipo de Programa/Edad van a catalogMatches, no a scoredQuestions.
assert.deepStrictEqual(
  result.catalogMatches.map((c) => c.key).sort(),
  ["EDAD", "GRADO", "GRUPO", "TIPO DE PROGRAMA"].sort()
);
const grupo = result.catalogMatches.find((c) => c.key === "GRUPO")!;
assert.strictEqual(grupo.label, "Grupo");
assert.deepStrictEqual(grupo.options, ["Grupo 1", "Grupo 2", "Grupo 3", "Grupo 4"]);
const edad = result.catalogMatches.find((c) => c.key === "EDAD")!;
assert.deepStrictEqual(edad.options, []); // control_number no trae "options"

// El resto (Género, textareas, scales, radios de la actividad) sí se ponderan.
assert.deepStrictEqual(
  result.scoredQuestions.map((q) => q.externalId).sort(),
  ["q10_scale8", "q11_scale9", "q13_radio11", "q14_radio12", "q15_radio13", "q16_radio14", "q7_radio5", "q8_textarea6", "q9_textarea7"].sort()
);
assert.strictEqual(result.scoredQuestions.find((q) => q.externalId === "q10_scale8")?.type, "LIKERT");
assert.strictEqual(result.scoredQuestions.find((q) => q.externalId === "q7_radio5")?.type, "ONE_ANSWER");
assert.strictEqual(result.scoredQuestions.find((q) => q.externalId === "q8_textarea6")?.type, "OPEN_TEXT");

// ONE_ANSWER (radio/dropdown) conserva sus opciones para el dropdown de
// correctAnswer; OPEN_TEXT no trae options.
assert.deepStrictEqual(
  result.scoredQuestions.find((q) => q.externalId === "q7_radio5")?.options,
  ["Masculino", "Femenino", "Otro", "Prefiero no responder"]
);
assert.deepStrictEqual(result.scoredQuestions.find((q) => q.externalId === "q8_textarea6")?.options, []);

console.log("✓ jotform-questions self-check passed");
