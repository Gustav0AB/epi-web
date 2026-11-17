import { coursePage, courseSelectionError } from "./course-selection";
import { CourseSelectionReview } from "./CourseSelectionReview";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SiteDto, SurveyDefinitionDto, SurveyFilterField, SurveyGroupSearchRow } from "@epi/shared";
import { Badge, Button, Card, DatePicker, Dropdown, Label, Pagination, Table } from "@epi/ui";
import { useAuthStore } from "../../store/auth.store";
import { surveyApi } from "./api";
import { currentYearRange, surveyFilterOptions } from "./survey-filter-options";

export function SurveyGroupsPage() {
  const listScroll = useRef(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [reviewGroups, setReviewGroups] = useState<SurveyGroupSearchRow[] | null>(null);
  const initial = useMemo(currentYearRange, []);
  const user = useAuthStore(state => state.currentUser);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [entryType, setEntryType] = useState("");
  const [reviewStatus, setReviewStatus] = useState("");
  const [school, setSchool] = useState("");
  const [courseType, setCourseType] = useState("");
  const [siteId, setSiteId] = useState("");
  const [definitionId, setDefinitionId] = useState("");
  const [sites, setSites] = useState<SiteDto[]>([]);
  const [definitions, setDefinitions] = useState<SurveyDefinitionDto[]>([]);
  const [fields, setFields] = useState<SurveyFilterField[]>([]);
  const [questionId, setQuestionId] = useState("");
  const [answerValue, setAnswerValue] = useState("");
  const [rows, setRows] = useState<SurveyGroupSearchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterError, setFilterError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const accessibleSites = user?.role === "system_admin" ? sites : sites.filter(site => user?.siteIds.includes(site.id));
  const available = surveyFilterOptions(definitions.filter(definition => accessibleSites.some(site => site.id === definition.siteId)).map(definition => ({ ...definition, isWeighted: definition.isWeighted || definition.configurationVersion === 4 })), accessibleSites, siteId, definitionId);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([surveyApi.sites(), surveyApi.definitions()]).then(([sites, definitions]) => {
      if (!cancelled) { setSites(sites); setDefinitions(definitions); }
    }).catch(error => { if (!cancelled) setError(error instanceof Error ? error.message : "No se pudieron cargar los filtros"); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    let cancelled = false;
    setFields([]); setFilterError(null);
    if (definitionId) void surveyApi.filterFields(definitionId).then(fields => {
      if (!cancelled) setFields(fields);
    }).catch(error => { if (!cancelled) setFilterError(error instanceof Error ? error.message : "No se pudieron cargar los filtros del instrumento"); });
    return () => { cancelled = true; };
  }, [definitionId]);
  useEffect(() => {
    let cancelled = false;
    setError(null); setRows([]);
    if (from && to && from > to) { setError("La fecha desde debe ser anterior o igual a la fecha hasta"); return; }
    const query = new URLSearchParams({
      ...(entryType ? { entryType } : {}), ...(reviewStatus ? { reviewStatus } : {}),
      ...(siteId ? { siteId } : {}), ...(definitionId ? { surveyDefinitionId: definitionId } : {}),
      ...(from ? { from } : {}), ...(to ? { to } : {}),
      ...(questionId && answerValue ? { questionId, answerValue } : {}),
    });
    setLoading(true);
    void surveyApi.groupSearch(`?${query}`).then(result => {
      if (!cancelled) { setRows(result.rows); setSelectedIds(ids => ids.filter(id => result.rows.some(row => row.id === id))); }
    }).catch(error => { if (!cancelled) setError(error instanceof Error ? error.message : "No se pudieron cargar los cursos"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [siteId, definitionId, from, to, questionId, answerValue, entryType, reviewStatus, refresh]);

  function clear() {
    setSchool(""); setCourseType(""); setEntryType(""); setReviewStatus(""); setSiteId(""); setDefinitionId(""); setQuestionId(""); setAnswerValue(""); setFrom(""); setTo("");
  }
  useEffect(() => {
    if (!reviewGroups) window.scrollTo(0, listScroll.current);
  }, [reviewGroups]);

  const visibleRows = useMemo(() => rows.filter(row => (!school || !row.isOpenPublic && row.school === school) && (!courseType || (courseType === "public" ? row.isOpenPublic : !row.isOpenPublic))), [rows, school, courseType]);
  const { currentPage, totalPages, rows: pageRows } = coursePage(visibleRows, page);
  const selectedRows = visibleRows.filter(row => selectedIds.includes(row.id));
  const selectionError = courseSelectionError(selectedRows);
  const schoolOptions = [...new Set(rows.filter(row => !row.isOpenPublic).map(row => row.school))].sort((a, b) => a.localeCompare(b));
  if (reviewGroups) return <CourseSelectionReview groups={reviewGroups} sites={sites} onBack={() => { setReviewGroups(null); setRefresh(value => value + 1); }} />;
  return <div className="space-y-6">
    <Label variant="title">Cursos</Label>
    <Card><div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Dropdown label="Sitio" value={siteId} options={[{ value: "", label: "Todos los sitios autorizados" }, ...available.sites.map(site => ({ value: site.id, label: site.name }))]} onChange={value => { setSiteId(value); setDefinitionId(""); setQuestionId(""); setAnswerValue(""); }} />
      <Dropdown label="Instrumento" value={definitionId} options={[{ value: "", label: "Todos los instrumentos" }, ...available.definitions.map(definition => ({ value: definition.id, label: `${definition.title} (v${definition.version})` }))]} onChange={value => { setDefinitionId(value); setQuestionId(""); setAnswerValue(""); }} />
      <Dropdown label="Mostrar" value={entryType} options={[{ value: "", label: "Cursos y respuestas individuales" }, { value: "courses", label: "Cursos" }, { value: "individual", label: "Respuestas individuales" }]} onChange={setEntryType} />
      <Dropdown label="Estatus" value={reviewStatus} options={[{ value: "", label: "Todos" }, { value: "PENDING", label: "Pendiente de confirmar" }, { value: "REVIEWED", label: "Revisada" }, { value: "COMPLETED", label: "Completada" }, { value: "ERROR", label: "Con errores" }]} onChange={setReviewStatus} />
      <Dropdown label="Escuela / grupo" value={school} options={[{ value: "", label: "Todas las escuelas" }, ...schoolOptions.map(value => ({ value, label: value }))]} onChange={value => { setSchool(value); setSelectedIds([]); }} />
      <Dropdown label="Tipo de curso" value={courseType} options={[{ value: "", label: "Todos" }, { value: "school", label: "Escuela / grupo" }, { value: "public", label: "Abierto al público" }]} onChange={value => { setCourseType(value); setSelectedIds([]); }} />
      <DatePicker label="Desde" value={from} onChange={setFrom} />
      <DatePicker label="Hasta" value={to} onChange={setTo} />
      {fields.length > 0 && <Dropdown label="Filtro del instrumento" value={questionId} options={[{ value: "", label: "Todos" }, ...fields.map(field => ({ value: field.id, label: field.label }))]} onChange={value => { setQuestionId(value); setAnswerValue(""); }} />}
      {questionId && <Dropdown label="Valor" value={answerValue} options={[{ value: "", label: "Todos" }, ...(fields.find(field => field.id === questionId)?.options ?? [])]} onChange={setAnswerValue} />}
    </div><div className="mt-4 flex gap-2"><Button loading={loading} onClick={() => setRefresh(value => value + 1)}>Buscar</Button><Button variant="ghost" onClick={clear}>Limpiar filtros</Button></div></Card>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Card><p>Grupos</p><p className="text-2xl font-semibold">{visibleRows.length}</p></Card>
      <Card><p>Alumnos que respondieron</p><p className="text-2xl font-semibold">{Math.max(visibleRows.reduce((sum, row) => sum + row.preCount, 0), visibleRows.reduce((sum, row) => sum + row.postCount, 0))}</p><p className="text-sm text-gray-500">Se toma el momento con más respuestas de la selección.</p></Card>
    </div>
    {(error || filterError) && <p role="alert" className="text-danger">{error || filterError}</p>}
    <div className="flex gap-2"><Button disabled={!selectedRows.length || !!selectionError} onClick={() => { listScroll.current = window.scrollY; setReviewGroups(selectedRows); }}>Consultar selección ({selectedRows.length})</Button></div>
    {selectionError && <p role="alert" className="text-danger">{selectionError}</p>}
    <Table rows={pageRows} keyExtractor={row => row.id} loading={loading} columns={[
      { key: "select", header: "Seleccionar / consultar", render: row => row.courseId ? <Button size="sm" variant="ghost" onClick={() => { listScroll.current = window.scrollY; setReviewGroups([row]); }}>Consultar curso</Button> : <input type="checkbox" aria-label={`Seleccionar ${row.school} del ${row.date}`} checked={selectedIds.includes(row.id)} onChange={event => setSelectedIds(previous => event.target.checked ? [...previous, row.id] : previous.filter(id => id !== row.id))} /> },
      { key: "type", header: "Tipo", render: row => row.courseId ? "Curso" : "Respuestas individuales" },
      { key: "school", header: "Escuela", render: row => <p className="max-w-md whitespace-normal">{row.school}</p> },
      { key: "date", header: "Fecha", render: row => (row.dates ?? [row.date]).map(date => new Date(`${date}T00:00:00`).toLocaleDateString()).join(", ") },
      { key: "students", header: "Alumnos", align: "right", render: row => Math.max(row.preCount, row.postCount) },
      { key: "preCount", header: "Pre", align: "right" },
      { key: "postCount", header: "Post", align: "right" },
      { key: "status", header: "Estatus", render: row => row.courseStatus && row.courseStatus !== "DRAFT" ? <Badge color="green">{row.courseStatus === "COMPLETED" ? "Completada" : "Revisada"}</Badge> : row.courseStatus === "DRAFT" ? <Badge color="yellow">Pendiente de revisión</Badge> : row.errorCount ? <Badge color="red">{row.errorCount} con error</Badge> : row.pendingCount || row.contextNeedsReview || row.school === "Sin escuela" ? <Badge color="yellow">Requiere revisión</Badge> : <Badge color="green">Guardadas</Badge> },
    ]} />
    <Pagination meta={{ page: currentPage, pageSize: 10, total: visibleRows.length, totalPages }} onPageChange={setPage} disabled={loading} />
  </div>;
}
