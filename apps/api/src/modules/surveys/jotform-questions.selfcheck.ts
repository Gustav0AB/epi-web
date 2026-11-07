import { expandMatrixAnswers } from "./matrix-answers.js";
import { questionVisibility } from "./question-visibility.js";
import assert from "node:assert";
import { applySetupQuestions, mapJotformQuestions, normalizeLabel, parseCatalogLabels } from "./jotform-questions.js";
import type { JotformQuestion } from "./jotform-client.js";

const CATALOG_DATA = "GRUPO,GRADO,TIPO DE PROGRAMA,EDAD";

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
assert.strictEqual(normalizeLabel("Género"), "GENERO");

const catalogLabels = parseCatalogLabels(CATALOG_DATA);
const result = mapJotformQuestions(questions, catalogLabels);

assert.strictEqual(result.skipped.length, 0, "Edad numérica conserva su catálogo y se reconoce como dato no evaluable");

assert.deepStrictEqual(
  result.catalogMatches.map((c) => c.key).sort(),
  ["EDAD", "GRADO", "GRUPO", "TIPO DE PROGRAMA"].sort()
);
const grupo = result.catalogMatches.find((c) => c.key === "GRUPO")!;
assert.strictEqual(grupo.label, "Grupo");
assert.deepStrictEqual(grupo.options, ["Grupo 1", "Grupo 2", "Grupo 3", "Grupo 4"]);
const edad = result.catalogMatches.find((c) => c.key === "EDAD")!;
assert.deepStrictEqual(edad.options, []);

assert.deepStrictEqual(
  result.scoredQuestions.map((q) => q.externalId).sort(),
  ["q3_dropdown1", "q4_dropdown2", "q5_number3", "q6_radio4", "q10_scale8", "q11_scale9", "q13_radio11", "q14_radio12", "q15_radio13", "q16_radio14", "q7_radio5", "q8_textarea6", "q9_textarea7"].sort()
);
assert.strictEqual(result.scoredQuestions.find((q) => q.externalId === "q10_scale8")?.type, "LIKERT");
assert.strictEqual(result.scoredQuestions.find((q) => q.externalId === "q7_radio5")?.type, "ONE_ANSWER");
assert.strictEqual(result.scoredQuestions.find((q) => q.externalId === "q8_textarea6")?.type, "OPEN_TEXT");

assert.deepStrictEqual(
  result.scoredQuestions.find((q) => q.externalId === "q7_radio5")?.options,
  ["Masculino", "Femenino", "Otro", "Prefiero no responder"]
);
assert.deepStrictEqual(result.scoredQuestions.find((q) => q.externalId === "q8_textarea6")?.options, []);

const original = result.scoredQuestions;
const edited = applySetupQuestions(original, [{ externalId: "q7_radio5", text: "Edited question", type: "FREQUENCY" }]);
assert.equal(edited.find(q => q.externalId === "q7_radio5")?.type, "FREQUENCY");
assert.equal(edited.find(q => q.externalId === "q7_radio5")?.text, original.find(q => q.externalId === "q7_radio5")?.text);
assert.deepEqual(edited.find(q => q.externalId === "q7_radio5")?.options, original.find(q => q.externalId === "q7_radio5")?.options);
assert.equal(original.find(q => q.externalId === "q7_radio5")?.type, "ONE_ANSWER");
assert.deepEqual(applySetupQuestions(original), original);
assert.equal(edited.find(q => q.externalId === "q7_radio5")?.role, "SCORED");
const informative = applySetupQuestions(original, [{ externalId: "q7_radio5", text: "Context", type: "ONE_ANSWER", role: "INFORMATIONAL" }]);
assert.equal(informative.find(q => q.externalId === "q7_radio5")?.role, "INFORMATIONAL");
assert.throws(() => applySetupQuestions(original, [{ externalId: "removed", text: "Old question", type: "LIKERT" }]), { statusCode: 409 });

console.log("✓ jotform-questions self-check passed");

const momentQuestion = { externalId: "moment", text: "When?", type: "ONE_ANSWER" as const, options: ["Before", "After"] };
const momentEdit = { externalId: "moment", text: "When?", type: "ONE_ANSWER" as const, role: "MOMENT" as const, momentMappings: [{ value: "Before", moment: "PRE" as const }, { value: "After", moment: "POST" as const }] };
assert.equal(applySetupQuestions([momentQuestion], [momentEdit])[0]?.role, "MOMENT");
assert.throws(() => applySetupQuestions([momentQuestion], [{ ...momentEdit, momentMappings: [] }]), { statusCode: 400 });
assert.throws(() => applySetupQuestions([{ ...momentQuestion, options: ["Changed", "After"] }], [momentEdit]), { statusCode: 400 });
assert.throws(() => applySetupQuestions([{ ...momentQuestion, options: [] }], [momentEdit]), { statusCode: 400 });

