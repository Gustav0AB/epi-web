import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { COURSE_REPORT_DRAFT_NOTICE, CourseReportContentSchema, CourseReportDraftSchema, courseResponseCoverage, type CourseReportPublicationsPage, type CourseReportDraft, type CourseReportDraftDto, type CourseResultsDto } from "@epi/shared";
import { Button, Card, Label, Modal, Table } from "@epi/ui";
import { useAuthStore } from "../../store/auth.store";
import { surveyApi } from "../surveys/api";
import { ReportRenderer } from "./components/ReportRenderer";
import { buildCourseReportPreview } from "./course-report-preview";
export function CourseReportPage() {
  const sequence = useRef(0);
  const role = useAuthStore(state => state.currentUser?.role);
  const [history,setHistory] = useState<CourseReportPublicationsPage | null>(null);
  const [confirmPublish,setConfirmPublish] = useState(false);
  const [published,setPublished] = useState<string | null>(null);
  const { id } = useParams(); const [stored,setStored] = useState<CourseReportDraftDto | null>(null); const [draft,setDraft] = useState<CourseReportDraft | null>(null); const [result,setResult] = useState<CourseResultsDto | null>(null);
  useEffect(() => setPublished(null),[id]);
  const [error,setError] = useState<string | null>(null); const [busy,setBusy] = useState(false); const [saved,setSaved] = useState(false); const [refresh,setRefresh] = useState(0);
  useEffect(() => { ++sequence.current; setBusy(false); setSaved(false); let cancelled = false; setStored(null); setDraft(null); setResult(null); setError(null); setHistory(null); setConfirmPublish(false);
    if (id) void Promise.all([surveyApi.courseReportDraft(id),surveyApi.courseReportHistory(id),surveyApi.courseResults(id)]).then(([value,publications,results]) => { if (!cancelled) { if (results.revision !== value.revision) throw new Error("El curso cambió. Recarga el borrador antes de continuar."); setStored(value); setDraft({ ...value.draft, templateKey: "course-impacts-general", from: undefined, to: undefined }); setHistory(publications); setResult(results); } }).catch(error => { if (!cancelled) setError(error instanceof Error ? error.message : "No se pudo abrir el borrador"); });
    return () => { cancelled = true; ++sequence.current; };
  },[id,refresh]);
  async function save() {
    if (!id || !draft || !stored) return; const request = sequence.current; setBusy(true); setError(null); setSaved(false);
    try { const value = await surveyApi.saveCourseReportDraft(id,stored.revision,draft); if (request !== sequence.current) return; setStored(value); setDraft(value.draft); setSaved(true); }
    catch(error) { if (request === sequence.current) setError(error instanceof Error ? error.message : "No se pudo guardar; se conservaron tus cambios"); } finally { if (request === sequence.current) setBusy(false); }
  }
  async function preview() {
    if (!id || !draft || !stored) return; const request = sequence.current; setBusy(true); setError(null); setResult(null);
    try { const query = new URLSearchParams({ ...(draft.from ? { from: draft.from } : {}), ...(draft.to ? { to: draft.to } : {}) }); const value = await surveyApi.courseResults(id,`?${query}`);
      if (request !== sequence.current) return;
      if (value.revision !== stored.revision) throw new Error("El curso cambió. Conserva tus textos y recarga el borrador antes de continuar."); setResult(value);
    } catch(error) { if (request === sequence.current) setError(error instanceof Error ? error.message : "No se pudo generar la vista previa"); } finally { if (request === sequence.current) setBusy(false); }
  }
  async function publish() {
    if (!id || !stored || !result || !history) return;
    const request = sequence.current; setBusy(true); setError(null);
    try {
      const publication = await surveyApi.completeCourse(id,stored.revision,history.rows[0]?.version ?? 0,draft?.categories);
      if (request !== sequence.current) return;
      setPublished(publication.id); setConfirmPublish(false); setRefresh(value => value+1);
    } catch(error) { if (request === sequence.current) { setError(error instanceof Error ? error.message : "No se pudo publicar; recarga y revisa el curso"); setConfirmPublish(false); } }
    finally { if (request === sequence.current) setBusy(false); }
  }
  function editContent(key: string, value: string) {
    setDraft(current => current ? { ...current, textContent: { ...current.textContent, [key]: value } } : current);
    setSaved(false);
  }
  function editImage(key: string, file: File) {
    setError(null);
    if (!["image/jpeg", "image/png"].includes(file.type) || file.size > 1024 * 1024) {
      setError("Selecciona una imagen JPG o PNG de hasta 1 MB."); return;
    }
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === "string" && CourseReportContentSchema.safeParse({ [key]: reader.result }).success) editContent(key, reader.result); else setError("El archivo no es una imagen JPG o PNG válida."); };
    reader.onerror = () => setError("No se pudo leer la imagen. Inténtalo de nuevo.");
    reader.readAsDataURL(file);
  }
  const document = result && draft ? buildCourseReportPreview(result,draft) : null;
  const coverage = result ? (["Pre", "Post"] as const).map(moment => {
    const expected = moment === "Pre" ? result.expectedParticipantsPre : result.expectedParticipantsPost;
    const admitted = moment === "Pre" ? result.preReceipts : result.postReceipts;
    return { moment, expected, admitted, ...courseResponseCoverage(admitted, expected) };
  }) : [];
  const adequate = coverage.length === 2 && coverage.every(row => row.meetsThreshold);
  return <div className="space-y-4"><Label variant="title">Validar y publicar reporte del curso</Label><Link className="text-primary underline" to="/reports">← Volver a Reportes</Link><p className="rounded border border-amber-500 p-3">{COURSE_REPORT_DRAFT_NOTICE}</p>
    {error && <p role="alert" className="text-danger">{error}</p>}{!stored && !error && <p role="status">Cargando borrador…</p>}
    <Button variant="secondary" disabled={busy} onClick={() => { if (!draft || window.confirm("Recargar descartará los cambios de texto no guardados. ¿Continuar?")) { setSaved(false); setRefresh(value => value+1); } }}>Recargar borrador</Button>
    <Card><h2 className="font-semibold">Cobertura mínima: 80% en Pre y en Post</h2>
      {result ? <Table rows={coverage} keyExtractor={row => row.moment} columns={[
        { key: "moment", header: "Momento" }, { key: "expected", header: "Esperados", render: row => row.expected ?? "Sin definir" }, { key: "admitted", header: "Envíos admitidos" },
        { key: "percent", header: "Cobertura", render: row => row.percent === null ? "Sin definir" : `${new Intl.NumberFormat("es", { maximumFractionDigits: 2 }).format(row.percent)}%` },
        { key: "threshold", header: "Estado", render: row => row.meetsThreshold === null ? "Capturar base esperada" : row.meetsThreshold ? "Cumple" : "No alcanza 80%" },
      ]} /> : <p className="text-sm">Genera la vista previa para verificar los envíos admitidos. Los participantes esperados se registran en el curso.</p>}
    </Card>
    {draft && stored && <Card><fieldset disabled={busy}><p>Revisión {stored.revision} · {stored.savedAt ? `Guardado: ${new Date(stored.savedAt).toLocaleString("es")}` : "Aún no guardado"}. Plantilla: Reporte general de curso · General.</p>
      <p className="my-3 text-sm">Edita los textos y selecciona las imágenes directamente en la vista previa. Se incluirán todas las aplicaciones del curso.</p>
      <div className="flex flex-wrap gap-3"><Button disabled={busy || !CourseReportDraftSchema.safeParse(draft).success} onClick={() => void save()}>Guardar borrador</Button><Button variant="secondary" disabled={busy || !CourseReportDraftSchema.safeParse(draft).success} onClick={() => void preview()}>Generar vista previa</Button>{(role === "system_admin" || role === "org_admin") && <Button disabled={busy || !adequate || !history || !stored.savedAt || JSON.stringify(draft) !== JSON.stringify(stored.draft)} onClick={() => setConfirmPublish(true)}>Publicar evaluación de aprendizaje</Button>}</div>{saved && <p role="status">Borrador guardado. No se publicó ni se modificaron respuestas.</p>}{busy && <p role="status">Procesando…</p>}
    </fieldset></Card>}
    {published && <p role="status">Publicación guardada. <Link className="text-primary underline" to={`/reports/${encodeURIComponent(published)}`}>Abrir versión publicada</Link></p>}
    {history && <Card><h2 className="mb-3 font-semibold">Historial de publicaciones de aprendizaje</h2><p className="mb-3 text-sm">Cada versión conserva resultados, contenido y plantilla. Republicar crea una versión nueva. CQS y seguimiento no forman parte de la publicación de aprendizaje.</p><Table rows={history.rows} keyExtractor={row => row.id} emptyText="Este curso aún no tiene publicaciones." columns={[{ key: "version", header: "Versión" },{ key: "createdAt", header: "Publicación", render: row => new Date(row.createdAt).toLocaleString("es") },{ key: "open", header: "Reporte", render: row => <Link className="text-primary underline" to={`/reports/${encodeURIComponent(row.id)}`}>Abrir versión {row.version}</Link> }]} /><Link className="text-primary underline" to="/reports">Consultar publicaciones autorizadas</Link></Card>}
    <Modal open={confirmPublish} width="60rem" title="Publicar evaluación de aprendizaje" onClose={() => { if (!busy) setConfirmPublish(false); }} footer={<><Button variant="secondary" disabled={busy} onClick={() => setConfirmPublish(false)}>Cancelar</Button><Button loading={busy} onClick={() => void publish()}>Confirmar publicación</Button></>}><p>Se guardará una versión nueva del borrador guardado, con su plantilla y resultados Pre/Post. Las versiones anteriores se conservan. El servidor comprobará cobertura de 80% en cada momento y datos pendientes de revisión.</p><p className="mt-3">Curso: {result?.name}. Esperados Pre: {result?.expectedParticipantsPre ?? "Sin definir"}; Post: {result?.expectedParticipantsPost ?? "Sin definir"}. Pre: {result?.preReceipts ?? "—"}. Post: {result?.postReceipts ?? "—"}.</p><p className="mt-3">Esta publicación corresponde a aprendizaje; CQS y seguimiento se consultan por separado.</p></Modal>
    {document && result && <><p className="text-sm">Vista previa: selecciona una imagen o edita los textos directamente. Guarda el borrador antes de publicar.</p><ReportRenderer template={document.template} data={document.data} mode="interactive" {...(!busy ? { editContent, editImage } : {})} /></>}
  </div>;
}
