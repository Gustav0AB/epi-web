import { onlineRequest } from "../../lib/api-client";
import type { CourseReportDraftDto, CourseReportDraft, CourseResultsDto, CourseOptionsDto, CourseEditionsPage, CourseEditionDto, CourseEditionDetailDto, CourseResponsePage, CreateCourseEditionInput, CourseMembershipInput, SubmissionContextReviewInput } from "@epi/shared";
import type { AssistantMigrationProgress } from "@epi/shared";
import type {
  ApiResponse,
  JotformLabelDto,
  CourseExpectationInput,
  CourseDetailQuery,
  CourseSubmissionDto,
  SurveyFilterField,
  SurveySetupDto,
  SaveSurveySetupInput,
  CategoryDto,
  FormQuestionsPreviewDto,
  GroupSummary,
  HistoricalImportResult,
  HistoricalSubmissionDto,
  JotformFormsPage,
  JotformFormsQuery,
  JotformFormsSyncResult,
  JotformAccountDto,
  QuestionWithWeight,
  RegisterDefinitionInput,
  ReportRow,
  ReportDetail,
  ReprocessPendingResult,
  SiteDto,
  SurveyDefinitionDto,
  SurveyGroupSearchResult,
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
  return onlineRequest<T>(path, {
    ...options,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });

}

export type PublishedReportFilterOptions = {
  sites: { id: string; name: string; programs: string[] }[];
  definitions: { id: string; siteId: string; name: string; kind: string | null; version: number; program: string | null }[];
  publications: { id: string; courseId: string; name: string; school: string; version: number; siteId: string; definitionId: string; dates: string[] }[];
};