const weightedEdit = { externalId: "moment", text: "Score", type: "ONE_ANSWER" as const, weight: { category: "Learning", subcategory: null, maxScore: 5, correctAnswer: "Before" } };
assert.deepEqual(applySetupQuestions([momentQuestion], [weightedEdit])[0]?.weight, weightedEdit.weight);
for (const weight of [{ ...weightedEdit.weight, category: "" }, { ...weightedEdit.weight, maxScore: null }, { ...weightedEdit.weight, maxScore: -1 }, { ...weightedEdit.weight, maxScore: Infinity }, { ...weightedEdit.weight, correctAnswer: null }, { ...weightedEdit.weight, correctAnswer: "Absent" }]) {
  assert.throws(() => applySetupQuestions([momentQuestion], [{ ...weightedEdit, weight }]), { statusCode: 400 });
}
for (const role of ["INFORMATIONAL", "IDENTIFIER"] as const) {
  assert.throws(() => applySetupQuestions([momentQuestion], [{ ...weightedEdit, role }]), { statusCode: 400 });
}
assert.throws(() => applySetupQuestions([momentQuestion], [{ ...weightedEdit, type: "OPEN_TEXT" }]), { statusCode: 400 });
assert.equal(applySetupQuestions([momentQuestion], [{ ...weightedEdit, weight: null }])[0]?.weight, undefined);

const filterQuestion = { ...momentQuestion, controlType: "control_radio" };
const filterEdit = { ...momentEdit, role: "FILTER" as const, momentMappings: [], optionLabels: [{ value: "Before", label: "Before course" }] };
assert.deepEqual(applySetupQuestions([filterQuestion], [filterEdit])[0]?.optionLabels, filterEdit.optionLabels);
assert.throws(() => applySetupQuestions([{ ...filterQuestion, controlType: "control_checkbox" }], [filterEdit]), { statusCode: 400 });
assert.throws(() => applySetupQuestions([filterQuestion], [{ ...filterEdit, optionLabels: [{ value: "missing", label: "Wrong" }] }]), { statusCode: 400 });

const catalogQuestion = result.scoredQuestions.find(question => question.externalId === "q3_dropdown1")!;
assert.equal(catalogQuestion.role, "INFORMATIONAL");
assert.equal(result.scoredQuestions.filter(question => question.externalId === "q3_dropdown1").length, 1);
assert.equal(applySetupQuestions([catalogQuestion], [{ externalId: catalogQuestion.externalId, text: "Renamed group", type: "ONE_ANSWER" }])[0]!.role, "INFORMATIONAL");
const schoolMapped = applySetupQuestions([catalogQuestion], [{ externalId: catalogQuestion.externalId, text: catalogQuestion.text, type: "ONE_ANSWER", role: "SCHOOL_GROUP" }])[0]!;
assert.equal(schoolMapped.role, "SCHOOL_GROUP");
assert.deepEqual(schoolMapped.options, catalogQuestion.options);
assert.throws(() => applySetupQuestions([catalogQuestion], [{ externalId: catalogQuestion.externalId, text: catalogQuestion.text, type: "ONE_ANSWER", weight: { category: "Wrong", subcategory: null, maxScore: 1, correctAnswer: "Grupo 1" } }]), { statusCode: 400 });

const ambiguous = mapJotformQuestions([
  { qid: "1", text: "Sin nombre", type: "control_radio" },
  { qid: "2", name: "same", text: "A", type: "control_radio" },
  { qid: "3", name: "same", text: "B", type: "control_scale" },
  { qid: "4", name: "matrix", text: "Matriz", type: "control_matrix", options: { rows: ["A"] } },
  { qid: "5", name: "structured", text: "Opciones", type: "control_radio", options: ["A"] },
  { qid: "6", text: "Título", type: "control_head" },
  { qid: "7", name: "valid", text: "Válida", type: "control_radio", options: "A|B" },
], []);
assert.deepEqual(ambiguous.scoredQuestions.map(q => q.externalId), ["valid"]);
assert.equal(ambiguous.skipped.length, 5);
assert.equal(ambiguous.skipped[0]?.externalId, "qid:1");
assert.equal(ambiguous.skipped[1]?.reason, "Identificador repetido");
assert.equal(ambiguous.skipped[3]?.text, "Matriz");
assert.throws(() => applySetupQuestions(ambiguous.scoredQuestions, [{ externalId: "same", text: "A", type: "LIKERT" }]), { statusCode: 409 });

