import { afterEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "../store/auth.store";
import { surveyApi } from "../features/surveys/api";

afterEach(() => {
  vi.unstubAllGlobals();
  useAuthStore.setState({ token: null });
});

describe("surveyApi", () => {
  it("passes query strings through for survey lists", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ success: true, data: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    useAuthStore.setState({ token: "token-123" });

    await expect(surveyApi.list("?page=2")).resolves.toEqual([]);

    expect(fetchMock).toHaveBeenCalledWith("/api/surveys?page=2", {
      headers: { Authorization: "Bearer token-123" },
    });
  });

  it("sends JSON for weight updates", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ success: true, data: { ok: true } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await surveyApi.setWeight("q1", { category: "A", subcategory: "B", maxScore: 1, correctAnswer: "si" });

    expect(fetchMock).toHaveBeenCalledWith("/api/surveys/questions/q1/weight", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: "A", subcategory: "B", maxScore: 1, correctAnswer: "si" }),
    });
  });

  it("sends CSV for weight imports", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ success: true, data: { updated: 1, errors: [] } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await surveyApi.importWeights("def1", "question,weight");

    expect(fetchMock).toHaveBeenCalledWith("/api/surveys/definitions/def1/weights/import", {
      method: "POST",
      headers: { "Content-Type": "text/csv" },
      body: "question,weight",
    });
  });

  it("builds the remaining survey endpoints", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ success: true, data: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await surveyApi.definitions();
    await surveyApi.groups();
    await surveyApi.questions("def1");
    await surveyApi.reprocess("submission1");
    await surveyApi.sites();
    await surveyApi.summary();
    await surveyApi.completeGroup("Grupo A");
    await surveyApi.unregisteredForms();
    await surveyApi.jotformForms();
    await surveyApi.syncJotformForms();
    await surveyApi.previewFormQuestions("form1");
    await surveyApi.registerDefinition({ jotformFormId: "form1", siteId: "site1", type: "LOCAL" });
    await surveyApi.updateQuestion("q1", { type: "LIKERT" });
    await surveyApi.reprocessPending("def1");
    await surveyApi.categories("org1");
    await surveyApi.analyzeQuestion("q1");
    await surveyApi.reportResults("?siteId=site1");
    await surveyApi.reportFilters();

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "/api/surveys/definitions",
      "/api/surveys/groups",
      "/api/surveys/definitions/def1/questions",
      "/api/surveys/submission1/reprocess",
      "/api/sites",
      "/api/surveys/summary",
      "/api/surveys/groups/complete",
      "/api/surveys/unregistered",
      "/api/surveys/jotform/forms",
      "/api/surveys/jotform/forms/sync",
      "/api/surveys/jotform/forms/form1/questions",
      "/api/surveys/definitions",
      "/api/surveys/questions/q1",
      "/api/surveys/definitions/def1/reprocess-pending",
      "/api/categories?organizationId=org1",
      "/api/surveys/questions/q1/analyze",
      "/api/reports/results?siteId=site1",
      "/api/reports/filters",
    ]);
  });

  it("throws the API error message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ success: false, error: { message: "Bad CSV" } }),
      })
    );

    await expect(surveyApi.groups()).rejects.toThrow("Bad CSV");
  });
});
