import { SurveySetupReview } from "./SurveySetupReview";
import { InstrumentConfigCsv } from "./InstrumentConfigCsv";
import { AnalysisWeightsSummary, SetupAnalysisScoring } from "./SetupAnalysisScoring";
import { instrumentQuestion, individualMatrixQuestions, preserveOpenQuestion, questionSection, configurationChanges, type MatrixDefaults, assistantScoringReady, questionClassification, canConfigureAnalysis, questionCatalogIssue, analysisWeightsReady, type AnalysisWeights } from "@epi/shared";
import { QuestionVisibilityRules } from "./QuestionVisibilityRules";
import { migrationResult, migrationProgress } from "./migration-result";
import { canContinueSetup, incompleteQuestionMoment, invalidQuestionFilter, questionSetupIssue, isQuestionSetupReviewed, setQuestionSetupReview, type SetupStep } from "./setup-steps";
import { subcategoryChoices } from "./category-options";
import { SurveySetupQuestionSchema, QUESTION_ROLES, QUESTION_TYPES, type SurveySetupQuestion } from "@epi/shared";
import { useEffect, useRef, useState } from "react";
import type { JotformLabelDto, CategoryDto, SurveySetupDto, FormQuestionsPreviewDto, JotformAccountDto, JotformFormDto, JotformFormsPage, SiteDto } from "@epi/shared";
import { Badge, Button, Card, Dropdown, Label, Modal, Pagination, Table, TextField } from "@epi/ui";
import { CatalogNameField } from "../../shared/components";
import type { Column } from "@epi/ui";
import { surveyApi } from "./api";
import { useI18n } from "../../lib/i18n";