const excluded = applySetupQuestions([momentQuestion], [{ externalId: "moment", text: "When?", type: "ONE_ANSWER", role: "EXCLUDED" }]);
assert.equal(excluded[0]?.role, "EXCLUDED");
assert.deepEqual(excluded[0]?.options, momentQuestion.options);
assert.throws(() => applySetupQuestions([momentQuestion], [{ ...weightedEdit, role: "EXCLUDED" }]), { statusCode: 400 });

const scoredFilter = applySetupQuestions([filterQuestion], [{ ...weightedEdit, role: "SCORED", isFilter: true }])[0]!;
assert.equal(scoredFilter.role, "SCORED");
assert.equal(scoredFilter.isFilter, true);
assert.deepEqual(scoredFilter.weight, weightedEdit.weight);
assert.equal(applySetupQuestions([filterQuestion], [{ ...filterEdit, isFilter: true, role: "INFORMATIONAL" }])[0]?.isFilter, true);
assert.equal(applySetupQuestions([filterQuestion], [{ ...filterEdit, role: "FILTER" }])[0]?.role, "INFORMATIONAL");
assert.throws(() => applySetupQuestions([{ ...filterQuestion, controlType: "control_checkbox" }], [{ ...weightedEdit, isFilter: true }]), { statusCode: 400 });
const visibilityQuestions = [
  { qid: "1", name: "when", text: "Momento", type: "control_radio" },
  { qid: "2", name: "conditional", text: "Oculta", type: "control_radio", hidden: "Yes" },
];
const conditionSource = JSON.stringify([{ type: "field", link: "Any", terms: JSON.stringify([{ field: "1", operator: "equals", value: "Post" }]), action: JSON.stringify([{ visibility: "ShowMultiple", fields: ["2"] }]) }]);
const mappedVisibility = questionVisibility(visibilityQuestions, conditionSource);
assert.equal(mappedVisibility.visibility.get("conditional")?.hidden, true);
assert.equal(mappedVisibility.visibility.get("conditional")?.rules[0]?.action, "show");
assert.deepEqual(mappedVisibility.visibility.get("conditional")?.rules[0]?.terms, [{ field: "when", operator: "equals", value: "Post" }]);
assert.deepEqual(mappedVisibility.warnings, []);
assert.equal(mappedVisibility.original, conditionSource);
assert.equal(questionVisibility(visibilityQuestions, "broken JSON").warnings.length, 1);
assert.equal(questionVisibility(visibilityQuestions, [{ type: "field", terms: [], action: [{ visibility: "Show", fields: ["missing"] }] }]).warnings.length, 1);
assert.equal(questionVisibility(visibilityQuestions, [{ type: "page" }]).warnings.length, 1);
assert.deepEqual(questionVisibility(visibilityQuestions, [{ type: "field", disabled: "1" }]).warnings, []);
assert.deepEqual(questionVisibility(visibilityQuestions, "").warnings, []);

// v3 stores classification independently; incomplete legacy scores are not converted into fake weights.
const independentEdit = { ...weightedEdit, classification: { category: "Learning", subcategory: "Knowledge" }, weight: { category: "Old", subcategory: null, maxScore: null, correctAnswer: "Retired" } };
const independent = applySetupQuestions([momentQuestion], [independentEdit], 3)[0]!;
assert.deepEqual(independent.classification, independentEdit.classification);
assert.equal(independent.weight, undefined);
assert.throws(() => applySetupQuestions([momentQuestion], [independentEdit]), { statusCode: 400 });
const retainedLegacy = applySetupQuestions([momentQuestion], [{ ...independentEdit, weight: { ...independentEdit.weight, maxScore: 7 } }], 3)[0]!;
assert.equal(retainedLegacy.weight!.correctAnswer, "Retired", "Dormant legacy fields are retained without governing current analysis");
console.log("✓ v3 classification does not require a general score and legacy validation stays intact passed");

