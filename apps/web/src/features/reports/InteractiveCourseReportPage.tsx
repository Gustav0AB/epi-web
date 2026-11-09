import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { courseImpactsGeneralTemplate, type CourseReportPublication, type ReportData } from "@epi/shared";
import { Card, DatePicker, Dropdown } from "@epi/ui";
import { surveyApi, type PublishedReportFilterOptions } from "../surveys/api";
import { ReportPdfDownload } from "./DocumentReportPage";
import { ReportRenderer } from "./components/ReportRenderer";

const emptyReport: ReportData = { kpis: {}, series: {}, tables: {}, texts: {} };
const reportPath = (id: string) => id ? `/interactive-reports/${encodeURIComponent(id)}` : "/interactive-reports";

export function InteractiveCourseReportPage() {
  const { publicationId } = useParams();
  const navigate = useNavigate();
  const [options, setOptions] = useState<PublishedReportFilterOptions | null>(null);
  const [site, setSite] = useState("");
  const [definition, setDefinition] = useState("");
  const [program, setProgram] = useState("");
  const [school, setSchool] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [publication, setPublication] = useState<CourseReportPublication | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aggregate, setAggregate] = useState<{ key: string; value: Awaited<ReturnType<typeof surveyApi.publishedReportAggregate>> } | null>(null);
  const [aggregateLoading, setAggregateLoading] = useState(false);
  const aggregateKey = JSON.stringify([definition, site, program, from, to]);


  useEffect(() => {
    let cancelled = false;
    void surveyApi.publishedReportFilterOptions()
      .then(data => { if (!cancelled) setOptions(data); })
      .catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : "No se pudieron cargar los filtros"); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setPublication(null);
    if (publicationId) void surveyApi.publishedCourseReport(publicationId)
      .then(data => { if (!cancelled) setPublication(data); })
      .catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : "No se pudo cargar el reporte"); });
    return () => { cancelled = true; };
  }, [publicationId]);

  useEffect(() => {
    let cancelled = false;
    setAggregate(null);
    setError(null);
    const selectedDefinition = options?.definitions.find(item => item.id === definition);
    if (!publicationId && !school && definition && from && to && from <= to && selectedDefinition?.kind === "LEARNING") {
      setAggregateLoading(true);
      void surveyApi.publishedReportAggregate({
        definitionId: definition, from, to, ...(site ? { siteId: site } : {}), ...(program ? { program } : {}),
      }).then(value => { if (!cancelled) setAggregate({ key: aggregateKey, value }); })
        .catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : "No se pudo calcular el reporte"); })
        .finally(() => { if (!cancelled) setAggregateLoading(false); });
    } else setAggregateLoading(false);
    return () => { cancelled = true; };
  }, [aggregateKey, options, publicationId, school]);

  const selected = publication?.id === publicationId ? publication : null;
  const instrument = options?.definitions.find(item => item.id === definition);
  const candidates = (options?.publications ?? []).filter(item =>
    (!site || item.siteId === site) &&
    (!definition || item.definitionId === definition) &&
    (!program || options?.definitions.find(def => def.id === item.definitionId)?.program === program) &&
    (!(from || to) || item.dates.some(date => (!from || date >= from) && (!to || date <= to)))
  );
  const schools = [...new Set(candidates.map(item => item.school))].sort();
  const filtered = candidates.filter(item => !school || item.school === school);
  const availableDefinitions = options?.definitions.filter(item =>
    (!site || item.siteId === site) && (!program || item.program === program)
  ) ?? [];
  const programs = [...new Set((options?.sites ?? []).filter(item => !site || item.id === site).flatMap(item => item.programs))].sort();
  const combined = !publicationId && !school && aggregate?.key === aggregateKey ? aggregate.value : null;
  const reportTemplate = selected?.snapshot.document.template ?? combined?.template ?? courseImpactsGeneralTemplate;
  const reportData = selected?.snapshot.document.data ?? combined?.data ?? emptyReport;
  const type = instrument?.kind;
  const complementary = type === "CQS" || type === "FOLLOW_UP";
  const resetSelection = () => navigate(reportPath(""), { replace: true });

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Card><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {(options?.sites.length ?? 0) > 1 && <Dropdown label="Sitio" value={site} options={[{ value: "", label: "Todos los sitios autorizados" }, ...(options?.sites ?? []).map(item => ({ value: item.id, label: item.name }))]} onChange={value => { setSite(value); setDefinition(""); setProgram(""); setSchool(""); resetSelection(); }} />}
        <Dropdown label="Instrumento" value={definition} options={[{ value: "", label: "Selecciona un instrumento" }, ...availableDefinitions.map(item => ({ value: item.id, label: `${item.name} · v${item.version}` }))]} onChange={value => { setDefinition(value); setSchool(""); resetSelection(); }} />
        <DatePicker label="Desde" value={from} onChange={value => { setFrom(value); resetSelection(); }} />
        <DatePicker label="Hasta" value={to} onChange={value => { setTo(value); resetSelection(); }} />
        <Dropdown label="Programa" value={program} options={[{ value: "", label: "Todos los programas" }, ...programs.map(value => ({ value, label: value }))]} onChange={value => { setProgram(value); setDefinition(""); setSchool(""); resetSelection(); }} />
        <Dropdown label="Escuela" value={school} options={[{ value: "", label: "Todas las escuelas" }, ...schools.map(value => ({ value, label: value }))]} onChange={value => { setSchool(value); resetSelection(); }} />
        <Dropdown label="Curso publicado" value={publicationId ?? ""} options={[{ value: "", label: "Selecciona un curso" }, ...filtered.map(item => ({ value: item.id, label: `${item.name} · ${item.school} · v${item.version}` }))]} onChange={id => navigate(reportPath(id), { replace: true })} />
        {type === "CQS" && <Dropdown label="Instructor" value="" options={[{ value: "", label: "Próximamente" }]} disabled />}
      </div>
        {from && to && from > to && <p role="alert" className="mt-2 text-danger">La fecha inicial debe ser anterior a la final.</p>}
        {aggregateLoading && <p role="status" className="mt-2 text-sm">Calculando resultados publicados…</p>}
        {!aggregateLoading && aggregate?.key === aggregateKey && aggregate.value === null && <p className="mt-2 text-sm">No hay cursos publicados completos en este rango.</p>}
        {definition && !school && (!!from !== !!to) && !complementary && <p className="mt-2 text-sm">Selecciona ambas fechas para consultar todos los cursos publicados.</p>}
        {error && <p role="alert" className="mt-2 text-danger">{error}</p>}
      </Card>
      {complementary ? <Card>Coming soon · El reporte de {type === "CQS" ? "Calidad" : "Seguimiento"} estará disponible próximamente.</Card> : <>
        {(selected || combined) && <div className="flex justify-end"><ReportPdfDownload template={reportTemplate} data={reportData} appliedFilters={selected ? [{ label: "Curso", value: selected.name }, { label: "Escuela", value: selected.school }] : [{ label: "Desde", value: from }, { label: "Hasta", value: to }]} /></div>}
        <ReportRenderer key={selected?.id ?? (combined ? aggregateKey : "empty")} template={reportTemplate} data={reportData} mode="interactive" />
      </>}
    </div>
  );
}
