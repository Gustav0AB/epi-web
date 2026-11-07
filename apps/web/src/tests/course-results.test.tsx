import { CourseCalculationWarnings } from "../features/surveys/CourseCalculationWarnings";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { selectCourseResultCategories, buildCourseReportPreview, courseResponseCoverage, mostImprovedKnowledge, CourseExpectationUpdateSchema, CourseResultsQuerySchema, scorePrePostAnswer, type CourseResultsDto, type PrePostQuestion } from "@epi/shared";
import { CourseComparison, instrumentIndicatorCategory, orderCourseQuestions, rankedCourseQuestions } from "../features/surveys/CourseComparison";
import { CourseResultsPage, CourseResultsView } from "../features/surveys/CourseResultsPage";
import { surveyApi } from "../features/surveys/api";
const base = { valid: 0, blank: 0, nonScorable: 0, invalid: 0, configurationPending: 0, zeroMaximum: 0, points: null, applicableMaximum: null };
const result: CourseResultsDto = { courseId: "course", name: "Curso de prueba", school: "Escuela A", siteId: "site", activity: "Visita", revision: 3, calculatedAt: "2026-11-05T18:00:00Z", methodology: "pending", primaryDefinitionId: "v1", aggregates: [], coverageThreshold: 80, expectedParticipants: null, expectedParticipantsPre: null, expectedParticipantsPost: null, preReceipts: 1, postReceipts: 0, excludedReceipts: 1, contextPendingReceipts: 1, sourcePendingReceipts: 0, complementaryReceipts: 2, unsupportedVersionReceipts: 0, distributions: [{ definitionId: "v1", instrument: "Aprendizaje", version: 1, categoryWeights: [{ category: "Learning", weight: 100 }], subcategoryWeights: [{ category: "Learning", subcategory: "Knowledge", weight: 100 }] }], groups: [{ definitionId: "v1", instrument: "Aprendizaje", version: 1, category: "Learning", subcategory: "Knowledge", pre: { receipts: 1, complete: 0, incomplete: 1, withoutData: 0, validAnswers: 1 }, post: { receipts: 0, complete: 0, incomplete: 0, withoutData: 0, validAnswers: 0 } }], questions: [{ id: "internal-question", definitionId: "v1", instrument: "Aprendizaje", version: 1, text: "Una pregunta larga que debe poder consultarse completa sin deformar la tabla de trazabilidad", category: "Learning", subcategory: "Knowledge", factor: 1, maximum: 1, configurationReady: true, rule: "Respuesta correcta", options: [{ value: "Sí", score: 1 },{ value: "No", score: 0 },{ value: "No sé", score: null }], pre: { ...base, valid: 1, points: 0, applicableMaximum: 1 }, post: { ...base, blank: 2 } }], pending: ["Agregación pendiente", "Base esperada por confirmar"] };
afterEach(() => vi.unstubAllGlobals());
describe("E5 scoring and auditable bases", () => {
 it("keeps missing coverage unknown and evaluates the exact 80 percent boundary", () => {
  expect(courseResponseCoverage(10, null)).toEqual({ percent: null, meetsThreshold: null });
  expect(courseResponseCoverage(0, 50)).toEqual({ percent: 0, meetsThreshold: false });
  expect(courseResponseCoverage(39, 50).meetsThreshold).toBe(false);
  expect(courseResponseCoverage(40, 50)).toEqual({ percent: 80, meetsThreshold: true });
  expect(courseResponseCoverage(60, 50)).toEqual({ percent: 120, meetsThreshold: true });
  expect(courseResponseCoverage(79999, 100000).meetsThreshold).toBe(false);
  for (const value of [0, -1, 1.5, Infinity, 2147483648]) expect(CourseExpectationUpdateSchema.safeParse({ expectedRevision: 1, expectedParticipantsPre: value, expectedParticipantsPost: 50 }).success).toBe(false);
  expect(CourseExpectationUpdateSchema.safeParse({ expectedRevision: 1, expectedParticipantsPre: null, expectedParticipantsPost: null }).success).toBe(true);
 });
 it("uses independent Pre/Post expected bases, without clipping excess receipts", () => {
  const html = renderToStaticMarkup(<CourseResultsView result={{ ...result, expectedParticipants: 50, expectedParticipantsPre: 50, expectedParticipantsPost: 40, preReceipts: 40, postReceipts: 35 }} />);
  expect(html).toContain("80%"); expect(html).toContain("87,5%"); expect(html).toContain("Alcanza el umbral"); expect(renderToStaticMarkup(<CourseResultsView result={{ ...result, expectedParticipantsPre: 50, expectedParticipantsPost: null, preReceipts: 39, postReceipts: 40 }} />)).toContain("Por debajo del umbral");
  expect(renderToStaticMarkup(<CourseResultsView result={{ ...result, expectedParticipants: 1, expectedParticipantsPre: 1, expectedParticipantsPost: 1, preReceipts: 2 }} />)).toContain("revisa la base y posibles duplicados");
 });
 it("requests only the explicit course with confirmed application date filters", async () => {
  const fetch = vi.fn().mockResolvedValue({ json: () => Promise.resolve({ success: true, data: result }) }); vi.stubGlobal("fetch",fetch);
  expect(await surveyApi.courseResults("course/id","?from=2026-11-01&to=2026-11-05")).toEqual(result);
  expect(fetch.mock.calls[0]![0]).toBe("/api/surveys/courses/course%2Fid/results?from=2026-11-01&to=2026-11-05");
 });
 it("propagates access errors rather than returning zero results", async () => {
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ json: () => Promise.resolve({ success: false, error: { message: "Curso no disponible" } }) }));
  await expect(surveyApi.courseResults("hidden")).rejects.toThrow("Curso no disponible");
 });
 it("shows wrong-answer zero separately from no data and states that indices are pending", () => {
  const html = renderToStaticMarkup(<CourseResultsView result={result} />);
  expect(html).toContain("Puntos sumados: 0"); expect(html).toContain("Máximo respondido: 1"); expect(html).toContain("Puntos sumados: Sin datos"); expect(html).toContain("Índice, cambio Pre/Post e IAA: metodología aprobada"); expect(html).toContain("Base esperada por confirmar"); expect(html).not.toContain("internal-question");
 });
 it("renders version provenance, full-question tooltip and non-scorable options", () => {
  const html = renderToStaticMarkup(<CourseResultsView result={result} />);
  expect(html).toContain(`title="${result.questions[0]!.text}"`); expect(html).toContain("v1"); expect(html).toContain("No puntuable"); expect(html).toContain("Incompletos:"); expect(html).toContain("Puntos por opción"); expect(html).toContain("Learning / Knowledge: 100%");
 });
 it("makes no request or mutation on initial server rendering", () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch",fetch);
  const html = renderToStaticMarkup(<MemoryRouter><CourseResultsPage /></MemoryRouter>);
  expect(html).toContain("Aplicación desde"); expect(html).toContain("Volver al curso"); expect(fetch).not.toHaveBeenCalled();
 });
 it("returns to the selected course rather than losing its review context", () => {
  const html = renderToStaticMarkup(<MemoryRouter initialEntries={["/courses/course-id/results"]}><Routes><Route path="/courses/:id/results" element={<CourseResultsPage />} /></Routes></MemoryRouter>);
  expect(html).toContain('href="/courses?courseId=course-id"'); expect(html).toContain("Volver al curso y sus respuestas");
 });
 it("validates actual calendar dates and does not accept unrelated filters", () => {
  for (const input of [{ from: "2026-11-02", to: "2026-11-01" },{ from: "2026-02-30" },{ page: 2 }]) expect(CourseResultsQuerySchema.safeParse(input).success).toBe(false);
  expect(CourseResultsQuerySchema.safeParse({ from: "2026-11-01", to: "2026-11-01" }).success).toBe(true);
 });
 it("preserves numeric zero while rejecting booleans and compound selections", () => {
  const question: PrePostQuestion = { externalId: "q", text: "Correcta", type: "ONE_ANSWER", role: "SCORED", options: ["0","1"], analysisParticipation: [{ analysisType: "pre_post", enabled: true },{ analysisType: "pre_post_post", enabled: false }], analysisScoring: [{ analysisType: "pre_post", maxScore: 5, correctAnswer: "0", scoringMode: "standard", responsePolicy: { blank: "exclude", invalid: "review" } }] };
  expect(scorePrePostAnswer(question,[0])).toEqual({ reason: "valid", points: 5, maximum: 5 });
  expect(scorePrePostAnswer(question,[false]).points).toBeNull(); expect(scorePrePostAnswer(question,[["0","1"]]).points).toBeNull(); expect(scorePrePostAnswer(question,[null]).maximum).toBeNull();
 });
});