const matrixSource = [
  { qid: "head", name: "section", text: "Sección ambiental", type: "control_head" },
  { qid: "matrix-id", name: "opinions", text: "Opiniones", type: "control_matrix", inputType: "Radio Button", mrows: "Fila A|Fila B", mcolumns: "Agree|Neutral|Disagree" },
];
const mappedMatrix = mapJotformQuestions(matrixSource, []);
assert.equal(mappedMatrix.skipped.length, 0);
assert.equal(mappedMatrix.scoredQuestions.length, 3);
const matrixRows = mappedMatrix.scoredQuestions.filter(question => question.sourceContext?.matrix);
assert.equal(new Set(matrixRows.map(question => question.externalId)).size, 2);
assert.equal(matrixRows[0]!.sourceContext!.section!.text, "Sección ambiental");
assert.deepEqual(matrixRows[0]!.options, ["Agree", "Neutral", "Disagree"]);
assert.equal(matrixRows[1]!.sourceContext!.matrix!.rowKey, "1");
assert.equal(mapJotformQuestions([{ ...matrixSource[1]!, mrows: "Fila A|Fila A" }], []).skipped.length, 1);
assert.equal(mapJotformQuestions([{ ...matrixSource[1]!, inputType: "Check Box" }], []).scoredQuestions.length, 0);
const changedMatrix = mapJotformQuestions([{ ...matrixSource[1]!, mrows: "Fila B|Fila A" }], []);
assert.throws(() => applySetupQuestions(changedMatrix.scoredQuestions, [matrixRows[0]!], 4), /Las filas de la matriz cambiaron/);
console.log("✓ matrix mapping: stable parent/index identity, grouped source, ambiguity and source drift checks passed");

const originalMatrixAnswer = { questionId: "opinions", value: { "Fila A": "Agree", "Fila B": null } };
const expandedMatrix = expandMatrixAnswers([originalMatrixAnswer], matrixRows);
assert.equal(expandedMatrix.answers.length, 3);
assert.deepEqual(expandedMatrix.answers[0], originalMatrixAnswer);
assert.equal(expandedMatrix.answers.find(answer => answer.questionId === matrixRows[1]!.externalId)!.value, null);
assert.equal(expandMatrixAnswers([{ questionId: "opinions", value: ["Agree", "Disagree"] }], matrixRows).warnings.length, 1);
assert.equal(expandMatrixAnswers([{ questionId: "opinions", value: false }], matrixRows).answers.length, 1);

const native = mapJotformQuestions([
 { name: "age", text: "Edad", type: "control_number" },
 { name: "yes", text: "¿Originario?", type: "control_yesno", options: "SÍ|NO" },
 { name: "email", text: "Correo", type: "control_email" },
 { name: "full", text: "Nombre", type: "control_fullname" },
 { name: "rating", text: "Probabilidad", type: "control_rating", scaleFrom: "1", stars: "5" },
], []);
assert.equal(native.skipped.length,0);
assert.deepEqual(native.scoredQuestions.find(question => question.externalId === "rating")!.options,["1","2","3","4","5"]);
assert.deepEqual(native.scoredQuestions.find(question => question.externalId === "yes")!.options,["SÍ","NO"]);
for (const key of ["age","email","full"]) assert.equal(native.scoredQuestions.find(question => question.externalId === key)!.role,"INFORMATIONAL");
const openAttempt = applySetupQuestions([native.scoredQuestions[0]!],[{ externalId: "age", text: "Edad", type: "LIKERT", role: "SCORED", analysisParticipation: [{ analysisType: "pre_post", enabled: true }] }],4)[0]!;
assert.equal(openAttempt.type,"OPEN_TEXT"); assert.equal(openAttempt.role,"INFORMATIONAL"); assert.equal(openAttempt.analysisScoring,null);
assert.equal(mapJotformQuestions([{ name: "bad", text: "Valoración", type: "control_rating", stars: "not-a-number", scaleFrom: "1" }],[]).scoredQuestions.length,0);
assert.equal(mapJotformQuestions([{ name: "custom", text: "Widget", type: "control_widget" }],[]).skipped.length,1);
const { normalizeFormQuestions } = await import("./jotform-client.js");
const ordered = normalizeFormQuestions({ "1": { name: "late", text: "Final", type: "control_head", order: "3" }, "2": { name: "early", text: "Inicial", type: "control_head", order: "1" }, "3": { name: "q", text: "Pregunta", type: "control_radio", order: "2", options: "A|B" } });
assert.deepEqual(ordered.map(question => question.name),["early","q","late"]);
assert.equal(mapJotformQuestions(ordered,[]).scoredQuestions[0]!.sourceContext!.section!.text,"Inicial");
console.log("Assistant native controls passed: number/email/name informational, yes/no options, rating limits, free-text scoring protection and Jotform section order");
