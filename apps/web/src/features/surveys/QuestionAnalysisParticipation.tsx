import { useState } from "react";
import { ANALYSIS_TYPES, canConfigureAnalysis, configuredForAnalysis, setAnalysisParticipation, type SurveySetupQuestion } from "@epi/shared";
import { Button, Pagination, Table } from "../../shared/components";
import { useI18n } from "../../lib/i18n";

const labels = { pre_post: "Pre/Post", pre_post_post: "Pre/Post + Post-post" };
export function analysisParticipationText(question: SurveySetupQuestion) {
  if (!canConfigureAnalysis(question)) return "No aplica por rol o tipo";
  if (!question.analysisParticipation?.length) return "Sin configurar";
  return ANALYSIS_TYPES.filter(type => configuredForAnalysis(question, type)).map(type => labels[type]).join("; ") || "Ninguno";
}

export function QuestionAnalysisParticipation({ questions, disabled = false, onChange }: {
  questions: SurveySetupQuestion[];
  disabled?: boolean;
  onChange: (questions: SurveySetupQuestion[]) => void;
}) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const eligible = questions.filter(canConfigureAnalysis);
  const selectedEligible = eligible.filter(question => selected.includes(question.externalId)).map(question => question.externalId);
  const totalPages = Math.ceil(questions.length / 10);
  const currentPage = Math.min(page, Math.max(1, totalPages));
  return <section className="space-y-3 rounded border p-3">
    <h3 className="font-semibold">Participación en análisis</h3>
    <p className="text-sm">Las dos casillas son independientes. Una pregunta puede participar en ambos análisis, solo uno o ninguno. Esto conserva la configuración; todavía no activa cálculos ni vincula instrumentos de seguimiento.</p>
    {disabled && <p role="status" className="text-sm">La participación de CQS requiere su metodología independiente y no se configura aquí. Si existe una selección anterior, se conserva sin aplicarla a CQS.</p>}
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="secondary" disabled={disabled || !eligible.length} onClick={() => setSelected(eligible.map(question => question.externalId))}>Seleccionar todas las evaluables</Button>
      <Button size="sm" variant="secondary" disabled={!selected.length} onClick={() => setSelected([])}>Limpiar selección</Button>
      <span className="text-sm" role="status">{selectedEligible.length} seleccionadas</span>
    </div>
    <div className="flex flex-wrap gap-2">{ANALYSIS_TYPES.map(type => <div key={type} className="flex gap-2">
      <Button size="sm" disabled={disabled || !selectedEligible.length} onClick={() => onChange(setAnalysisParticipation(questions, selectedEligible, type, true))}>Activar {labels[type]}</Button>
      <Button size="sm" variant="secondary" disabled={disabled || !selectedEligible.length} onClick={() => onChange(setAnalysisParticipation(questions, selectedEligible, type, false))}>Desactivar {labels[type]}</Button>
    </div>)}</div>
    <Table rows={questions.slice((currentPage - 1) * 10, currentPage * 10)} keyExtractor={question => question.externalId} columns={[
      { key: "selected", header: "Seleccionar", render: question => <input type="checkbox" aria-label={`Seleccionar: ${question.text}`} disabled={disabled || !canConfigureAnalysis(question)} checked={selectedEligible.includes(question.externalId)} onChange={event => setSelected(previous => event.target.checked ? [...previous.filter(id => id !== question.externalId), question.externalId] : previous.filter(id => id !== question.externalId))} /> },
      { key: "text", header: "Pregunta", render: question => <div className="w-44"><details><summary className="cursor-pointer truncate" title={question.text}>{question.text}</summary><p className="whitespace-pre-wrap break-words">{question.text}</p></details><p className="text-xs text-gray-500">{analysisParticipationText(question)}</p></div> },
      { key: "type", header: "Tipo de respuesta", render: question => t(`surveySetup.types.${question.type}`) },
      { key: "role", header: "Rol de la pregunta", render: question => t(`surveySetup.roles.${question.role ?? "SCORED"}`) },
      ...ANALYSIS_TYPES.map(type => ({ key: type, header: labels[type], render: (question: SurveySetupQuestion) => <input type="checkbox" aria-label={`${labels[type]}: ${question.text}`} disabled={disabled || !canConfigureAnalysis(question)} checked={configuredForAnalysis(question, type)} onChange={event => onChange(setAnalysisParticipation(questions, [question.externalId], type, event.target.checked))} /> })),
    ]} />
    <Pagination meta={{ page: currentPage, pageSize: 10, total: questions.length, totalPages }} onPageChange={setPage} />
    <p className="text-sm text-gray-500">Cambiar una pregunta a información, contexto o excluida desactiva su participación efectiva y conserva la selección para recuperarla al volver a evaluable. Las preguntas históricas no se configuran automáticamente.</p>
  </section>;
}