export function JotformFormsCatalog({ onRegistered, configureFormId }: { onRegistered: () => void; configureFormId?: string | undefined }) {
  const { t } = useI18n();
  const [result, setResult] = useState<JotformFormsPage>({ forms: [], meta: { total: 0, page: 1, pageSize: 5, totalPages: 0 } });
  const [accounts, setAccounts] = useState<JotformAccountDto[]>([]);
  const [labels, setLabels] = useState<JotformLabelDto[]>([]);
  const [labelFilter, setLabelFilter] = useState("");
  const [labelsError, setLabelsError] = useState<string | null>(null);
  const [accountId, setAccountId] = useState("");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [sites, setSites] = useState<SiteDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [target, setTarget] = useState<JotformFormDto | null>(null);
  const [preview, setPreview] = useState<FormQuestionsPreviewDto | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewRevision, setPreviewRevision] = useState(0);
  const [step, setStep] = useState<SetupStep>(1);
  const [sectionFilter, setSectionFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [openQuestionId, setOpenQuestionId] = useState<string | null>(null);
  useEffect(() => { setSectionFilter(""); setStatusFilter("all"); setOpenQuestionId(null); }, [target]);
  const [siteId, setSiteId] = useState("");
  const [categoryCatalog, setCategoryCatalog] = useState<{ organizationId: string | null; items: CategoryDto[]; loading: boolean; error: string | null }>({ organizationId: null, items: [], loading: false, error: null });
  const [categoryReload, setCategoryReload] = useState(0);
  const organizationId = sites.find((site) => site.id === siteId)?.organizationId ?? null;
  const subcategories = subcategoryChoices(categoryCatalog.items, organizationId);
  const categoriesLoading = !!target && !!organizationId && (categoryCatalog.organizationId !== organizationId || categoryCatalog.loading);
  const categoryError = categoryCatalog.organizationId === organizationId ? categoryCatalog.error : null;
  const [type, setType] = useState<"LOCAL" | "VISITING" | "OTHER">("LOCAL");
  const [setup, setSetup] = useState<SurveySetupDto | null>(null);
  const [description, setDescription] = useState("");
  const [programName, setProgramName] = useState("");
  const [instrumentKind, setInstrumentKind] = useState<"LEARNING" | "FOLLOW_UP" | "CQS" | "">("");
  const [migrate, setMigrate] = useState(false);
  const [responseCount, setResponseCount] = useState<number | null>(null);
  const [countError, setCountError] = useState<string | null>(null);
  const [countRevision, setCountRevision] = useState(0);
  const [migration, setMigration] = useState<{ definitionId: string; running: boolean; message: string; retry: boolean } | null>(null);
  const [migrationAutoSync, setMigrationAutoSync] = useState(false);
  const [savingMigrationSync, setSavingMigrationSync] = useState(false);
  const [migrationSyncError, setMigrationSyncError] = useState<string | null>(null);
  const [migrationFormId, setMigrationFormId] = useState<string | null>(null);
  const submitting = useRef(false);
  const selectedSite = sites.find(site => site.id === siteId);
  const kindOptions = [{ value: "", label: "Selecciona el tipo de instrumento" }, { value: "LEARNING", label: "Evaluación de aprendizaje" }, { value: "FOLLOW_UP", label: "Evaluación de seguimiento" }, { value: "CQS", label: "CQS" }];
  const [instrumentName, setInstrumentName] = useState("");
  const [activityType, setActivityType] = useState("");
  const [activityName, setActivityName] = useState("");
  const [matrixDefaults, setMatrixDefaults] = useState<MatrixDefaults>([]);
  const [questionEdits, setQuestionEdits] = useState<SurveySetupQuestion[]>([]);
  const [analysisWeights, setAnalysisWeights] = useState<AnalysisWeights>([]);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [setupReload, setSetupReload] = useState(0);
  const [savedMessage, setSavedMessage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLabels([]);
    setLabelsError(null);
    if (accountId) void surveyApi.jotformLabels(accountId).then(data => { if (active) setLabels(data); }).catch((error: unknown) => { if (active) setLabelsError(error instanceof Error ? error.message : t("common.genericError")); });
    return () => { active = false; };
  }, [accountId, revision]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void surveyApi.jotformForms({ ...(accountId ? { accountId } : {}), page, ...(labelFilter === "none" ? { withoutLabels: "true" as const } : labelFilter ? { labelId: labelFilter.slice(6) } : {}) })
      .then((data) => { if (!cancelled) setResult(data); })
      .catch((err: unknown) => { if (!cancelled) setLoadError(err instanceof Error ? err.message : t("jotformCatalog.loadError")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [accountId, page, revision, labelFilter]);

  useEffect(() => {
    let cancelled = false;
    setOptionsError(null);
    void Promise.all([surveyApi.jotformAccounts(), surveyApi.sites()])
      .then(([nextAccounts, nextSites]) => { if (!cancelled) { setAccounts(nextAccounts); setSites(nextSites); } })
      .catch((err: unknown) => { if (!cancelled) setOptionsError(err instanceof Error ? err.message : t("jotformCatalog.loadError")); });
    return () => { cancelled = true; };
  }, [revision]);

  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    setPreview(null);
    setPreviewError(null);
    void surveyApi.previewFormQuestions(target.id)
      .then((data) => { if (!cancelled) setPreview(data); })
      .catch((err: unknown) => { if (!cancelled) setPreviewError(err instanceof Error ? err.message : t("jotformCatalog.previewError")); });
    return () => { cancelled = true; };
  }, [target, previewRevision]);

  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    setSetup(null);
    setSetupError(null);
    void surveyApi.formSetup(target.id).then((data) => {
      if (cancelled) return;
      setSetup(data); setSiteId(data.draft.siteId ?? ""); setType(data.draft.type);
      setDescription(data.draft.description ?? ""); setProgramName(data.draft.programName ?? (data.draft.type === "LOCAL" ? "Local" : data.draft.type === "VISITING" ? "Visiting" : "Otro")); setInstrumentKind(data.draft.instrumentKind ?? "");
      setInstrumentName(target.title); setActivityName(data.draft.activityName); setActivityType(data.draft.activityType ?? "");
      setQuestionEdits((data.draft.questions ?? []).map(question => question.role === "FILTER" ? { ...question, role: "INFORMATIONAL", isFilter: true } : question));
      setAnalysisWeights(data.draft.analysisWeights ?? []);
      setMatrixDefaults(data.draft.matrixDefaults ?? []);
    }).catch((err: unknown) => { if (!cancelled) setSetupError(err instanceof Error ? err.message : t("jotformCatalog.loadError")); });
    return () => { cancelled = true; };
  }, [target, setupReload]);

  useEffect(() => {
    if (!target || !organizationId) {
      setCategoryCatalog({ organizationId: null, items: [], loading: false, error: null });
      return;
    }
    let cancelled = false;
    setCategoryCatalog({ organizationId, items: [], loading: true, error: null });
    void surveyApi.categories(organizationId).then((items) => {
      if (!cancelled) setCategoryCatalog({ organizationId, items, loading: false, error: null });
    }).catch((err: unknown) => {
      if (!cancelled) setCategoryCatalog({ organizationId, items: [], loading: false, error: err instanceof Error ? err.message : t("jotformCatalog.loadError") });
    });
    return () => { cancelled = true; };
  }, [target, organizationId, categoryReload]);

  useEffect(() => {
    if (!target || step !== 4) return;
    let cancelled = false;
    setResponseCount(null); setCountError(null); setMigrate(false);
    void surveyApi.responseCount(target.id).then(result => { if (!cancelled) setResponseCount(result.total); }).catch(() => { if (!cancelled) setCountError("No se pudo consultar el número de respuestas."); });
    return () => { cancelled = true; };
  }, [target, step, countRevision]);

  useEffect(() => {
    if (!configureFormId) return;
    let cancelled = false;
    void surveyApi.formSetup(configureFormId).then(data => {
      if (!cancelled) openModal({ id: configureFormId, title: data.draft.instrumentName, registered: true, status: "ENABLED", syncedAt: new Date().toISOString(), createdAt: null, updatedAt: null, submissionCount: null, lastSubmission: null, url: null, labelIds: [], accountName: null });
    }).catch(error => { if (!cancelled) setLoadError(error instanceof Error ? error.message : "No se pudo abrir el instrumento"); });
    return () => { cancelled = true; };
  }, [configureFormId]);

  async function saveDraft(nextStep?: SetupStep) {
    if (!target || !setup) return;
    setSaving(true); setError(null); setSavedMessage(false);
    try {
      const saved = await surveyApi.saveFormSetup(target.id, {
        revision: setup.revision,
        draft: { baseDefinitionId: setup.draft.baseDefinitionId, configurationMode: "instrument", matrixDefaults: [], scoringWeightsVersion: 4 as const, analysisWeights, siteId: siteId || null, type, programName, ...(instrumentKind ? { instrumentKind } : {}), instrumentName: target.title, activityName, activityType, description, ...(setup.draft.timeZone ? { timeZone: setup.draft.timeZone } : {}), ...(setup.draft.categoryWeights !== undefined ? { categoryWeights: setup.draft.categoryWeights } : {}), ...(setup.draft.subcategoryWeights !== undefined ? { subcategoryWeights: setup.draft.subcategoryWeights } : {}), questions: configuredQuestions.map(edit => SurveySetupQuestionSchema.parse({ ...edit, classification: questionClassification(edit), text: preview?.scoredQuestions.find(question => question.externalId === edit.externalId)?.text ?? edit.text })) },
      });
      setSetup({ ...setup, ...saved });
      setDescription(saved.draft.description ?? "");
      setInstrumentName(saved.draft.instrumentName); setActivityName(saved.draft.activityName); setActivityType(saved.draft.activityType ?? "");
      setQuestionEdits(saved.draft.questions ?? []);
      setAnalysisWeights(saved.draft.analysisWeights ?? []);
      setMatrixDefaults(saved.draft.matrixDefaults ?? []);
      setSavedMessage(true);
      if (nextStep) setStep(nextStep);
    } catch (err) { setError(err instanceof Error ? err.message : t("unregistered.error")); }
    finally { setSaving(false); }
  }

  function loadCsvDraft(draft: import("@epi/shared").SurveySetupDraft) {
    setSiteId(draft.siteId ?? ""); setType(draft.type); setProgramName(draft.programName ?? ""); setInstrumentKind(draft.instrumentKind ?? ""); setActivityName(draft.activityName); setActivityType(draft.activityType ?? ""); setDescription(draft.description ?? ""); setQuestionEdits(draft.questions ?? []); setAnalysisWeights(draft.analysisWeights ?? []); setMatrixDefaults([]); setSavedMessage(false); setStep(1);
  }

  async function handleSync() {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const data = await surveyApi.syncJotformForms(accountId);
      setSyncMessage(`${t("jotformCatalog.syncResultPrefix")} ${data.added.length}`);
      setRevision((value) => value + 1);
    } catch (err) {
      setSyncMessage(err instanceof Error ? err.message : t("jotformCatalog.syncError"));
    } finally { setSyncing(false); }
  }

  function openModal(form: JotformFormDto) {
    setTarget(form);
    setPreview(null);
    setPreviewError(null);
    setSiteId("");
    setType("LOCAL");
    setStep(1);
    setSetup(null); setSetupError(null); setSavedMessage(false);
    setDescription(""); setProgramName(""); setInstrumentKind(""); setMigrate(false); setResponseCount(null); setCountError(null); setInstrumentName(form.title); setActivityName(""); setActivityType(""); setQuestionEdits([]); setAnalysisWeights([]);
    setError(null);
  }

  function closeModal() { if (!saving) setTarget(null); }

  async function showMigration(formId: string) {
    setMigrationFormId(formId);
    try {
      const progress = await surveyApi.migrationStatus(formId);
      setMigration(migrationProgress(progress));
      setMigrationAutoSync(progress.autoSync ?? false);
      setMigrationSyncError(null);
    } catch (error) { setLoadError(error instanceof Error ? error.message : "No se pudo consultar la migración"); }
  }

  useEffect(() => {
    if (!migration?.running || !migrationFormId) return;
    let active = true;
    const timer = setInterval(() => {
      void surveyApi.migrationStatus(migrationFormId).then(progress => {
        if (!active || progress.status === "IDLE") return;
        setMigration(migrationProgress(progress));
      }).catch(() => {
        if (active) setMigration(current => current && { ...current, running: false, retry: true, message: "No se pudo consultar el avance. El proceso puede seguir en curso; puedes volver a consultar o reintentar sin duplicar respuestas." });
      });
    }, 2000);
    return () => { active = false; clearInterval(timer); };
  }, [migration?.running, migrationFormId]);

  async function changeMigrationAutoSync(autoSync: boolean) {
    if (!migration || savingMigrationSync) return;
    setSavingMigrationSync(true);
    setMigrationSyncError(null);
    try {
      const result = await surveyApi.setMigrationAutoSync(migration.definitionId, autoSync);
      setMigrationAutoSync(result.autoSync);
    } catch (error) { setMigrationSyncError(error instanceof Error ? error.message : "No se pudo guardar la sincronización"); }
    finally { setSavingMigrationSync(false); }
  }

  async function runMigration(definitionId: string) {
    setMigration({ definitionId, running: true, message: "Se están actualizando las encuestas…", retry: false });
    try {
      const result = await surveyApi.migrateResponses(definitionId);
      setMigration({ definitionId, running: false, ...migrationResult(result) });
    } catch {
      setMigration({ definitionId, running: false, message: "No se pudieron migrar las encuestas. Si se perdió la conexión, el proceso puede seguir en curso. El instrumento quedó asociado; puedes reintentar sin duplicar respuestas.", retry: true });
    }
  }

  async function associate() {
    if (submitting.current || !target || !siteId || !preview || !setup || step !== 4) return;
    submitting.current = true;
    setSaving(true);
    setError(null);
    try {
      const registered = await surveyApi.registerDefinition({ jotformFormId: target.id, siteId, type, setupRevision: setup.revision, ...(setup.draft.baseDefinitionId ? { baseDefinitionId: setup.draft.baseDefinitionId } : {}) });
      if (setup.activeVersion) setSyncMessage(`Se activó la versión ${setup.activeVersion.version + 1}. Las respuestas anteriores conservan su versión.`);
      setTarget(null);
      setRevision((value) => value + 1);
      onRegistered();
      if (migrate) { setMigrationAutoSync(false); setMigrationSyncError(null); setMigrationFormId(target.id); await runMigration(registered.definitionId); }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("unregistered.error"));
    } finally { setSaving(false); submitting.current = false; }
  }

  const staleEdits = preview ? questionEdits.filter((edit) => !preview.scoredQuestions.some((question) => question.externalId === edit.externalId)) : [];
  const configuredQuestions = individualMatrixQuestions(preview?.scoredQuestions.map(question => {
    const configured = { ...question, ...questionEdits.find(edit => edit.externalId === question.externalId), text: question.text };
    const current = question.type === "OPEN_TEXT" ? preserveOpenQuestion(configured) : configured;
    return instrumentQuestion({ ...current, classification: questionClassification(current) });
  }) ?? [], matrixDefaults).map(instrumentQuestion);
  const questionSections = [...new Map(configuredQuestions.filter(question => !question.sourceContext?.matrixParent).map(question => { const section = questionSection(question); return [section.key, { ...section, heading: question.sourceContext?.section?.text }]; })).values()];
  const sectionQuestions = configuredQuestions.filter(question => !question.sourceContext?.matrixParent && (!sectionFilter || questionSection(question).key === sectionFilter));
  const currentCatalog = categoryCatalog.organizationId === organizationId ? categoryCatalog.items : [];
  const issueForQuestion = (question: (typeof configuredQuestions)[number]) => questionSetupIssue(question, configuredQuestions, currentCatalog, organizationId, categoriesLoading || !!categoryError, preview?.scoredQuestions.find(source => source.externalId === question.externalId));
  const questionIssues = new Map(sectionQuestions.map(question => [question.externalId, issueForQuestion(question)]));
  const reviewedIds = new Set(sectionQuestions.filter(question => isQuestionSetupReviewed(question, questionIssues.get(question.externalId) ?? null)).map(question => question.externalId));
  const pendingQuestions = sectionQuestions.length - reviewedIds.size;
  const visibleQuestions = sectionQuestions.filter(question => statusFilter === "all" || reviewedIds.has(question.externalId) === (statusFilter === "ready"));
  const multipleActivities = questionEdits.filter((question) => question.role === "ACTIVITY").length > 1;
  const multipleSchools = questionEdits.filter((question) => question.role === "SCHOOL_GROUP").length > 1;
  const multipleIdentifiers = questionEdits.filter((question) => question.role === "IDENTIFIER").length > 1;
  const multipleMoments = questionEdits.filter((question) => question.role === "MOMENT").length > 1;
  const incompleteMoment = configuredQuestions.some(incompleteQuestionMoment);
  const includeIaa = instrumentKind !== "CQS" && instrumentKind !== "FOLLOW_UP";
  const participationReady = instrumentKind === "CQS" || configuredQuestions.every(question => !canConfigureAnalysis(question) || question.analysisParticipation != null);
  const analysisRulesReady = instrumentKind === "CQS" || (participationReady && assistantScoringReady(configuredQuestions) && analysisWeightsReady(configuredQuestions, analysisWeights, includeIaa));
  const invalidFilter = configuredQuestions.some(invalidQuestionFilter);
  const catalogQuestionsReady = !categoriesLoading && !categoryError && configuredQuestions.every(question => !questionCatalogIssue(question, categoryCatalog.organizationId === organizationId ? categoryCatalog.items : [], organizationId, true));
  const invalidQuestions = multipleActivities || multipleSchools || multipleMoments || multipleIdentifiers || staleEdits.length > 0 || questionEdits.some((edit) => !edit.text.trim());

  const canContinue = canContinueSetup(step, {
    generalReady: !!setup && !!siteId && !!instrumentName.trim() && !!activityName.trim() && !!instrumentKind && !!programName && !!activityType && !!selectedSite?.programs?.includes(programName) && !!selectedSite?.activityTypes?.includes(activityType) && !optionsError,
    questionsReady: catalogQuestionsReady && !!preview && !preview.skipped.some(question => question.type === "control_matrix") && !previewError && !invalidQuestions && !incompleteMoment && !invalidFilter,
    weightsReady: analysisRulesReady,
  });

  function editQuestions(questions: SurveySetupQuestion[]) {
    questions = individualMatrixQuestions(questions);
    const ids = new Set(questions.map(question => question.externalId));
    setQuestionEdits(previous => [...previous.filter(question => !ids.has(question.externalId)), ...questions]);
    setSavedMessage(false);
  }
  function editQuestion(question: (typeof configuredQuestions)[number], reviewed = true) {
    const next = setQuestionSetupReview(question, reviewed, issueForQuestion(question));
    editQuestions([next]);
    if (next.setupReviewed && !reviewedIds.has(question.externalId)) {
      setOpenQuestionId(current => current === question.externalId ? null : current);
    }
  }

  const columns: Column<JotformFormDto>[] = [
    { key: "title", header: t("jotformCatalog.table.title") },
    { key: "accountName", header: t("jotformCatalog.table.account"), render: (form) => form.accountName ?? "—" },
    { key: "id", header: t("jotformCatalog.table.id") },
    { key: "registered", header: t("jotformCatalog.table.status"), render: (form) => <Badge color={form.registered ? "green" : form.hasDraft ? "yellow" : "blue"}>{form.registered ? "Vinculada" : form.hasDraft ? "Borrador" : t("jotformCatalog.new")}</Badge> },
    { key: "syncedAt", header: t("jotformCatalog.table.syncedAt"), render: (form) => new Date(form.syncedAt).toLocaleString() },
    { key: "actions", header: "", align: "right", render: (form) => form.registered ? <div className="flex gap-2"><Button size="sm" onClick={() => openModal(form)}>Configurar vinculada</Button><Button size="sm" onClick={() => void showMigration(form.id)}>Migrar respuestas</Button></div> : <Button size="sm" onClick={() => openModal(form)}>{form.hasDraft ? "Continuar borrador" : t("unregistered.associate")}</Button> },
  ];

  return (
    <Card>
      <Label variant="subtitle">{t("jotformCatalog.title")}</Label>
      <p className="mb-4 text-sm text-gray-500">{t("jotformCatalog.body")}</p>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Dropdown label={t("jotformCatalog.account")} options={[
          { label: t("jotformCatalog.allAccounts"), value: "" },
          ...accounts.map((account) => ({ label: account.name, value: account.id })),
        ]} value={accountId} onChange={(value) => { setAccountId(value); setLabelFilter(""); setPage(1); }} />
        <Dropdown label={t("jotformCatalog.labels")} value={labelFilter} options={[{ value: "", label: t("jotformCatalog.allLabels") }, { value: "none", label: t("jotformCatalog.noLabels") }, ...labels.map(label => ({ value: `label:${label.id}`, label: label.name }))]} onChange={(value) => { setLabelFilter(value); setPage(1); }} />
        {!accountId && <p className="text-sm text-gray-500">{t("jotformCatalog.selectLabelAccount")}</p>}
        {labelsError && <p role="alert" className="text-danger">{labelsError}</p>}

        <Button size="sm" variant="secondary" loading={syncing} onClick={() => void handleSync()}>{t("jotformCatalog.sync")}</Button>
      </div>
      {syncMessage && <p role="status" className="mb-3 text-sm text-primary">{syncMessage}</p>}
      {(loadError || optionsError) && <div role="alert" className="mb-3 text-sm text-danger">
        <p>{loadError ?? optionsError}</p>
        <Button variant="secondary" size="sm" onClick={() => setRevision((value) => value + 1)}>{t("jotformCatalog.retry")}</Button>
      </div>}
      <Table columns={columns} rows={loadError ? [] : result.forms} keyExtractor={(form) => form.id} loading={loading} emptyText={t(accountId ? "jotformCatalog.noMatches" : "jotformCatalog.empty")} />
      {!loadError && <Pagination meta={result.meta} onPageChange={setPage} disabled={loading} />}

      <Modal width="60rem" open={target !== null} onClose={closeModal} title={`${setup?.activeVersion ? "Nueva versión de" : t("unregistered.associateTitlePrefix")} ${target?.title ?? ""}`}
        footer={<>
          <Button variant="secondary" disabled={saving} onClick={closeModal}>{t("unregistered.cancel")}</Button>
          {step > 1 && <Button variant="secondary" disabled={saving} onClick={() => setStep((step - 1) as SetupStep)}>{t("jotformCatalog.back")}</Button>}
          {step < 4 ? <>
            <Button variant="secondary" disabled={!setup || saving || invalidQuestions} onClick={() => void saveDraft()}>{t("surveySetup.saveDraft")}</Button>
            <Button loading={saving} disabled={!canContinue} onClick={() => void saveDraft((step + 1) as SetupStep)}>{t(step === 3 ? "jotformCatalog.review" : "surveySetup.continue")}</Button>
          </> : <Button disabled={!canContinue} loading={saving} onClick={() => void associate()}>{setup?.activeVersion ? `Activar versión ${setup.activeVersion.version + 1}` : t("unregistered.associate")}</Button>}
        </>}>
        <div className="space-y-4">
          <Label variant="subtitle">{t(`surveySetup.step${step}`)}</Label>
          {setupError && <div role="alert"><p className="text-sm text-danger">{setupError}</p><Button variant="secondary" onClick={() => setSetupReload((value) => value + 1)}>{t("jotformCatalog.retry")}</Button></div>}
          {!setup && !setupError && <p role="status">{t("surveySetup.loading")}</p>}
          {setup?.activeVersion && <p className="rounded border p-2 text-sm">Editando borrador para versión {setup.activeVersion.version + 1}. La versión {setup.activeVersion.version} sigue activa hasta confirmar. Las respuestas anteriores conservan su versión.</p>}
          {savedMessage && <p role="status" className="text-sm text-primary">{t("surveySetup.saved")}</p>}
          {step < 4 ? <fieldset disabled={saving || !setup} className="space-y-4" onChange={() => setSavedMessage(false)}>
            {step === 1 && <>
            {setup && preview && target && <InstrumentConfigCsv key={target.id} formId={target.id} draft={{ ...setup.draft, configurationMode: "instrument", siteId: siteId || null, type, programName, ...(instrumentKind ? { instrumentKind } : {}), instrumentName, activityName, activityType, description, questions: configuredQuestions, analysisWeights, matrixDefaults: [] }} questions={configuredQuestions} categories={categoryCatalog.organizationId === organizationId ? categoryCatalog.items : []} catalogReady={!categoriesLoading && !categoryError} sites={sites} onApply={loadCsvDraft} />}
            <TextField label={t("surveySetup.instrument")} value={instrumentName} readOnly />
            <TextField label={t("surveySetup.description")} value={description} maxLength={2000} onChange={(event) => setDescription(event.target.value)} />
            <Dropdown label="Tipo de instrumento" value={instrumentKind} options={kindOptions} onChange={value => setInstrumentKind(value as typeof instrumentKind)} />
            <Dropdown label={t("unregistered.site")} options={[{ label: t("unregistered.selectSitePlaceholder"), value: "" }, ...sites.filter(site => site.isActive).map((site) => ({ label: site.name, value: site.id }))]} value={siteId} disabled={!!setup?.activeVersion} onChange={value => { setSiteId(value); setProgramName(""); setActivityType(""); }} />
            <Dropdown label={t("surveySetup.program")} value={programName} options={[{ value: "", label: "Selecciona el programa" }, ...(selectedSite?.programs ?? []).map(name => ({ value: name, label: name }))]} onChange={value => { setProgramName(value); setType(value === "Local" ? "LOCAL" : value === "Visiting" ? "VISITING" : "OTHER"); }} />
            <Dropdown label={t("surveySetup.activityType")} value={activityType} options={[{ value: "", label: "Selecciona el tipo de actividad" }, ...(selectedSite?.activityTypes ?? []).map(name => ({ value: name, label: name }))]} onChange={setActivityType} />
            {siteId && !selectedSite?.activityTypes?.length && <p role="status" className="text-sm">Agrega los tipos de actividad en Organizaciones y sitios → Sitios antes de continuar.</p>}
            <CatalogNameField key={`${target?.id}-activity`} label={t("surveySetup.activity")} value={activityName} onChange={(name) => { setActivityName(name); setSavedMessage(false); }} options={setup?.options.filter((option) => option.kind === "ACTIVITY").map((option) => option.name) ?? []} />
            </>}
            {(step === 2 || step === 3) && <>
            {categoriesLoading && <p role="status">{t("surveySetup.categoriesLoading")}</p>}
            {categoryError && <div role="alert" className="text-sm text-danger"><p>{categoryError}</p><Button variant="secondary" onClick={() => setCategoryReload((value) => value + 1)}>{t("jotformCatalog.retry")}</Button></div>}
            <p className="text-sm text-gray-500">{t("surveySetup.categoriesHint")}</p>
            {preview?.skipped.some(question => question.type === "control_matrix") && <p role="alert" className="text-sm text-danger">Hay matrices que requieren revisión del origen. Puedes guardar el borrador, pero no activar una configuración incompleta.</p>}
            </>}
            {preview && step > 1 && <div className="space-y-3">
              <Label>{t("surveySetup.editQuestions")}</Label>
              <p className="text-sm text-gray-500">{t("surveySetup.editQuestionsHint")}</p>
              {step === 3 && instrumentKind !== "CQS" && <SetupAnalysisScoring key={target?.id} reuseScope={organizationId && target ? { organizationId, surveyType: type, formId: target.id } : undefined} instrumentMode questions={configuredQuestions} onChange={editQuestions} weights={analysisWeights} includeIaa={includeIaa} onWeightsChange={weights => { setAnalysisWeights(weights); setSavedMessage(false); }} />}
              {step === 3 && instrumentKind === "CQS" && <p className="rounded border border-amber-300 p-3 text-sm">La puntuación CQS continúa pendiente de validación metodológica. Se conserva su clasificación y se puede asociar sin activar cálculos.</p>}

              {step === 2 && <><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><Dropdown label="Filtrar preguntas por sección" value={sectionFilter} options={[{ value: "", label: "Todas las secciones" }, ...questionSections.map(section => ({ value: section.key, label: questionSections.filter(item => item.label === section.label).length > 1 && section.heading ? `${section.label} (${section.heading})` : section.label }))]} onChange={value => { setSectionFilter(value); setOpenQuestionId(null); }} /><Dropdown label="Estado en el paso 2" value={statusFilter} options={[{ value: "all", label: "Todas" }, { value: "pending", label: "Solo pendientes" }, { value: "ready", label: "Solo revisadas" }]} onChange={value => { setStatusFilter(value); setOpenQuestionId(null); }} /></div>
              <p className="text-sm" role="status">{reviewedIds.size} revisadas · {pendingQuestions} pendientes · {visibleQuestions.length} visibles. Confirma las preguntas con valores por defecto; la puntuación se revisa en el paso 3.</p>
              {!visibleQuestions.length && <p className="text-sm text-gray-500">No hay preguntas configurables para estos filtros.</p>}</>}
              {step === 2 && [false, true].map(conditional => <section key={String(conditional)} className="space-y-3">
                {conditional && <h3 className="border-t pt-4 font-semibold">Preguntas ocultas o condicionales</h3>}
                {conditional && !visibleQuestions.some(question => question.visibility?.hidden || question.visibility?.rules.length) && !preview.skipped.some(question => question.visibility?.hidden || question.visibility?.rules.length) && <p className="text-sm text-gray-500">No hay preguntas ocultas o condicionales para estos filtros.</p>}
                {visibleQuestions.filter(question => Boolean(question.visibility?.hidden || question.visibility?.rules.length) === conditional).map(question => {
                  const expanded = openQuestionId === question.externalId;
                  const reviewed = reviewedIds.has(question.externalId);
                  const panelId = `${target?.id}-question-${question.externalId}`;
                  return <div key={question.externalId} className="rounded border">
                    <div className="flex items-center gap-3 px-3">
                      <button type="button" className="flex min-w-0 flex-1 items-start gap-2 py-3 text-left" aria-expanded={expanded} aria-controls={panelId} onClick={() => setOpenQuestionId(current => current === question.externalId ? null : question.externalId)}>
                        <span aria-hidden="true" className="shrink-0">{expanded ? "▾" : "▸"}</span>
                        <span className="min-w-0 break-words">
                          <span className="flex flex-wrap items-center gap-2"><span className="text-xs">Sección: {questionSection(question).label}</span><Badge color={reviewed ? "green" : "yellow"}>{reviewed ? "Revisada" : "Pendiente"}</Badge></span>
                          <span className="block text-sm font-medium">{question.text}</span>
                        </span>
                      </button>
                      <label className="shrink-0" title="Marcar como revisada"><input type="checkbox" role="switch" aria-label={`Revisada: ${question.text}`} checked={reviewed} disabled={!!questionIssues.get(question.externalId)} onChange={event => editQuestion(question, event.target.checked)} /></label>
                    </div>
                    <div id={panelId} hidden={!expanded} className="space-y-2 border-t p-3">
                {expanded && <>
                {question.visibility && (question.visibility.hidden || question.visibility.rules.length > 0) && <QuestionVisibilityRules visibility={question.visibility} questions={configuredQuestions} />}
                {questionIssues.get(question.externalId) && <p className="text-sm text-amber-700">{questionIssues.get(question.externalId)}</p>}
                {question.sourceContext?.matrix && JSON.stringify(question.sourceContext.matrix) !== JSON.stringify(preview.scoredQuestions.find(item => item.externalId === question.externalId)?.sourceContext?.matrix) && <div role="alert"><p>La pregunta cambió en el formulario. Confirma su correspondencia antes de guardar.</p><Button size="sm" onClick={() => { const current = preview.scoredQuestions.find(item => item.externalId === question.externalId); if (current) editQuestion({ ...question, sourceContext: current.sourceContext ?? null }); }}>Confirmar pregunta actual</Button></div>}
                <Dropdown id={`${target?.id}-${question.externalId}-type`} label={t("jotformCatalog.questionType")} value={question.type} disabled={preview.scoredQuestions.find(item => item.externalId === question.externalId)?.type === "OPEN_TEXT"} options={QUESTION_TYPES.map((value) => ({ value, label: t(`surveySetup.types.${value}`) }))} onChange={(value) => editQuestion({ ...question, text: question.text, type: value as SurveySetupQuestion["type"], role: question.role ?? "SCORED", weight: value === "OPEN_TEXT" ? null : question.weight })} />
                <Dropdown id={`${target?.id}-${question.externalId}-role`} label={t("surveySetup.role")} value={question.role ?? "SCORED"} options={QUESTION_ROLES.filter(value => value !== "FILTER" && (question.type !== "OPEN_TEXT" || value !== "SCORED")).map((value) => ({ value, label: t(`surveySetup.roles.${value}`) }))} onChange={(value) => editQuestion({ ...question, text: question.text, type: question.type, role: value as SurveySetupQuestion["role"], weight: value === "SCORED" ? question.weight : null })} />
                {question.type === "OPEN_TEXT" && <p className="text-sm">No participa en cálculos. Sus respuestas se consultan en Preguntas abiertas.</p>}
                {(question.role ?? "SCORED") === "SCORED" && question.type !== "OPEN_TEXT" && <>
                  <TextField id={`${target?.id}-${question.externalId}-category`} label={t("surveySetup.weightCategory")} value={question.classification?.category ?? ""} readOnly helperText="Se obtiene de la subcategoría seleccionada." />
                  <Dropdown id={`${target?.id}-${question.externalId}-subcategory`} label="Subcategoría" value={subcategories.find(item => item.category === question.classification?.category && item.subcategory === question.classification?.subcategory)?.value ?? ""} options={[{ value: "", label: "Selecciona una subcategoría" }, ...subcategories.map(item => ({ value: item.value, label: `${item.subcategory} (${item.category})` }))]} disabled={categoriesLoading} onChange={value => { const selected = subcategories.find(item => item.value === value); editQuestion({ ...question, classification: { category: selected?.category ?? "", subcategory: selected?.subcategory ?? null } }); }} />
                </>}
                {step === 2 && !categoriesLoading && questionCatalogIssue(question, categoryCatalog.organizationId === organizationId ? categoryCatalog.items : [], organizationId, true) && <p role="alert" className="text-sm text-danger">{questionCatalogIssue(question, categoryCatalog.organizationId === organizationId ? categoryCatalog.items : [], organizationId, true)}</p>}
                {question.weight && ((question.role ?? "SCORED") !== "SCORED" || question.type === "OPEN_TEXT") && <Button variant="secondary" size="sm" onClick={() => editQuestion({ ...question, weight: null })}>{t("surveySetup.removeWeight")}</Button>}
                {!canConfigureAnalysis(question) && <>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={question.isFilter ?? false} disabled={!question.isFilter && (!["control_radio", "control_dropdown", "control_yesno"].includes(question.controlType ?? "") || !question.options.length)} onChange={event => editQuestion({ ...question, isFilter: event.target.checked })} />Usar también como filtro</label>
                {step === 2 && question.isFilter && <div className="space-y-2">
                  <p className="text-sm">Sus opciones se agregan automáticamente al filtro del instrumento. Puedes personalizar las etiquetas que se mostrarán.</p>
                  {question.options.map((value, optionIndex) => <TextField key={value} id={`${target?.id}-${question.externalId}-filter-${optionIndex}`} label={`${t("surveySetup.filterLabel")}: ${value}`} value={question.optionLabels?.find((item) => item.value === value)?.label ?? value} maxLength={200} onChange={(event) => editQuestion({ ...question, optionLabels: [...(question.optionLabels ?? []).filter((item) => item.value !== value && question.options.includes(item.value)), ...(event.target.value.trim() ? [{ value, label: event.target.value }] : [])] }, question.setupReviewed ?? false)} />)}
                </div>}
                </>}
                {step === 2 && question.role === "MOMENT" && <div className="space-y-2">
                  <p className="text-sm">Los nombres de abajo son respuestas originales del formulario. En cada lista eliges el momento del sistema: Pre o Post.</p>
                  {question.options.map((option, optionIndex) => <Dropdown key={option} id={`${target?.id}-${question.externalId}-moment-${optionIndex}`} label={option} value={question.momentMappings?.find((mapping) => mapping.value === option)?.moment ?? ""} options={[{ value: "", label: t("surveySetup.select") }, ...(["PRE", "POST"] as const).map((value) => ({ value, label: t(`surveySetup.moments.${value}`) }))]} onChange={(value) => editQuestion({ ...question, role: "MOMENT", momentMappings: [...(question.momentMappings ?? []).filter((mapping) => mapping.value !== option && question.options.includes(mapping.value)), ...(value ? [{ value: option, moment: value as "PRE" | "POST" | "POST_POST" }] : [])] })} />)}
                </div>}
                </>}
                    </div>
                  </div>;
                })}
                {conditional && preview.skipped.filter(question => question.visibility?.hidden || question.visibility?.rules.length).map((question, index) => {
                  const key = `skipped:${index}`;
                  const expanded = openQuestionId === key;
                  const panelId = `${target?.id}-skipped-question-${index}`;
                  return <div key={key} className="rounded border">
                    <div className="flex items-center gap-3 px-3">
                      <button type="button" className="flex min-w-0 flex-1 items-start gap-2 py-3 text-left" aria-expanded={expanded} aria-controls={panelId} onClick={() => setOpenQuestionId(current => current === key ? null : key)}>
                        <span aria-hidden="true" className="shrink-0">{expanded ? "▾" : "▸"}</span>
                        <span className="min-w-0 break-words"><span className="flex flex-wrap items-center gap-2"><span className="text-xs">Sección: Sin sección reconocida</span><Badge color="yellow">Pendiente</Badge></span><span className="block text-sm font-medium">{question.text || "Pregunta sin texto"}</span></span>
                      </button>
                      <input type="checkbox" role="switch" aria-label={`Revisada: ${question.text || "Pregunta sin texto"}`} checked={false} disabled />
                    </div>
                    <div id={panelId} hidden={!expanded} className="space-y-2 border-t p-3">
                      {expanded && <>{question.visibility && <QuestionVisibilityRules visibility={question.visibility} questions={configuredQuestions} />}<p className="text-sm text-amber-700">{question.reason}. Control de origen: {question.type}. Se conserva sin activar puntuaciones; es necesario revisar su estructura para reconocerlo.</p></>}
                    </div>
                  </div>;
                })}
              </section>)}


              {step === 2 && !!preview.conditionWarnings?.length && <div role="alert" className="rounded border border-amber-300 p-3 text-sm"><p>Hay condiciones de Jotform pendientes de revisión:</p><ul>{preview.conditionWarnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></div>}
              {invalidFilter && <p role="alert" className="text-sm text-danger">{t("surveySetup.filterInvalid")}</p>}
              {step >= 3 && !catalogQuestionsReady && <p role="alert" className="text-sm text-danger">Revisa las categorías/subcategorías en Preguntas: deben pertenecer al catálogo activo de la organización.</p>}
              {step === 3 && !analysisRulesReady && <p role="alert" className="text-sm text-danger">Completa la puntuación de las preguntas (respuesta correcta, puntos de todas las opciones vigentes o rango y dirección completos; revisa también políticas incompletas y opciones no puntuables) y los porcentajes de cada análisis: subcategorías al 100% por categoría y categorías del IAA al 100% cuando corresponda. Puedes guardar el borrador incompleto.</p>}
              {(multipleMoments || incompleteMoment) && <p role="alert" className="text-sm text-danger">{t("surveySetup.momentIncomplete")}</p>}
              {multipleActivities && <p role="alert" className="text-sm text-danger">{t("surveySetup.oneActivity")}</p>}
              {multipleSchools && <p role="alert" className="text-sm text-danger">{t("surveySetup.oneSchool")}</p>}
              {multipleIdentifiers && <p role="alert" className="text-sm text-danger">{t("surveySetup.oneIdentifier")}</p>}
              {staleEdits.length > 0 && <div role="alert" className="text-sm text-danger">
                <p>{t("surveySetup.staleQuestions")}</p>
                <ul>{staleEdits.map((edit) => <li key={edit.externalId}>{edit.text}</li>)}</ul>
                <Button variant="secondary" onClick={() => { setQuestionEdits((previous) => previous.filter((edit) => !staleEdits.some((stale) => stale.externalId === edit.externalId))); setSavedMessage(false); }}>{t("surveySetup.removeStale")}</Button>
              </div>}
            </div>}
            {preview && <p className="text-sm text-gray-600">{preview.scoredQuestions.filter(question => !question.sourceContext?.matrixParent).length} {t("jotformCatalog.previewQuestions")} · {preview.catalogMatches.length} {t("jotformCatalog.previewCatalog")}</p>}
          </fieldset> : <>
            <p className="text-sm font-medium">{instrumentName} · {activityName}</p>
            {activityType && <p className="text-sm">{t("surveySetup.activityType")}: {activityType}</p>}
            {description && <p className="whitespace-pre-wrap text-sm">{description}</p>}
            <p className="text-sm">Tipo de instrumento: {kindOptions.find(option => option.value === instrumentKind)?.label}</p>
            <p className="text-sm">{sites.find((site) => site.id === siteId)?.name} · {programName}</p>
            <p className="text-sm text-gray-600">{t("jotformCatalog.reviewHint")}</p>
            {setup?.activeVersion && <section className="rounded border p-3"><h3 className="font-semibold">Cambios respecto a versión {setup.activeVersion.version}</h3><ul className="list-inside list-disc text-sm">{configurationChanges(setup.activeVersion.draft, setup.draft).map((change, index) => <li key={index}>{change}</li>)}</ul><p className="text-sm">Se activará una nueva versión para respuestas futuras. No se migran respuestas ni se reemplazan reportes publicados automáticamente.</p></section>}
            <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">La clasificación, participación y puntuaciones se guardarán por separado. Las respuestas quedarán pendientes hasta que se apruebe la metodología y se habilite el cálculo correspondiente.</p>
            <button type="button" aria-pressed={migrate} disabled={responseCount === null || responseCount === 0 || saving} className={`rounded px-4 py-2 font-medium disabled:opacity-50 ${migrate ? "bg-green-600 text-white" : "border border-gray-300 text-gray-700"}`} onClick={() => setMigrate(value => !value)}>Migrar {responseCount ?? "…"} respuestas</button>
            <p className="text-sm">{migrate ? "Activado: se migrarán las respuestas después de asociar el instrumento." : setup?.activeVersion ? "Desactivado: solo se activará la nueva versión." : "Desactivado: solo se asociará el instrumento."}</p>
            {countError && <div role="alert"><p>{countError}</p><Button variant="secondary" onClick={() => setCountRevision(value => value + 1)}>Reintentar conteo</Button></div>}
            {preview && <>
              {instrumentKind !== "CQS" && <AnalysisWeightsSummary instrumentMode questions={configuredQuestions} weights={analysisWeights} includeIaa={includeIaa} />}
              <SurveySetupReview questions={configuredQuestions} quality={instrumentKind === "CQS"} />
              {preview.catalogMatches.length > 0 && <div>
                <Label>{t("jotformCatalog.previewCatalog")}</Label>
                <ul className="list-inside list-disc text-sm">{preview.catalogMatches.map((field) => <li key={field.key}>{field.label}: {field.options.join(", ") || "—"}</li>)}</ul>
              </div>}
              {preview.skipped.length > 0 && <div className="rounded border border-amber-300 p-3 text-sm">
                <p>{t("jotformCatalog.skippedWarning")}</p>
                <ul className="list-inside list-disc">{preview.skipped.map((question, index) => <li key={`${question.externalId}:${index}`}>{question.text || question.externalId} ({question.type}){question.reason ? ` — ${question.reason}` : ""}</li>)}</ul>
              </div>}
            </>}
          </>}
          {!preview && !previewError && <p role="status">{t("table.loading")}</p>}
          {previewError && <div role="alert" className="text-sm text-danger"><p>{previewError}</p>
            <Button variant="secondary" size="sm" onClick={() => setPreviewRevision((value) => value + 1)}>{t("jotformCatalog.retry")}</Button></div>}
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        </div>
      </Modal>
      <Modal open={migration !== null} title="Migración de respuestas" onClose={() => { if (!migration?.running) setMigration(null); }} footer={!migration?.running && <>
        {migration?.retry && <Button onClick={() => { if (!submitting.current) { submitting.current = true; void runMigration(migration.definitionId).finally(() => { submitting.current = false; }); } }}>Migrar / reintentar respuestas</Button>}
        <Button onClick={() => setMigration(null)}>Cerrar</Button>
      </>}>
        <p role="status" aria-live="polite" aria-busy={migration?.running}>{migration?.message}</p>
        <p className="mt-3 text-sm">Las migraciones interrumpidas se retoman automáticamente con hasta cinco reintentos. También puedes reintentarlas manualmente.</p>
        <label className="mt-4 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={migrationAutoSync} disabled={savingMigrationSync || migration?.running} onChange={event => void changeMigrationAutoSync(event.target.checked)} />
          Sincronizar automáticamente cada 6 horas
        </label>
        <p className="mt-1 text-sm text-gray-600">Al activarlo queda programada para la próxima revisión del servidor y después cada seis horas. Desactivarlo evita futuras actualizaciones periódicas; conserva la migración actual y su recuperación.</p>
        {migrationSyncError && <p role="alert" className="mt-2 text-sm text-danger">{migrationSyncError}</p>}
      </Modal>
    </Card>
  );
}
