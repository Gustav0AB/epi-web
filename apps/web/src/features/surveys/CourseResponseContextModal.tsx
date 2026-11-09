import { useState } from "react";
import { SubmissionContextReviewSchema, type CourseResponseDto } from "@epi/shared";
import { Button, Modal, TextField } from "@epi/ui";
import { surveyApi } from "./api";
export function CourseResponseContextModal({ response, onClose, onSaved }: { response: CourseResponseDto; onClose: () => void; onSaved: () => Promise<void> }) {
  const [school, setSchool] = useState(response.context.school ?? ""); const [date, setDate] = useState(response.context.date ?? "");
  const [activity, setActivity] = useState(response.context.activity ?? ""); const [gender, setGender] = useState(response.context.gender ?? ""); const [age, setAge] = useState(String(response.context.age ?? ""));
  const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);
  const input = { expectedRevision: response.contextRevision, context: { school, date, activity: activity || null, gender: gender || null, age: age === "" ? null : Number(age) } };
  async function save(reset = false) {
    setSaving(true); setError(null);
    try { await surveyApi.setSubmissionContext(response.id, response.contextRevision, reset ? null : input.context); await onSaved(); onClose(); }
    catch (error) { setError(error instanceof Error ? error.message : "No se pudo guardar"); } finally { setSaving(false); }
  }
  const original = (value: unknown) => typeof value === "string" ? value : JSON.stringify(value) ?? "—";
  return <Modal open width="60rem" title="Revisar contexto de respuesta" onClose={() => { if (!saving) onClose(); }} footer={<><Button variant="secondary" disabled={saving} onClick={onClose}>Cancelar</Button><Button variant="secondary" disabled={saving} onClick={() => void save(true)}>Restaurar contexto original</Button><Button loading={saving} disabled={!SubmissionContextReviewSchema.safeParse(input).success} onClick={() => void save()}>Guardar contexto confirmado</Button></>}>
    <p className="mb-3 text-sm">{response.remoteId} · {response.instrument} · v{response.version}. Se conservan las respuestas originales y la corrección queda auditada.</p>
    <div className="grid gap-3 sm:grid-cols-2"><TextField label="Escuela confirmada" value={school} maxLength={200} onChange={event => setSchool(event.target.value)} /><TextField label="Actividad confirmada" value={activity} maxLength={200} onChange={event => setActivity(event.target.value)} /><TextField label="Fecha de agrupación confirmada" type="date" value={date} onChange={event => setDate(event.target.value)} /><TextField label="Género confirmado" value={gender} maxLength={200} onChange={event => setGender(event.target.value)} /><TextField label="Edad confirmada" type="number" min={0} step={1} value={age} onChange={event => setAge(event.target.value)} /></div>
    <details className="mt-3"><summary>Valores originales y procedencia</summary><div className="space-y-1 whitespace-pre-wrap break-words text-sm"><p>Escuela/Grupo: {response.context.originalSchool ?? "—"}</p><p>Fecha de envío: {response.context.submittedAt ?? "—"}</p><p>Origen de agrupación: {response.context.dateSource === "manual" ? "Confirmación manual" : response.context.dateSource === "school_field" ? "Fecha en Escuela/Grupo" : response.context.dateSource === "submitted_at" ? "Fecha de envío con zona definida" : "Pendiente de revisión"}</p><p>Género original: {original(response.context.originalGender)}</p><p>Edad original: {original(response.context.originalAge)}</p></div></details>
    {error && <p role="alert" className="text-danger">{error}</p>}
  </Modal>;
}