it("ranks positive, zero and negative changes using valid scoring bases, without comparing versions", () => {
 const source = result.questions[0]!;
 const row = (id: string, pre: number, post: number) => ({ ...source, id, text: id, pre: { ...base, valid: 2, points: pre, applicableMaximum: 4 }, post: { ...base, valid: 2, points: post, applicableMaximum: 4 } });
 const comparable = { ...result, postReceipts: 3, questions: [
  row("baja", 4, 2), row("igual", 2, 2), row("sube", 1, 3), row("empate", 2, 4),
  { ...row("otra", 0, 4), definitionId: "v2" }, { ...row("sin-post", 0, 4), post: base },
 ] };
 expect(rankedCourseQuestions(comparable).map(item => [item.id,item.change,item.rank])).toEqual([["empate",50,1],["sube",50,1],["igual",0,3],["baja",-50,4],["sin-post",null,null]]);
 const html = renderToStaticMarkup(<CourseComparison result={comparable} />);
 expect(html).toContain("Información por pregunta");
 expect(html).toMatch(/<details><summary[^>]*>Información por pregunta/);
 expect(html).toMatch(/<details><summary[^>]*>Información por categoría/);
 expect(html).toContain("Categorías incluidas");
 expect(html).toContain("Greatest Improvement");
 const grouped = rankedCourseQuestions(comparable).map(row => ({ ...row, category: ["baja","sube"].includes(row.id) ? "B" : "A", subcategory: "Una" }));
 expect(orderCourseQuestions(grouped, "category-desc").map(row => row.id)).toEqual(["empate","igual","sin-post","sube","baja"]);
 expect(orderCourseQuestions(grouped, "category-asc").map(row => row.id)).toEqual(["igual","empate","sin-post","baja","sube"]);
 expect(orderCourseQuestions(grouped, "global-asc").map(row => row.id)).toEqual(["baja","igual","empate","sube","sin-post"]);
 expect(orderCourseQuestions(grouped, "global-desc").map(row => row.id)).toEqual(["empate","sube","igual","baja","sin-post"]);
 expect(renderToStaticMarkup(<CourseComparison result={result} />)).toContain("Sin datos");
});


