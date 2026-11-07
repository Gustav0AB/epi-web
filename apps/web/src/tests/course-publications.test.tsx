import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { PublishCourseEditionSchema, buildCourseReportPreview, type CourseResultsDto } from "@epi/shared";
import { surveyApi } from "../features/surveys/api";
import { PublishedCourseReportsPage } from "../features/reports/PublishedCourseReportsPage";
afterEach(() => vi.unstubAllGlobals());
describe("published course reports", () => {
 it("requests saved publications without recomputing current results", async () => {
  const fetch = vi.fn().mockResolvedValue({ json: () => Promise.resolve({ success: true, data: {} }) }); vi.stubGlobal("fetch",fetch);
  await surveyApi.publishedCourseReports(2); await surveyApi.publishedCourseReport("publication/id"); await surveyApi.courseReportHistory("course/id",3);
  expect(fetch.mock.calls.map(call => call[0])).toEqual(["/api/surveys/published-courses?page=2","/api/surveys/published-courses/publication%2Fid","/api/surveys/courses/course%2Fid/publications?page=3"]);
 });
 it("publishes only the saved revision and expected history version, never client indicators", async () => {
  const fetch = vi.fn().mockResolvedValue({ json: () => Promise.resolve({ success: true, data: {} }) }); vi.stubGlobal("fetch",fetch);
  await surveyApi.publishCourseEdition("course/id",8,2);
  expect(fetch.mock.calls[0]![0]).toBe("/api/surveys/courses/course%2Fid/publications");
  expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual({ expectedRevision: 8, expectedVersion: 2 });
  expect(PublishCourseEditionSchema.safeParse({ expectedRevision: 8, expectedVersion: 2, overallImprovement: 100 }).success).toBe(false);
  expect(PublishCourseEditionSchema.safeParse({ expectedRevision: -1, expectedVersion: 0 }).success).toBe(false);
 });
 it("renders a reader entry without draft controls, mutation or a live data request", () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch",fetch);
  const html = renderToStaticMarkup(<MemoryRouter><PublishedCourseReportsPage /></MemoryRouter>);
  expect(html).toContain("Reportes de aprendizaje publicados"); expect(html).not.toContain("Guardar borrador"); expect(fetch).not.toHaveBeenCalled();
 });
 it("maps approved learning aggregates into existing templates and never fabricates CQS or rankings", () => {
  const result = { name: "Curso", primaryDefinitionId: "v1", expectedParticipants: 50, expectedParticipantsPre: 50, expectedParticipantsPost: 50, preReceipts: 40, postReceipts: 40, excludedReceipts: 0, contextPendingReceipts: 0, sourcePendingReceipts: 0, revision: 2, calculatedAt: "2026-11-06T00:00:00Z", groups: [], pending: ["CQS pendiente"], aggregates: [
    { definitionId: "v1", level: "category", category: "Knowledge", pre: 25, post: 75, change: 50, instrument: "Aprendizaje", version: 1 },
    { definitionId: "v1", level: "index", category: null, pre: 25, post: 75, change: 50, instrument: "Aprendizaje", version: 1 },
  ] } as unknown as CourseResultsDto;
  const document = buildCourseReportPreview(result,{ templateKey: "course-impacts-general", textContent: {} },true);
  expect(document.data.kpis.overallImprovement).toBe(50); expect(document.data.kpis.overallSatisfaction).toBe("Pendiente");
  expect(document.data.series.categoryComparison).toEqual([{ name: "Knowledge", pre: 25, post: 75 }]); expect(document.data.tables.mostImproved).toEqual([]);
  expect(document.template.title).not.toContain("Borrador");
  expect(JSON.stringify(document.template.blocks)).toContain("PUBLICADO");
 });
});
