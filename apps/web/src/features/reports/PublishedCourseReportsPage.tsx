import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { CourseEditionsPage, CourseReportPublication, CourseReportPublicationsPage } from "@epi/shared";
import { Button, Card, Label, Pagination, Table } from "@epi/ui";
import { useAuthStore } from "../../store/auth.store";
import { surveyApi } from "../surveys/api";
import { ReportRenderer } from "./components/ReportRenderer";
import { DocumentReportPage } from "./DocumentReportPage";

export function PublishedCourseReportsPage() {
  const { publicationId } = useParams();
  const user = useAuthStore(state => state.currentUser);
  const canPrepare = user?.role === "system_admin" || user?.role === "org_admin" || !!user?.featureKeys.includes("surveys");
  const [courses, setCourses] = useState<CourseEditionsPage | null>(null);
  const [coursePage, setCoursePage] = useState(1);
  const [courseError, setCourseError] = useState<string | null>(null);
  const [mode, setMode] = useState<"interactive" | "document">("document");
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [list, setList] = useState<CourseReportPublicationsPage | null>(null);
  const [publication, setPublication] = useState<CourseReportPublication | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPublication(null);
    setList(null);
    setError(null);
    setMode("document");
    setLoading(true);

    const request = publicationId
      ? surveyApi.publishedCourseReport(publicationId).then(value => { if (!cancelled) setPublication(value); })
      : surveyApi.publishedCourseReports(page).then(value => { if (!cancelled) setList(value); });

    void request
      .catch(error => { if (!cancelled) setError(error instanceof Error ? error.message : "No se pudieron consultar las publicaciones"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [publicationId, page, refresh]);

  useEffect(() => {
    if (publicationId || !canPrepare) return;
    let cancelled = false;
    setCourseError(null);
    void surveyApi.courseEditions(`?status=REVIEWED&page=${coursePage}`).then(value => { if (!cancelled) setCourses(value); })
      .catch(reason => { if (!cancelled) setCourseError(reason instanceof Error ? reason.message : "No se pudieron consultar los cursos revisados"); });
    return () => { cancelled = true; };
  }, [publicationId, canPrepare, coursePage, refresh]);

  const selected = publication?.id === publicationId ? publication : null;
  return (
    <div className="space-y-4">
      <Label variant="title">Reportes</Label>
      <div className="flex flex-wrap items-center gap-3">
        {publicationId && <Link className="text-primary underline" to="/reports">← Ver todos los reportes</Link>}
        <Button variant="secondary" disabled={loading} onClick={() => setRefresh(value => value + 1)}>Recargar</Button>
      </div>
      {loading && <p role="status">Consultando reportes…</p>}
      {error && <p role="alert" className="text-danger">{error}</p>}
      {!publicationId && canPrepare && <Card><h2 className="mb-3 font-semibold">Cursos revisados · pendientes de publicación</h2>
        {courseError && <p role="alert" className="text-danger">{courseError}</p>}
        {courses && <><Table rows={courses.rows} keyExtractor={row => row.id} emptyText="No hay cursos revisados pendientes." columns={[
          { key: "name", header: "Curso" }, { key: "school", header: "Escuela" }, { key: "siteName", header: "Sitio" },
          { key: "status", header: "Estado", render: () => "Revisado" },
          { key: "open", header: "Reporte", render: row => <Link className="text-primary underline" to={`/reports/prepare/${encodeURIComponent(row.id)}`}>Preparar reporte</Link> },
        ]} />{courses.totalPages > 1 && <Pagination meta={{ page: courses.page, pageSize: 25, total: courses.total, totalPages: courses.totalPages }} onPageChange={setCoursePage} />}</>}
      </Card>}
      {!publicationId && list && <Card><h2 className="mb-3 font-semibold">Reportes publicados</h2>
        <Table rows={list.rows} keyExtractor={row => row.id} emptyText="No hay reportes publicados en tu alcance." columns={[
          { key: "name", header: "Curso" },
          { key: "school", header: "Escuela" },
          { key: "version", header: "Versión" },
          { key: "createdAt", header: "Fecha de publicación", render: row => new Date(row.createdAt).toLocaleString("es") },
          { key: "open", header: "Reporte", render: row => <Link className="text-primary underline" to={`/reports/${encodeURIComponent(row.id)}`}>Ver reporte</Link> },
        ]} />
        {list.totalPages > 1 && <Pagination meta={{ page: list.page, pageSize: 25, total: list.total, totalPages: list.totalPages }} onPageChange={setPage} />}
      </Card>}
      {selected && <>
        <div className="flex flex-wrap gap-2">
          <Button variant={mode === "document" ? "primary" : "secondary"} onClick={() => setMode("document")}>Documento y PDF</Button>
          <Button variant={mode === "interactive" ? "primary" : "secondary"} onClick={() => setMode("interactive")}>Vista interactiva</Button>
        </div>
        {mode === "document" ? (
          <DocumentReportPage
            template={selected.snapshot.document.template}
            data={selected.snapshot.document.data}
            appliedFilters={[
              { label: "Curso", value: selected.name },
              { label: "Escuela", value: selected.school },
              { label: "Versión publicada", value: String(selected.version) },
              { label: "Publicación", value: new Date(selected.createdAt).toLocaleString("es") },
            ]}
            notice={`Publicado · Aprendizaje · versión ${selected.version}`}
          />
        ) : (
          <Card><ReportRenderer template={selected.snapshot.document.template} data={selected.snapshot.document.data} mode="interactive" /></Card>
        )}
      </>}
    </div>
  );
}