it("selects all tied positive knowledge subcategories of the primary version", () => {
 const aggregate = (subcategory: string, change: number, category = "Knowledge", definitionId = "v1") => ({ definitionId, instrument: "Aprendizaje", version: 1, level: "subcategory" as const, category, subcategory, pre: 30, post: 30 + change, change, preEffectiveWeights: [], postEffectiveWeights: [], issue: null });
 expect(mostImprovedKnowledge({ ...result, aggregates: [aggregate("A", 20), aggregate("B", 20), aggregate("C", 0), aggregate("Otra categoría", 40, "Competencies"), aggregate("Otra versión", 45, "Knowledge", "v2")] }).map(row => row.subcategory)).toEqual(["A", "B"]);
});

it("distinguishes excluded blanks from actual question-weight redistribution", () => {
 const question = { ...result.questions[0]!, id: "question-one", category: "Learning", subcategory: "Knowledge", configurationReady: true, factor: 1, maximum: 10, pre: { ...base, valid: 1, blank: 2, points: 10, applicableMaximum: 10 } };
 const second = { ...question, id: "question-two", pre: { ...base, valid: 1, blank: 0, points: 5, applicableMaximum: 10 } };
 const stats = { receipts: 3, complete: 1, incomplete: 2, withoutData: 0, validAnswers: 4 };
 const output: CourseResultsDto = { ...result, questions: [question, second], groups: [{ definitionId: question.definitionId, instrument: question.instrument, version: question.version, category: "Learning", subcategory: "Knowledge", pre: stats, post: stats }], aggregates: [{
  definitionId: question.definitionId, instrument: question.instrument, version: question.version, level: "subcategory", category: "Learning", subcategory: "Knowledge", pre: 75, post: null, change: null, preEffectiveWeights: [{ key: question.id, weight: 50 }, { key: second.id, weight: 50 }], postEffectiveWeights: [], issue: null,
 }] };
 const ordinary = renderToStaticMarkup(<CourseCalculationWarnings result={output} />);
 expect(ordinary).toContain("2 respuestas en blanco");
 expect(ordinary).toMatch(/<details><summary[^>]*>Advertencias del cálculo/);
 expect(ordinary).toContain("Todas las preguntas conservan");
 expect(ordinary).not.toContain("se redistribuyó");
 output.questions[1] = { ...second, pre: { ...base, blank: 3 } };
 output.aggregates[0]!.preEffectiveWeights = [{ key: question.id, weight: 100 }];
 expect(renderToStaticMarkup(<CourseCalculationWarnings result={output} />)).toContain("se redistribuyó proporcionalmente");
 output.aggregates[0]!.preEffectiveWeights = [];
 const noData = renderToStaticMarkup(<CourseCalculationWarnings result={output} />);
 expect(noData).toContain("No hay preguntas con datos válidos");
 expect(noData).not.toContain("se redistribuyó");
});

