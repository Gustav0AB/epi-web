import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import type { CourseResponseDto } from "@epi/shared";
import { surveyApi } from "../features/surveys/api";
import { CourseEditionsPage } from "../features/surveys/CourseEditionsPage";
import { CourseResponseContextModal } from "../features/surveys/CourseResponseContextModal";
afterEach(() => vi.unstubAllGlobals());
describe("explicit course flows", () => {
 it("sends course and response revisions separately and keeps instrument links explicit", async () => {
  const fetch = vi.fn().mockResolvedValue({ json: () => Promise.resolve({ success: true, data: {} }) }); vi.stubGlobal("fetch", fetch);
  const selection = { expectedRevision: 3, linked: true, responses: [{ id: "response", contextRevision: 7 }] };
  await surveyApi.setCourseMembership("course/id", selection);
  expect(fetch.mock.calls[0]![0]).toBe("/api/surveys/courses/course%2Fid/responses"); expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual(selection);
  await surveyApi.setCourseInstrument("course/id", 4, "quality", false);
  expect(fetch.mock.calls[1]![0]).toBe("/api/surveys/courses/course%2Fid/instruments"); expect(JSON.parse(fetch.mock.calls[1]![1].body)).toEqual({ expectedRevision: 4, definitionId: "quality", linked: false });
  await surveyApi.courseEdition("course/id", 2); await surveyApi.courseResponseCandidates("course/id", "?page=3");
  expect(fetch.mock.calls.slice(2).map(c => c[0])).toEqual(["/api/surveys/courses/course%2Fid?page=2", "/api/surveys/courses/course%2Fid/candidates?page=3"]);
 });
 it("saves an explicit expected base with revision, and supports clearing it", async () => {
  const fetch = vi.fn().mockResolvedValue({ json: () => Promise.resolve({ success: true, data: { saved: true, revision: 8 } }) }); vi.stubGlobal("fetch", fetch);
  await surveyApi.setCourseExpectedParticipants("course/id", 7, 50, 40);
  expect(fetch.mock.calls[0]![0]).toBe("/api/surveys/courses/course%2Fid/expected-participants");
  expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual({ expectedRevision: 7, expectedParticipantsPre: 50, expectedParticipantsPost: 40 });
  await surveyApi.setCourseExpectedParticipants("course/id", 8, null, null);
  expect(JSON.parse(fetch.mock.calls[1]![1].body).expectedParticipantsPost).toBeNull();
 });
 it("renders the course entry point without submitting or inferring courses", () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  const markup = renderToStaticMarkup(<MemoryRouter><CourseEditionsPage /></MemoryRouter>);
  expect(markup).toContain("Cursos y aplicaciones"); expect(markup).toContain("Crear edición de curso"); expect(markup).toContain("Buscar escuela del curso"); expect(markup).toContain("Buscar actividad del curso"); expect(fetch).not.toHaveBeenCalled();
 });
 it("shows confirmed and original demographic values and an explicit date correction", () => {
  const response = { id: "response", remoteId: "remote", instrument: "Learning", version: 1, contextRevision: 5, context: { school: "Escuela", date: "2026-11-01", activity: "Visita", age: 0, gender: "Otro", originalSchool: "01/11/2026 - Escuela", submittedAt: "2026-11-01T23:00:00Z", dateSource: "school_field", originalAge: "18 años", originalGender: false, needsReview: false } } as CourseResponseDto;
  const markup = renderToStaticMarkup(<CourseResponseContextModal response={response} onClose={() => {}} onSaved={async () => {}} />);
  expect(markup).toContain("Fecha de agrupación confirmada"); expect(markup).toContain("18 años"); expect(markup).toContain("false"); expect(markup).toContain('value="0"'); expect(markup).toContain("Restaurar contexto original");
 });
});
