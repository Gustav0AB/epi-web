import { errorMessage } from "../lib/error-messages";
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
      "/api/reports/results?siteId=site1",
      "/api/reports/filters",
    ]);
  });

  it("encodes catalog filters and preserves pagination metadata", async () => {
    const page = { forms: [], meta: { page: 2, pageSize: 10, total: 12, totalPages: 2 } };
    const fetchMock = vi.fn().mockResolvedValue({ json: () => Promise.resolve({ success: true, data: page }) });
    vi.stubGlobal("fetch", fetchMock);
    await expect(surveyApi.jotformForms({ accountId: "account-1", search: "Pre & Post", page: 2 })).resolves.toEqual(page);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/surveys/jotform/forms?accountId=account-1&search=Pre+%26+Post&page=2");
  });

  it("loads and saves versioned form drafts", async () => {
    const draft = { siteId: null, type: "LOCAL" as const, instrumentName: "Learning", activityName: "Trip", questions: [{ externalId: "q1", text: "Corrected", type: "FREQUENCY" as const, weight: { category: "Learning", subcategory: null, maxScore: 5, correctAnswer: null } }, { externalId: "when", text: "When?", type: "ONE_ANSWER" as const, role: "MOMENT" as const, momentMappings: [{ value: "Follow-up", moment: "POST_POST" as const }] }] };
    const data = { revision: 2, draft, options: [] };
    const fetchMock = vi.fn().mockResolvedValue({ json: () => Promise.resolve({ success: true, data }) });
    vi.stubGlobal("fetch", fetchMock);
    await expect(surveyApi.formSetup("form1")).resolves.toEqual(data);
    await surveyApi.saveFormSetup("form1", { revision: 1, draft });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/surveys/jotform/forms/form1/setup");
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: "PUT", body: JSON.stringify({ revision: 1, draft }) });
  });

  it("throws the API error message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ success: false, error: { message: "Bad CSV" } }),
      })
    );

    await expect(surveyApi.groups()).rejects.toThrow(errorMessage("UNKNOWN"));
  });
});

it("loads instrument filter labels through the surveys endpoint", async () => {
  const fields = [{ id: "q1", label: "Program", options: [{ value: "A", label: "Program A" }] }];
  const fetchMock = vi.fn().mockResolvedValue({ json: () => Promise.resolve({ success: true, data: fields }) });
  vi.stubGlobal("fetch", fetchMock);
  await expect(surveyApi.filterFields("def1")).resolves.toEqual(fields);
  expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/surveys/definitions/def1/filters");
});

it("encodes the selected course and instrument when loading individual answers", async () => {
  const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ success: true, data: [] }) });
  vi.stubGlobal("fetch", fetchMock);
  await surveyApi.courseDetail({ siteId: "site-a", school: "School & Sea", date: "2026-06-01", surveyDefinitionId: "definition-a" });
  const url = new URL(fetchMock.mock.calls[0]![0], "https://test.local");
  expect(url.pathname).toBe("/api/surveys/course-detail");
  expect(Object.fromEntries(url.searchParams)).toEqual({ siteId: "site-a", school: "School & Sea", date: "2026-06-01", surveyDefinitionId: "definition-a" });
});

it("encodes label filters and labels account independently", async () => {
  const fetchMock = vi.fn().mockResolvedValue({ json: () => Promise.resolve({ success: true, data: [] }) });
  vi.stubGlobal("fetch", fetchMock);
  await surveyApi.jotformForms({ accountId: "account", labelId: "a&b", page: 1 });
  expect(fetchMock.mock.calls[0]![0]).toBe("/api/surveys/jotform/forms?accountId=account&labelId=a%26b&page=1");
  await surveyApi.jotformForms({ withoutLabels: "true" });
  expect(fetchMock.mock.calls[1]![0]).toBe("/api/surveys/jotform/forms?withoutLabels=true");
  await surveyApi.jotformLabels("account");
  expect(fetchMock.mock.calls[2]![0]).toBe("/api/surveys/jotform/labels?accountId=account");
});

it("queries persisted progress and resumes the same definition without registering it again", async () => {
  const progress = { definitionId: "definition", status: "INTERRUPTED", total: 4, updated: 2, pending: 0, errors: 0, skipped: 0 };
  const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ success: true, data: progress }) });
  vi.stubGlobal("fetch", fetchMock);
  await expect(surveyApi.migrationStatus("form /1")).resolves.toEqual(progress);
  await surveyApi.migrateResponses(progress.definitionId);
  expect(fetchMock.mock.calls.map(call => call[0])).toEqual(["/api/surveys/jotform/forms/form%20%2F1/migration", "/api/surveys/definitions/definition/migrate"]);
  expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: "POST" });
});

it("enables and disables periodic synchronization explicitly without starting an association", async () => {
  const fetchMock = vi.fn().mockImplementation((_url, options) => ({ json: async () => ({ success: true, data: JSON.parse(options.body) }) }));
  vi.stubGlobal("fetch", fetchMock);
  await expect(surveyApi.setMigrationAutoSync("def /1", true)).resolves.toEqual({ autoSync: true });
  await expect(surveyApi.setMigrationAutoSync("def /1", false)).resolves.toEqual({ autoSync: false });
  expect(fetchMock.mock.calls.map(call => call[0])).toEqual(["/api/surveys/definitions/def%20%2F1/migration-settings", "/api/surveys/definitions/def%20%2F1/migration-settings"]);
  expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "PATCH", headers: { "Content-Type": "application/json" }, body: '{"autoSync":true}' });
});