it("shows competency and disposition indicators only for configured instrument categories", () => {
 expect(instrumentIndicatorCategory("Competencies")).toBe("competencies");
 expect(instrumentIndicatorCategory("Competencias")).toBe("competencies");
 expect(instrumentIndicatorCategory("Self-efficacy")).toBe("self-efficacy-dispositions");
 expect(instrumentIndicatorCategory("Environmental Knowledge")).toBe(null);
 const category = (name: string) => ({ definitionId: result.primaryDefinitionId, instrument: "Instrumento", version: 1, level: "category" as const, category: name, subcategory: null, pre: 30, post: 50, change: 20, preEffectiveWeights: [], postEffectiveWeights: [], issue: null });
 const html = renderToStaticMarkup(<CourseComparison result={{ ...result, aggregates: [category("Competencies"), category("Dispositions")] }} />);
 expect(html).toContain("Mayor mejora en competencias");
 expect(html).toContain("Competencies: +20 pp");
 expect(html).not.toContain("Self Efficacy");
 const absent = renderToStaticMarkup(<CourseComparison result={{ ...result, aggregates: [category("Environmental Knowledge")] }} />);
 expect(absent).not.toContain("Mayor mejora en competencias");
 expect(absent).not.toContain("Criterio pendiente");
});

it("publishes only selected categories and uses proportional weights without altering source results", () => {
 const category = (name: string, pre: number, post: number) => ({ definitionId: result.primaryDefinitionId, instrument: "Instrumento", version: 1, level: "category" as const, category: name, subcategory: null, pre, post, change: post - pre, preEffectiveWeights: [], postEffectiveWeights: [], issue: null });
 const original: CourseResultsDto = { ...result,
  questions: ["A","B","C"].map(category => ({ ...result.questions[0]!, id: category, text: "Pregunta " + category, category })),
  groups: ["A","B","C"].map(category => ({ ...result.groups[0]!, category })),
  aggregates: [category("A",20,40),category("B",80,100),category("C",0,100),{ ...category("IAA",28,88),level:"index",category:null }],
  distributions: [{ ...result.distributions[0]!, categoryWeights: [{category:"A",weight:20},{category:"B",weight:30},{category:"C",weight:50}],subcategoryWeights:[] }],
 };
 const source = JSON.stringify(original);
 const selected = selectCourseResultCategories(original, ["A","B"]);
 expect(selected.categorySelection).toEqual({included:["A","B"],excluded:["C"]});
 expect(selectCourseResultCategories(selected,["A","B"]).categorySelection).toEqual(selected.categorySelection);
 expect(selectCourseResultCategories(selected,["A"]).categorySelection).toEqual({included:["A"],excluded:["B","C"]});
 expect(selected.questions.map(row=>row.category)).toEqual(["A","B"]);
 expect(selected.groups.map(row=>row.category)).toEqual(["A","B"]);
 const index=selected.aggregates.find(row=>row.level==="index")!;
 expect(index.pre).toBe(56);expect(index.post).toBe(76);expect(index.change).toBe(20);
 expect(selected.distributions[0]?.categoryWeights).toEqual([{category:"A",weight:40},{category:"B",weight:60}]);
 expect(JSON.stringify(buildCourseReportPreview(selected,{templateKey:"course-impacts-general",textContent:{}},true).data)).not.toContain("Pregunta C");
 const preview = buildCourseReportPreview(original,{templateKey:"course-impacts-general",textContent:{},categories:["A","B"]},true);
 expect(preview.data.tables.categoryBreakdown?.map(row=>row.name)).toEqual(["A","B"]);
 expect(JSON.stringify(original)).toBe(source);
 expect(selectCourseResultCategories(original,["A","B","C"]).aggregates).toBe(original.aggregates);
 for (const selection of [[],["Unknown"],["A","A"]]) expect(()=>selectCourseResultCategories(original,selection)).toThrow();
});
