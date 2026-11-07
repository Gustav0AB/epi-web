import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { CourseReportDraftSchema, SaveCourseReportDraftSchema, type CourseResultsDto } from "@epi/shared";
import { buildCourseReportPreview } from "../features/reports/course-report-preview";
import { courseImpactsGeneralTemplate } from "../features/reports/templates/course-impacts.template";
import { ReportRenderer } from "../features/reports/components/ReportRenderer";
import { CourseReportPage } from "../features/reports/CourseReportPage";
import { surveyApi } from "../features/surveys/api";
const result: CourseResultsDto = { courseId: "course", name: "Curso", school: "Escuela", siteId: "site", activity: "Visita", revision: 3, calculatedAt: "2026-11-05T18:00:00Z", methodology: "pending", primaryDefinitionId: "v1", aggregates: [], coverageThreshold: 80, expectedParticipants: null, expectedParticipantsPre: null, expectedParticipantsPost: null, preReceipts: 2, postReceipts: 1, excludedReceipts: 1, contextPendingReceipts: 0, sourcePendingReceipts: 0, complementaryReceipts: 1, unsupportedVersionReceipts: 0, distributions: [], questions: [], groups: [{ definitionId: "v1", instrument: "Aprendizaje", version: 1, category: "Learning", subcategory: "Knowledge", pre: { receipts: 2, complete: 1, incomplete: 1, withoutData: 0, validAnswers: 3 }, post: { receipts: 1, complete: 1, incomplete: 0, withoutData: 0, validAnswers: 2 } }], pending: ["Agregación por confirmar"] };
const draft = { templateKey: "course-impacts-general" as const, textContent: { studentQuote: "Aprendí sobre conservación", spotlightText: "Observaciones\nTexto manual" } };
afterEach(() => vi.unstubAllGlobals());
describe("E6 course draft and existing templates", () => {
 it("reuses the template without changing it or inventing indicators", () => {
  const before = JSON.stringify(courseImpactsGeneralTemplate); const output = buildCourseReportPreview(result,draft);
  expect(JSON.stringify(courseImpactsGeneralTemplate)).toBe(before); expect(output.data.kpis.overallImprovement).toBe("Sin datos"); expect(output.data.series.categoryComparison).toEqual([]); expect(output.data.tables.mostImproved).toEqual([]); expect(output.data.tables.courseBases![0]!.pre).toBe(2); expect(output.data.texts.studentQuote).toBe(draft.textContent.studentQuote);
  expect(output.template.blocks.some(block => block.type === "text" && block.content?.includes("NO PUBLICADO"))).toBe(true);
 });
 it("shows pending markers and provenance without zero or NaN percentages", () => {
  const output = buildCourseReportPreview(result,draft); const html = renderToStaticMarkup(<ReportRenderer {...output} mode="document" />);
  expect(html).toContain("Pendiente"); expect(html).toContain("Bases disponibles por subcategoría y versión"); expect(html).toContain("Aprendí sobre conservación"); expect(html).not.toContain("NaN"); expect(html).not.toMatch(/>0%</g); expect(html).not.toContain("+—%");
 });
 it("includes the saved expected base and each moment coverage in the exported report content", () => {
  const output = buildCourseReportPreview({ ...result, expectedParticipants: 50, expectedParticipantsPre: 50, expectedParticipantsPost: 50, preReceipts: 40, postReceipts: 35 },draft);
  const context = output.template.blocks.find(block => block.id === "course-review-context");
  if (!context || context.type !== "text") throw new Error("Falta el contexto del reporte");
  expect(context.content).toContain("Participantes esperados Pre: 50");
  expect(context.content).toContain("Pre: 80% (alcanza 80%)");
  expect(context.content).toContain("Post: 70% (no alcanza 80%)");
 });
 it("renders valid zero and positive indicators immediately in document mode", () => {
  const output = buildCourseReportPreview(result,draft); output.data.kpis = { overallSatisfaction: 0, overallImprovement: 25 };
  const html = renderToStaticMarkup(<ReportRenderer {...output} mode="document" />); expect(html).toContain("0%"); expect(html).toContain("25%");
 });
 it("does not turn an empty historical template into zero satisfaction", () => {
  const html = renderToStaticMarkup(<ReportRenderer template={courseImpactsGeneralTemplate} data={{ kpis: {}, series: {}, tables: {}, texts: {} }} mode="document" />);
  expect(html).not.toMatch(/>0%</g); expect(html).not.toContain("NaN");
 });
 it("rejects unknown templates, calculated/manual injection, excessive text and invalid dates", () => {
  for (const value of [{ ...draft, templateKey: "unknown" },{ ...draft, textContent: { overallImprovement: "100" } },{ ...draft, textContent: { studentQuote: "x".repeat(5001) } },{ ...draft, from: "2026-11-05", to: "2026-11-01" }]) expect(CourseReportDraftSchema.safeParse(value).success).toBe(false);
  expect(SaveCourseReportDraftSchema.safeParse({ expectedRevision: -1, draft }).success).toBe(false);
 });
 it("sends draft revision and explicit content to the scoped endpoint", async () => {
  const fetch = vi.fn().mockResolvedValue({ json: () => Promise.resolve({ success: true, data: {} }) }); vi.stubGlobal("fetch",fetch);
  await surveyApi.saveCourseReportDraft("course/id",3,draft);
  expect(fetch.mock.calls[0]![0]).toBe("/api/surveys/courses/course%2Fid/report-draft"); expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual({ expectedRevision: 3, draft });
 });
 it("does not write or publish on initial rendering", () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch",fetch); const html = renderToStaticMarkup(<MemoryRouter><CourseReportPage /></MemoryRouter>);
  expect(html).toContain("NO PUBLICADO"); expect(fetch).not.toHaveBeenCalled();
 });
});
