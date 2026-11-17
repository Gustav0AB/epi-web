import { useEffect, useMemo, useState } from "react";
import { ReportTabs } from "./ReportTabs";
import { CourseReportContentSchema, type SiteDto, type SurveyDefinitionDto, type SurveyFilterField, type SurveyGroupSearchRow, type ReportData } from "@epi/shared";
import { Button, Card, DatePicker, Dropdown, Label, Pagination, Table } from "@epi/ui";
import { surveyApi } from "../surveys/api";
import { coursePage } from "../surveys/course-selection";
import { surveyFilterOptions } from "../surveys/survey-filter-options";
import { ReportRenderer } from "./components/ReportRenderer";
import { ReportPdfDownload } from "./DocumentReportPage";

export function InternalCourseReportPage() {
  const [sites, setSites] = useState<SiteDto[]>([]); const [definitions, setDefinitions] = useState<SurveyDefinitionDto[]>([]);
  const [site, setSite] = useState(""); const [definition, setDefinition] = useState(""); const [status, setStatus] = useState(""); const [school, setSchool] = useState(""); const [courseType, setCourseType] = useState("");
  const [from, setFrom] = useState(""); const [to, setTo] = useState(""); const [questionId, setQuestionId] = useState(""); const [answerValue, setAnswerValue] = useState(""); const [fields, setFields] = useState<SurveyFilterField[]>([]);
  const [rows, setRows] = useState<SurveyGroupSearchRow[]>([]); const [selected, setSelected] = useState<string[]>([]); const [page, setPage] = useState(1);
  const [report, setReport] = useState<Awaited<ReturnType<typeof surveyApi.internalCourseReport>> | null>(null); const [texts, setTexts] = useState<ReportData["texts"]>({});
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const available = surveyFilterOptions(definitions.map(item => ({ ...item, isWeighted: item.isWeighted || item.configurationVersion === 4 })), sites, site, definition);
  useEffect(() => { let active = true; void Promise.all([surveyApi.sites(), surveyApi.definitions()]).then(([a,b]) => { if (active) { setSites(a); setDefinitions(b); } }).catch(() => { if (active) setError("No se pudieron cargar los filtros."); }); return () => { active = false; }; }, []);
  useEffect(() => { let active = true; setFields([]); if (definition) void surveyApi.filterFields(definition).then(value => { if (active) setFields(value); }).catch(() => { if (active) setError("No se pudieron cargar los filtros del instrumento."); }); return () => { active = false; }; }, [definition]);
  useEffect(() => { setRows([]); setSelected([]); setReport(null); }, [site, definition, status, from, to, questionId, answerValue]);
  const filtered = useMemo(() => rows.filter(row => row.courseId && (row.courseStatus === "REVIEWED" || row.courseStatus === "COMPLETED") && (!school || !row.isOpenPublic && row.school === school) && (!courseType || (courseType === "public" ? row.isOpenPublic : !row.isOpenPublic))), [rows, school, courseType]);
  const paging = coursePage(filtered, page);
  async function search() {
    if (from && to && from > to) { setError("La fecha inicial debe ser anterior a la final."); return; }
    setBusy(true); setError(null); setSelected([]); setReport(null);
    try { const params = new URLSearchParams({ entryType: "courses", ...(site ? { siteId: site } : {}), ...(definition ? { surveyDefinitionId: definition } : {}), ...(status ? { reviewStatus: status } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}), ...(questionId && answerValue ? { questionId, answerValue } : {}) }); setRows((await surveyApi.groupSearch(`?${params}`)).rows); setPage(1); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudieron consultar los cursos."); }
    finally { setBusy(false); }
  }
  async function generate() { setBusy(true); setError(null); setReport(null); try { setReport(await surveyApi.internalCourseReport(selected)); setTexts({}); } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo generar el reporte."); } finally { setBusy(false); } }
  const data = report ? { ...report.data, texts: { ...report.data.texts, ...texts } } : null;
  return <div className="space-y-5"><ReportTabs /><Label variant="title">Reportes internos</Label><p className="text-sm">Selecciona cursos revisados o completados. La consulta y los textos editados solo permanecen en esta pantalla.</p>
    <Card><fieldset disabled={busy}><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Dropdown label="Sitio" value={site} options={[{ value: "", label: "Todos los sitios autorizados" }, ...available.sites.map(item => ({ value: item.id, label: item.name }))]} onChange={value => { setSite(value); setDefinition(""); setQuestionId(""); setAnswerValue(""); }} />
      <Dropdown label="Instrumento" value={definition} options={[{ value: "", label: "Todos los instrumentos" }, ...available.definitions.map(item => ({ value: item.id, label: `${item.title} (v${item.version})` }))]} onChange={value => { setDefinition(value); setQuestionId(""); setAnswerValue(""); }} />
      <Dropdown label="Estatus" value={status} options={[{ value: "", label: "Revisados y completados" }, { value: "REVIEWED", label: "Revisados" }, { value: "COMPLETED", label: "Completados" }]} onChange={setStatus} />
      <Dropdown label="Escuela / grupo" value={school} options={[{ value: "", label: "Todas las escuelas" }, ...[...new Set(rows.filter(row => !row.isOpenPublic).map(row => row.school))].sort().map(value => ({ value, label: value }))]} onChange={value => { setSchool(value); setSelected([]); setReport(null); }} />
      <Dropdown label="Tipo de curso" value={courseType} options={[{ value: "", label: "Todos" }, { value: "school", label: "Escuela / grupo" }, { value: "public", label: "Abierto al público" }]} onChange={value => { setCourseType(value); setSelected([]); setReport(null); }} />
      <DatePicker label="Desde" value={from} onChange={setFrom} /><DatePicker label="Hasta" value={to} onChange={setTo} />
      {!!fields.length && <Dropdown label="Filtro del instrumento" value={questionId} options={[{ value: "", label: "Todos" }, ...fields.map(field => ({ value: field.id, label: field.label }))]} onChange={value => { setQuestionId(value); setAnswerValue(""); }} />}
      {!!questionId && <Dropdown label="Valor" value={answerValue} options={[{ value: "", label: "Todos" }, ...(fields.find(field => field.id === questionId)?.options ?? [])]} onChange={setAnswerValue} />}
    </div><Button className="mt-4" loading={busy} onClick={() => void search()}>Buscar cursos</Button></fieldset></Card>
    {error && <p role="alert" className="text-danger">{error}</p>}
    <Card><h2 className="font-semibold">Cursos disponibles</h2><Table rows={paging.rows} keyExtractor={row => row.id} emptyText="Busca cursos para comenzar." columns={[
      { key: "select", header: "Seleccionar", render: row => <input type="checkbox" aria-label={`Seleccionar ${row.courseName ?? row.school}`} checked={selected.includes(row.courseId!)} disabled={busy || !row.courseId || !selected.includes(row.courseId) && selected.length >= 50} onChange={event => { setSelected(current => event.target.checked ? [...current, row.courseId!] : current.filter(id => id !== row.courseId)); setReport(null); }} /> },
      { key: "courseName", header: "Curso" }, { key: "school", header: "Escuela" }, { key: "date", header: "Fecha" }, { key: "courseStatus", header: "Estatus", render: row => row.courseStatus === "COMPLETED" ? "Completado" : "Revisado" },
    ]} /><Pagination meta={{ page: paging.currentPage, pageSize: 10, total: filtered.length, totalPages: paging.totalPages }} onPageChange={setPage} /><Button loading={busy} disabled={!selected.length} onClick={() => void generate()}>Generar reporte ({selected.length}/50)</Button></Card>
    {report && data && <><Card><h2 className="font-semibold">Resultados agregados</h2><Table rows={data.tables.courseAggregates ?? []} keyExtractor={(_, index) => String(index)} columns={[{ key: "name", header: "Categoría / subcategoría" }, { key: "pre", header: "Pre" }, { key: "post", header: "Post" }, { key: "change", header: "Cambio relativo (%)" }]} /></Card><ReportPdfDownload template={report.template} data={data} appliedFilters={report.courses.map(course => ({ label: "Curso", value: course.name }))} notice="Consulta interna temporal · No publicada" /><ReportRenderer template={report.template} data={data} editContent={(key, value) => setTexts(current => ({ ...current, [key]: value }))} editImage={(key, file) => { if (!["image/jpeg", "image/png"].includes(file.type) || file.size > 1024 * 1024) { setError("Selecciona una imagen JPG o PNG de hasta 1 MB."); return; } const reader = new FileReader(); reader.onload = () => { if (typeof reader.result === "string" && CourseReportContentSchema.safeParse({ [key]: reader.result }).success) setTexts(current => ({ ...current, [key]: reader.result as string })); else setError("La imagen no es válida."); }; reader.onerror = () => setError("No se pudo leer la imagen."); reader.readAsDataURL(file); }} /></>}
  </div>;
}
