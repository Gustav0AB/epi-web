import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { CourseReportPublication, CourseReportPublicationsPage } from "@epi/shared";
import { Button, Card, Label, Pagination, Table } from "../../shared/components";
import { surveyApi } from "../surveys/api";
import { ReportRenderer } from "./components/ReportRenderer";
import { DocumentReportPage } from "./DocumentReportPage";
export function PublishedCourseReportsPage() {
  const [mode,setMode] = useState<"interactive" | "document">("interactive");
  const { publicationId } = useParams(); const [page,setPage] = useState(1); const [refresh,setRefresh] = useState(0);
  const [list,setList] = useState<CourseReportPublicationsPage | null>(null); const [publication,setPublication] = useState<CourseReportPublication | null>(null);
  const [error,setError] = useState<string | null>(null); const [loading,setLoading] = useState(false);
  useEffect(() => {
    let cancelled = false; setPublication(null); setList(null); setError(null); setLoading(true);
    const request = publicationId ? surveyApi.publishedCourseReport(publicationId).then(value => { if (!cancelled) setPublication(value); }) : surveyApi.publishedCourseReports(page).then(value => { if (!cancelled) setList(value); });
    void request.catch(error => { if (!cancelled) setError(error instanceof Error ? error.message : "No se pudieron consultar las publicaciones"); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  },[publicationId,page,refresh]);
  return <div className="space-y-4"><Label variant="title">Reportes de aprendizaje publicados</Label><p>Versiones conservadas con resultados, textos y plantilla de su publicación. Solo se muestran los cursos autorizados para tu cuenta.</p><Link className="text-primary underline" to="/published-courses">Todas las publicaciones autorizadas</Link><Button variant="secondary" disabled={loading} onClick={() => setRefresh(value => value+1)}>Recargar publicaciones</Button>
    {loading && <p role="status">Consultando publicaciones…</p>}{error && <p role="alert" className="text-danger">{error}</p>}
    {list && <Card><Table rows={list.rows} keyExtractor={row => row.id} emptyText="No hay publicaciones disponibles en tu alcance." columns={[{ key: "name", header: "Curso" },{ key: "school", header: "Escuela" },{ key: "version", header: "Versión" },{ key: "createdAt", header: "Fecha", render: row => new Date(row.createdAt).toLocaleString("es") },{ key: "open", header: "Reporte", render: row => <Link className="text-primary underline" to={`/published-courses/${encodeURIComponent(row.id)}`}>Abrir reporte</Link> }]} /><Pagination meta={{ page: list.page, pageSize: 25, total: list.total, totalPages: list.totalPages }} onPageChange={setPage} /></Card>}
    {publication && <div className="flex gap-3"><Button variant={mode === "interactive" ? "primary" : "secondary"} onClick={() => setMode("interactive")}>Vista interactiva</Button><Button variant={mode === "document" ? "primary" : "secondary"} onClick={() => setMode("document")}>Documento y PDF</Button></div>}
    {publication && mode === "interactive" && <Card><p className="mb-3 font-semibold">PUBLICADO — Aprendizaje · versión {publication.version}. CQS y seguimiento pendientes de validación.</p><ReportRenderer template={publication.snapshot.document.template} data={publication.snapshot.document.data} mode="interactive" /></Card>}
    {publication && mode === "document" && <DocumentReportPage template={publication.snapshot.document.template} data={publication.snapshot.document.data} appliedFilters={[{ label: "Curso", value: publication.name },{ label: "Escuela", value: publication.school },{ label: "Versión publicada", value: String(publication.version) },{ label: "Publicación", value: publication.createdAt }]} notice={`PUBLICADO — Aprendizaje · versión ${publication.version}. CQS y seguimiento pendientes de validación.`} />}
  </div>;
}