export const surveyApi = {
  publishedReportAggregate: (filters: { definitionId: string; siteId?: string; program?: string; from: string; to: string }) =>
    call<{ template: import("@epi/shared").ReportDocumentTemplate; data: import("@epi/shared").ReportData } | null>(`/api/surveys/published-report-aggregate?${new URLSearchParams(filters)}`),
  publishedReportFilterOptions: () => call<PublishedReportFilterOptions>("/api/surveys/published-report-options"),
  publishedCourseReports: (page = 1, school = "") => {
    const query = new URLSearchParams({ page: String(page), ...(school ? { school } : {}) });
    return call<import("@epi/shared").CourseReportPublicationsPage>(`/api/surveys/published-courses?${query}`);
  },
  publishedCourseReport: (id: string) => call<import("@epi/shared").CourseReportPublication>(`/api/surveys/published-courses/${encodeURIComponent(id)}`),
  courseReportHistory: (id: string, page = 1) => call<import("@epi/shared").CourseReportPublicationsPage>(`/api/surveys/courses/${encodeURIComponent(id)}/publications?page=${page}`),
  publishCourseEdition: (id: string, expectedRevision: number, expectedVersion: number) => call<import("@epi/shared").CourseReportPublication>(`/api/surveys/courses/${encodeURIComponent(id)}/publications`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedRevision, expectedVersion }) }),
  courseReportDraft: (id: string) => call<CourseReportDraftDto>(`/api/surveys/courses/${encodeURIComponent(id)}/report-draft`),
  saveCourseReportDraft: (id: string, expectedRevision: number, draft: CourseReportDraft) => call<CourseReportDraftDto>(`/api/surveys/courses/${encodeURIComponent(id)}/report-draft`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedRevision, draft }) }),
  setCourseExpectedParticipants: (id: string, expectedRevision: number, expectedParticipantsPre: number | null, expectedParticipantsPost: number | null) => call<{ saved: boolean; revision: number }>(`/api/surveys/courses/${encodeURIComponent(id)}/expected-participants`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedRevision, expectedParticipantsPre, expectedParticipantsPost }) }),
  courseComplementResults: (courseId: string, definitionId: string) => call<import("@epi/shared").CourseComplementResultsDto>(`/api/surveys/courses/${encodeURIComponent(courseId)}/complements/${encodeURIComponent(definitionId)}/results`),
  courseResults: (id: string, query = "") => call<CourseResultsDto>(`/api/surveys/courses/${encodeURIComponent(id)}/results${query}`),
  internalCourseReport: (courseIds: string[]) => call<{ template: import("@epi/shared").ReportDocumentTemplate; data: import("@epi/shared").ReportData; courses: { id: string; name: string; school: string }[] }>("/api/surveys/internal-course-report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseIds }) }),
  homeSummary: () => call<{ reviewed: number; pending: number; responses: number; reports: number; recent: { id: string; receivedAt: string; instrument: string; site: string; program: string }[] }>("/api/surveys/home-summary"),
  courseOptions: () => call<CourseOptionsDto>("/api/surveys/courses/options"),
  courseEditions: (query = "") => call<CourseEditionsPage>(`/api/surveys/courses${query}`),
  createCourseEdition: (input: CreateCourseEditionInput) => call<CourseEditionDto>("/api/surveys/courses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }),
  courseEdition: (id: string, page = 1) => call<CourseEditionDetailDto>(`/api/surveys/courses/${encodeURIComponent(id)}?page=${page}`),
  courseResponseCandidates: (id: string, query = "") => call<CourseResponsePage>(`/api/surveys/courses/${encodeURIComponent(id)}/candidates${query}`),
  setCourseInstrument: (id: string, expectedRevision: number, definitionId: string, linked: boolean) => call<{ saved: boolean; revision: number }>(`/api/surveys/courses/${encodeURIComponent(id)}/instruments`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedRevision, definitionId, linked }) }),
  completeCourse: (id: string, expectedRevision: number, expectedVersion: number, categories?: string[]) => call<import("@epi/shared").CourseReportPublication>(`/api/surveys/courses/${encodeURIComponent(id)}/complete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedRevision, expectedVersion, categories }) }),
  setCourseMainSchool: (id: string, expectedRevision: number, school: string, isOpenPublic = false) => call<{ saved: boolean; revision: number }>(`/api/surveys/courses/${encodeURIComponent(id)}/main-school`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedRevision, school, isOpenPublic }) }),
  confirmCourseSelection: (participants: number, responses: { id: string; contextRevision: number }[], school: string, isOpenPublic = false) => call<{ saved: boolean; courseId: string }>("/api/surveys/course-selection/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ participants, responses, school, isOpenPublic }) }),
  splitCourseApplication: (id: string, applicationId: string, expectedRevision: number) => call<{ saved: boolean; courseId: string }>(`/api/surveys/courses/${encodeURIComponent(id)}/applications/${encodeURIComponent(applicationId)}/split`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedRevision }) }),
  setCourseMembership: (id: string, input: CourseMembershipInput) => call<{ saved: boolean; revision: number }>(`/api/surveys/courses/${encodeURIComponent(id)}/responses`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }),
  setSubmissionContext: (id: string, expectedRevision: number, context: SubmissionContextReviewInput["context"]) => call<{ saved: boolean }>(`/api/surveys/${encodeURIComponent(id)}/review-context`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedRevision, context }) }),
  setSubmissionMoment: (id: string, moment: "PRE" | "POST" | "POST_POST" | "CQS" | null, expectedRevision?: number) => call<{ saved: boolean }>(`/api/surveys/${encodeURIComponent(id)}/review-moment`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ moment, expectedRevision }) }),
  setSubmissionExclusion: (id: string, excluded: boolean, expectedRevision?: number) => call<{ saved: boolean }>(`/api/surveys/${encodeURIComponent(id)}/review-exclusion`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ excluded, expectedRevision }) }),
  courseDetail: (input: CourseDetailQuery) => {
    const params = new URLSearchParams({ siteId: input.siteId, school: input.school, date: input.date });
    if (input.groupId) params.set("groupId", input.groupId);
    if (input.surveyDefinitionId) params.set("surveyDefinitionId", input.surveyDefinitionId);
    return call<CourseSubmissionDto[]>(`/api/surveys/course-detail?${params}`);
  },
  saveCourseExpectation: (input: CourseExpectationInput) => call<{ saved: boolean }>("/api/surveys/group-expectation", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }),
  list: (query: string) => call<SurveyListItem[]>(`/api/surveys${query}`),
  reusableConfiguration: (id: string) => call<{ analysisWeights: unknown; questions: unknown[] }>(`/api/surveys/definitions/${encodeURIComponent(id)}/reuse-configuration`),
  definitions: () => call<SurveyDefinitionDto[]>("/api/surveys/definitions"),
  groups: () => call<string[]>("/api/surveys/groups"),
  filterFields: (defId: string) => call<SurveyFilterField[]>(`/api/surveys/definitions/${defId}/filters`),
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
  groupSearch: (query: string) => call<SurveyGroupSearchResult>(`/api/surveys/group-search${query}`),
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
  jotformLabels: (accountId: string) => call<JotformLabelDto[]>(`/api/surveys/jotform/labels?accountId=${encodeURIComponent(accountId)}`),
  jotformForms: (filters: Partial<JotformFormsQuery> = {}) => {
    const query = new URLSearchParams();
    if (filters.registered) query.set("registered", filters.registered);
    if (filters.accountId) query.set("accountId", filters.accountId);
    if (filters.labelId) query.set("labelId", filters.labelId);
    if (filters.withoutLabels) query.set("withoutLabels", filters.withoutLabels);
    if (filters.search) query.set("search", filters.search);
    if (filters.page) query.set("page", String(filters.page));
    return call<JotformFormsPage>(`/api/surveys/jotform/forms${query.size ? `?${query}` : ""}`);
  },
  jotformAccounts: () => call<JotformAccountDto[]>("/api/surveys/jotform/accounts"),
  syncJotformForms: (accountId = "") =>
    call<JotformFormsSyncResult>(`/api/surveys/jotform/forms/sync${accountId ? `?accountId=${encodeURIComponent(accountId)}` : ""}`, {
      method: "POST",
    }),
  responseCount: (formId: string) => call<{ total: number }>(`/api/surveys/jotform/forms/${encodeURIComponent(formId)}/response-count`),
  setMigrationAutoSync: (definitionId: string, autoSync: boolean) => call<{ autoSync: boolean }>(`/api/surveys/definitions/${encodeURIComponent(definitionId)}/migration-settings`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ autoSync }) }),
  migrationStatus: (formId: string) => call<AssistantMigrationProgress>(`/api/surveys/jotform/forms/${encodeURIComponent(formId)}/migration`),
  migrateResponses: (definitionId: string) => call<{ total: number; updated: number; pending: number; errors: number; skipped: number }>(`/api/surveys/definitions/${encodeURIComponent(definitionId)}/migrate`, { method: "POST" }),
  reprocessVersionsProgress: (formId: string) => call<{ runId: string; state: "RUNNING" | "FINISHED" | "INTERRUPTED"; lastUpdate: string; processed: number; total: number; updated: number; inCourse: number; published: number; pending: number; errors: number } | null>(`/api/surveys/jotform/forms/${encodeURIComponent(formId)}/reprocess-versions`),
  reprocessVersions: (formId: string) => call<{ total: number; updated: number; inCourse: number; published: number; pending: number; errors: number }>(`/api/surveys/jotform/forms/${encodeURIComponent(formId)}/reprocess-versions`, { method: "POST" }),
  formSetup: (formId: string) => call<SurveySetupDto>(`/api/surveys/jotform/forms/${encodeURIComponent(formId)}/setup`),
  saveFormSetup: (formId: string, input: SaveSurveySetupInput) =>
    call<Pick<SurveySetupDto, "draft" | "revision">>(`/api/surveys/jotform/forms/${encodeURIComponent(formId)}/setup`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
    }),
  previewFormQuestions: (formId: string) =>
    call<FormQuestionsPreviewDto>(`/api/surveys/jotform/forms/${formId}/questions`),
  registerDefinition: (input: RegisterDefinitionInput) =>
    call<{ definitionId: string; versionReprocess?: { total: number; updated: number; inCourse: number; published: number; pending: number; errors: number } | null; versionReprocessFailed?: boolean } & ReprocessPendingResult>("/api/surveys/definitions", {
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
  categories: (organizationId: string, siteId?: string) =>
    call<CategoryDto[]>(`/api/categories?${new URLSearchParams({ organizationId, ...(siteId ? { siteId } : {}) })}`),
  updateOpenQuestionsSummary: (defId: string, summary: string) =>
    call<{ openQuestionsSummary: string | null }>(`/api/surveys/definitions/${defId}/open-questions-summary`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ summary }),
    }),
  reportResults: (query: string) => call<ReportRow[]>(`/api/reports/results${query}`),
  reportDetail: (query: string) => call<ReportDetail>(`/api/reports/detail${query}`),
  reportFilters: () =>
    call<{
      sites: { id: string; name: string }[];
      schools: string[];
      categories: { name: string; subcategory: string | null }[];
    }>("/api/reports/filters"),
};
