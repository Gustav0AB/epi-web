import type {
  ApiResponse,
  CategoryDto,
  FormQuestionsPreviewDto,
  GroupSummary,
  HistoricalImportResult,
  HistoricalSubmissionDto,
  JotformFormDto,
  JotformFormsSyncResult,
  QuestionInsightDto,
  QuestionWithWeight,
  RegisterDefinitionInput,
  ReportRow,
  ReprocessPendingResult,
  SiteDto,
  SurveyDefinitionDto,
  SurveyListItem,
  UnregisteredFormDto,
  UpdateQuestionInput,
  WeightImportResult,
  WeightInput,
} from "@epi/shared";
import { useAuthStore } from "../../store/auth.store";

// fetch crudo con token (mismo patrón que UsersPage): el apiClient global
// enruta a IndexedDB offline y solo maneja JSON — aquí necesitamos también CSV.
async function call<T>(path: string, options?: RequestInit): Promise<T> {
  const token = useAuthStore.getState().token;
  const res = await fetch(path, {
    ...options,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  const json = (await res.json()) as ApiResponse<T>;
  if (!json.success) throw new Error(json.error.message);
  return json.data;
}

export const surveyApi = {
  list: (query: string) => call<SurveyListItem[]>(`/api/surveys${query}`),
  definitions: () => call<SurveyDefinitionDto[]>("/api/surveys/definitions"),
  groups: () => call<string[]>("/api/surveys/groups"),
  questions: (defId: string) =>
    call<QuestionWithWeight[]>(`/api/surveys/definitions/${defId}/questions`),
  setWeight: (questionId: string, input: WeightInput) =>
    call<unknown>(`/api/surveys/questions/${questionId}/weight`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  deleteWeight: (questionId: string) =>
    call<unknown>(`/api/surveys/questions/${questionId}/weight`, { method: "DELETE" }),
  importWeights: (defId: string, csv: string) =>
    call<WeightImportResult>(`/api/surveys/definitions/${defId}/weights/import`, {
      method: "POST",
      headers: { "Content-Type": "text/csv" },
      body: csv,
    }),
  reprocess: (id: string) =>
    call<unknown>(`/api/surveys/${id}/reprocess`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }),
  sites: () => call<SiteDto[]>("/api/sites"),
  summary: () => call<GroupSummary[]>("/api/surveys/summary"),
  historicalSubmissions: (query: string) =>
    call<HistoricalSubmissionDto[]>(`/api/surveys/jotform/submissions${query}`),
  importHistoricalSubmissions: (input: {
    surveyDefinitionIds: string[];
    from?: string;
    to?: string;
    submissionIds?: string[];
  }) =>
    call<HistoricalImportResult>("/api/surveys/jotform/submissions/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  completeGroup: (groupName: string) =>
    call<{ completed: number }>("/api/surveys/groups/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupName }),
    }),
  unregisteredForms: () => call<UnregisteredFormDto[]>("/api/surveys/unregistered"),
  jotformForms: () => call<JotformFormDto[]>("/api/surveys/jotform/forms"),
  syncJotformForms: () =>
    call<JotformFormsSyncResult>("/api/surveys/jotform/forms/sync", { method: "POST" }),
  previewFormQuestions: (formId: string) =>
    call<FormQuestionsPreviewDto>(`/api/surveys/jotform/forms/${formId}/questions`),
  registerDefinition: (input: RegisterDefinitionInput) =>
    call<{ definitionId: string } & ReprocessPendingResult>("/api/surveys/definitions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  updateQuestion: (questionId: string, input: UpdateQuestionInput) =>
    call<unknown>(`/api/surveys/questions/${questionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  reprocessPending: (defId: string) =>
    call<ReprocessPendingResult>(`/api/surveys/definitions/${defId}/reprocess-pending`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }),
  categories: (organizationId: string) =>
    call<CategoryDto[]>(`/api/categories?organizationId=${organizationId}`),
  analyzeQuestion: (questionId: string) =>
    call<QuestionInsightDto>(`/api/surveys/questions/${questionId}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }),
  updateOpenQuestionsSummary: (defId: string, summary: string) =>
    call<{ openQuestionsSummary: string | null }>(`/api/surveys/definitions/${defId}/open-questions-summary`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ summary }),
    }),
  reportResults: (query: string) => call<ReportRow[]>(`/api/reports/results${query}`),
  reportFilters: () =>
    call<{
      sites: { id: string; name: string }[];
      schools: string[];
      categories: { name: string; subcategory: string | null }[];
    }>("/api/reports/filters"),
};
