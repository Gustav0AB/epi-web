import { courseResultCategories, selectCourseResultCategories, type CourseReportDraftDto } from "@epi/shared";
import { CourseCategorySelector } from "./CourseComparison";
import { CourseAnswerReview } from "./CourseAnswerReview";
import { useAuthStore } from "../../store/auth.store";
import { CourseResultsView } from "./CourseResultsPage";
import { useEffect, useMemo, useState } from "react";
import type { CourseResultsDto, SiteDto, CourseSubmissionDto, SurveyGroupSearchRow } from "@epi/shared";
import { Button, Card, Dropdown, Label, Modal, Table, TextField } from "../../shared/components";
import { surveyApi } from "./api";

type Props = { groups: SurveyGroupSearchRow[]; sites: SiteDto[]; onBack: () => void };

export function CourseSelectionReview({ groups, sites, onBack }: Props) {
  const role = useAuthStore(state => state.currentUser?.role);
  const [courseId, setCourseId] = useState(groups.find(group => group.courseId)?.courseId);
  const completed = groups.some(group => group.courseStatus === "COMPLETED");
  const [includedCategories, setIncludedCategories] = useState<string[]>([]);
  const [storedDraft, setStoredDraft] = useState<CourseReportDraftDto | null>(null);
  const [result, setResult] = useState<CourseResultsDto | null>(null);
  const [publicationVersion, setPublicationVersion] = useState<number | null>(null);
  const [resultError, setResultError] = useState<string | null>(null);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [answerReview, setAnswerReview] = useState<{ submissionId: string | null; onlyBlanks: boolean } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const confirmed = Boolean(courseId);
  const [linkOpen, setLinkOpen] = useState(false);
  const [tab, setTab] = useState("learning");
  const [responses, setResponses] = useState<CourseSubmissionDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [participants, setParticipants] = useState(String(groups.find(group => group.courseId)?.confirmedParticipants ?? groups.reduce((sum, group) => sum + group.preCount, 0)));

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    void Promise.all((courseId ? groups.slice(0, 1) : groups).map(group => {
      if (!group.siteId) throw new Error("El grupo no tiene un sitio disponible");
      return surveyApi.courseDetail({ groupId: courseId ?? group.id, siteId: group.siteId, school: group.school.slice(0, 500), date: group.date });
    })).then(pages => {
      if (!cancelled) setResponses([...new Map(pages.flat().map(row => [row.id, row])).values()]);
    }).catch(error => { if (!cancelled) setError(error instanceof Error ? error.message : "No se pudieron cargar las respuestas"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [groups, revision, courseId]);

  useEffect(() => {
    let cancelled = false;
    setResult(null); setPublicationVersion(null); setResultError(null);
    if (courseId) void Promise.all([surveyApi.courseResults(courseId), surveyApi.courseReportHistory(courseId), surveyApi.courseReportDraft(courseId)]).then(([result, history, draft]) => {
      if (!cancelled) { setResult(result); setStoredDraft(draft); setIncludedCategories(result.categorySelection?.included ?? draft.draft.categories ?? courseResultCategories(result)); setPublicationVersion(history.rows[0]?.version ?? 0); }
    }).catch(error => { if (!cancelled) setResultError(error instanceof Error ? error.message : "No se pudieron cargar los resultados"); });
    return () => { cancelled = true; };
  }, [courseId, revision]);

  const availableCategories = result?.categorySelection ? [...result.categorySelection.included, ...result.categorySelection.excluded].sort((a, b) => a.localeCompare(b)) : result ? courseResultCategories(result) : [];
  const publicationPreview = useMemo(() => {
    if (!result || !includedCategories.length) return null;
    if (completed) return result;
    try { return selectCourseResultCategories(result, includedCategories); }
    catch { return null; }
  }, [result, includedCategories, completed]);

  async function saveCategories() {
    if (!courseId || !result || !storedDraft || !publicationPreview) return;
    setSaving(true); setError(null);
    try {
      await surveyApi.saveCourseReportDraft(courseId, result.revision, { ...storedDraft.draft, categories: includedCategories });
      setRevision(value => value + 1);
    } catch (error) { setError(error instanceof Error ? error.message : "No se pudieron guardar las categorías"); }
    finally { setSaving(false); }
  }

  async function complete() {
    if (!courseId || !result || publicationVersion === null) return;
    setSaving(true); setError(null);
    try {
      await surveyApi.completeCourse(courseId, result.revision, publicationVersion, includedCategories);
      onBack();
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo completar el curso");
      setCompleteOpen(false); setRevision(value => value + 1);
    } finally { setSaving(false); }
  }

  async function correctMoment(row: CourseSubmissionDto, value: string) {
    if (value !== "PRE" && value !== "POST" && value !== "original") return;
    setSaving(true); setError(null);
    try {
      await surveyApi.setSubmissionMoment(row.id, value === "original" ? null : value, row.contextRevision);
      setRevision(value => value + 1);
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo corregir el momento");
    } finally { setSaving(false); }
  }
  async function confirm() {
    setSaving(true); setError(null);
    try {
      const saved = await surveyApi.confirmCourseSelection(Number(participants), responses.map(row => ({ id: row.id, contextRevision: row.contextRevision })));
      setCourseId(saved.courseId);
      setConfirmOpen(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo confirmar el curso");
      setConfirmOpen(false);
    } finally { setSaving(false); }
  }
  const pre = responses.filter(row => !row.reviewExcluded && row.surveyMoment === "PRE").length;
  const post = responses.filter(row => !row.reviewExcluded && row.surveyMoment === "POST").length;
  const blanks = responses.filter(row => !row.reviewExcluded).reduce((sum, row) => sum + row.answers.filter(answer => !answer.value.trim()).length, 0);

  return <div className="space-y-4">
    <Button variant="ghost" disabled={saving} onClick={onBack}>← Volver a Cursos</Button>
    <Label variant="title">{confirmed ? result?.name ?? "Curso confirmado" : "Revisión de la selección"}</Label>
    <div role="tablist" aria-label="Evaluaciones" className="flex flex-wrap gap-2">
      {([["learning", "Evaluación de aprendizaje"], ["follow", "Evaluación de seguimiento"], ["quality", "Evaluación de calidad"]] as const).map(([id, title]) => <Button key={id} role="tab" aria-selected={tab === id} variant={tab === id ? "primary" : "secondary"} onClick={() => setTab(id)}>{title}</Button>)}
    </div>
    {error && <div role="alert"><p className="text-danger">{error}</p><Button disabled={saving} onClick={() => setRevision(value => value + 1)}>Recargar respuestas</Button></div>}
    {tab === "learning" ? <>
      <Card>
        <div className="flex flex-wrap items-end gap-4">
          <TextField label="Total de alumnos" disabled={confirmed || saving} type="number" min={1} step={1} value={participants} onChange={event => setParticipants(event.target.value)} />
          <Button disabled={confirmed || loading || saving || !pre || !post || !Number.isSafeInteger(Number(participants)) || Number(participants) < 1} onClick={() => setConfirmOpen(true)}>{completed ? "Curso completado" : confirmed ? "Curso revisado" : "Confirmar curso"}</Button>
          {confirmed && !completed && (role === "system_admin" || role === "org_admin") && <Button disabled={loading || saving || !publicationPreview || publicationVersion === null} onClick={() => setCompleteOpen(true)}>Completar y publicar</Button>}
        </div>
        <p className="mt-2 text-sm">{confirmed ? "Curso revisado. Puedes continuar con las categorías y los resultados." : "El total inicial corresponde a Pre. Se guarda al confirmar el curso."}</p>
        <dl className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2 xl:grid-cols-4">
          <div><dt className="text-sm text-gray-500">Escuelas</dt><dd>{[...new Set(groups.map(group => group.school))].join(", ")}</dd></div>
          <div><dt className="text-sm text-gray-500">Sitio</dt><dd>{[...new Set(groups.map(group => sites.find(site => site.id === group.siteId)?.name ?? "Sin sitio"))].join(", ")}</dd></div>
          <div><dt className="text-sm text-gray-500">Fechas</dt><dd>{[...new Set(groups.flatMap(group => group.dates ?? [group.date]))].sort().join(", ")}</dd></div>
          <div><dt className="text-sm text-gray-500">Envíos incluidos</dt><dd>Pre {pre} · Post {post}</dd></div>
        </dl>
      </Card>
      <Card><details><summary className="cursor-pointer font-semibold">Revisión de datos · {responses.length} envíos{blanks > 0 ? ` · ${blanks} respuestas vacías` : ""}</summary><div className="mt-4"><p className="mb-3 text-sm">Cada fila corresponde a un envío completo de la encuesta. Abre sus preguntas y respuestas para comprobar lo contestado. Revisa las escuelas, fechas, momentos y total de alumnos; después utiliza Confirmar curso para guardar tu revisión.</p>
        {blanks > 0 && <div className="mb-3"><p role="status" className="text-amber-700">Hay {blanks} respuestas sin contestar entre los campos guardados de los envíos incluidos. Este conteo también puede incluir preguntas informativas.</p><Button variant="ghost" size="sm" onClick={() => setAnswerReview({ submissionId: null, onlyBlanks: true })}>Ver cuáles preguntas quedaron vacías</Button><p className="text-sm">Las exclusiones y la redistribución de las preguntas evaluables se detallan en Advertencias del cálculo.</p></div>}
        <Table rows={responses} keyExtractor={row => row.id} loading={loading} pageSize={10} columns={[
          { key: "submission", header: "Envío", render: row => `Envío ${responses.indexOf(row) + 1}` },
          { key: "school", header: "Escuela", render: row => row.confirmedContext?.school ?? row.schoolContext?.school ?? "Sin escuela" },
          { key: "moment", header: "Momento", render: row => <Dropdown aria-label={`Momento del envío ${responses.indexOf(row) + 1}`} disabled={completed || saving || loading} value={row.surveyMoment} options={[{ value: "PRE", label: "Pre" }, { value: "POST", label: "Post" }, { value: "original", label: "Restaurar momento original" }]} onChange={value => void correctMoment(row, value)} /> },
          { key: "review", header: "Origen del momento", render: row => row.reviewMoment ? "Corregido manualmente" : "Formulario" },
          { key: "answers", header: "Preguntas y respuestas", render: row => <Button variant="secondary" size="sm" onClick={() => setAnswerReview({ submissionId: row.id, onlyBlanks: false })}>Revisar {row.answers.length} respuestas</Button> },
        ]} />
      </div></details></Card>
      {resultError && <div role="alert"><p className="text-danger">{resultError}</p><Button disabled={saving} onClick={() => setRevision(value => value + 1)}>Recargar resultados</Button></div>}
      {confirmed && !result && !resultError && <p role="status">Cargando resultados del curso…</p>}
      {result && <>
        <CourseCategorySelector available={availableCategories} included={includedCategories} onChange={setIncludedCategories} disabled={saving || completed} />
        {!includedCategories.length && <p role="alert" className="text-danger">Selecciona al menos una categoría para guardar o publicar.</p>}
        {!completed && <Button variant="secondary" disabled={saving || !publicationPreview || !storedDraft} onClick={() => void saveCategories()}>Guardar categorías del curso</Button>}
        {publicationPreview && <CourseResultsView result={publicationPreview} availableCategories={availableCategories} hideCategorySelector />}
      </>}
    </> : <Card><p>No hay una evaluación vinculada.</p><Button onClick={() => setLinkOpen(true)}>Vincular instrumento</Button><p className="mt-2 text-sm">Vinculación pendiente de conexión.</p></Card>}
    <Modal open={answerReview !== null} width="60rem" title={answerReview?.onlyBlanks ? "Preguntas sin contestar" : "Preguntas y respuestas del envío"} onClose={() => setAnswerReview(null)}>
      <CourseAnswerReview submissions={responses} submissionId={answerReview?.submissionId ?? null} onlyBlanks={answerReview?.onlyBlanks ?? false} />
    </Modal>
    <Modal open={completeOpen} width="60rem" title="Completar y publicar curso" onClose={() => { if (!saving) setCompleteOpen(false); }} footer={<><Button variant="secondary" disabled={saving} onClick={() => setCompleteOpen(false)}>Cancelar</Button><Button loading={saving} onClick={() => void complete()}>Completar y publicar</Button></>}>
      <p className="font-semibold">Categorías que se publicarán</p><p>{includedCategories.join(", ") || "Ninguna"}</p>
      <p className="mt-3 font-semibold">Categorías excluidas de esta publicación</p><p>{availableCategories.filter(category => !includedCategories.includes(category)).join(", ") || "Ninguna"}</p>
      <p className="my-3">¿Estás de acuerdo con publicar esta selección? El índice se recalcula con las categorías incluidas y sus pesos proporcionales.</p>
      <p>Se validará la cobertura de al menos 80% en Pre y Post, las reglas y los datos pendientes. Se publicarán los resultados de todas las aplicaciones del curso con la plantilla guardada o la plantilla General predeterminada.</p>
      <p className="mt-3">Los resultados publicados quedarán congelados y disponibles para los usuarios autorizados del sitio. Las respuestas posteriores al cierre requerirán una revisión aparte.</p>
    </Modal>
    <Modal open={confirmOpen} width="60rem" title="Confirmar curso" onClose={() => { if (!saving) setConfirmOpen(false); }} footer={<><Button variant="secondary" disabled={saving} onClick={() => setConfirmOpen(false)}>Cancelar</Button><Button loading={saving} onClick={() => void confirm()}>Confirmar curso</Button></>}>
      <p>Se guardarán {pre} respuestas Pre y {post} respuestas Post como un curso revisado, con {participants} alumnos esperados. Sus respuestas se mostrarán dentro del curso.</p>
    </Modal>
    <Modal open={linkOpen} width="60rem" title="Vincular instrumento complementario" onClose={() => setLinkOpen(false)} footer={<><Button variant="secondary" onClick={() => setLinkOpen(false)}>Cancelar</Button><Button disabled>Vincular</Button></>}>
      <p className="mb-3">La vinculación está pendiente de conexión.</p>
      <Dropdown label="Instrumento" value="" disabled options={[{ value: "", label: "Selecciona un instrumento" }]} onChange={() => {}} />
      <Table rows={[] as { id: string }[]} keyExtractor={row => row.id} emptyText="Las respuestas se mostrarán al conectar la vinculación." columns={[{ key: "id", header: "Respuestas para seleccionar" }]} />
    </Modal>
  </div>;
}
