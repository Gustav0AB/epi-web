import { useEffect, useState } from "react";
import { scaleOptionPoints, ANALYSIS_TYPES, type QuestionWithWeight, type SurveyDefinitionDto, type AnalysisType, type SurveySetupQuestion } from "@epi/shared";
import { Button, Dropdown, Pagination, Table } from "../../shared/components";
import { surveyApi } from "./api";
import { applyInstrumentAnalysisReuse, previewInstrumentAnalysisReuse, availableAnalysisReuseDefinitions, type AnalysisReuseScope, applyAnalysisReuse, previewAnalysisReuse, type AnalysisReuseRow } from "./setup-analysis-reuse";

type Question = SurveySetupQuestion & { options: string[] };
const labels = { pre_post: "Pre/Post", pre_post_post: "Pre/Post + Post-post" };
const statuses = { ready: "Disponible para revisar", existing: "Ya tiene regla; se conserva", source_inactive: "No participa en el análisis de origen", unconfigured: "Sin regla en el origen", invalid: "Regla de origen incompleta o incompatible", unmatched: "Sin coincidencia compatible", ambiguous: "Coincidencia ambigua; requiere revisión manual" };
export function ReuseAnalysisScoring({ questions, target, onApply, scope, instrumentMode = false }: { instrumentMode?: boolean; scope?: AnalysisReuseScope | undefined; questions: Question[]; target: AnalysisType; onApply: (questions: SurveySetupQuestion[]) => void }) {
  const [definitions, setDefinitions] = useState<SurveyDefinitionDto[]>([]);
  const [definitionId, setDefinitionId] = useState("");
  const [origin, setOrigin] = useState<{ id: string; questions: QuestionWithWeight[] } | null>(null);
  const [loadingDefinitions, setLoadingDefinitions] = useState(false);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [definitionError, setDefinitionError] = useState<string | null>(null);
  const [questionError, setQuestionError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!scope) return;
    let cancelled = false;
    setLoadingDefinitions(true); setDefinitions([]); setDefinitionError(null);
    void surveyApi.definitions().then(data => { if (!cancelled) setDefinitions(availableAnalysisReuseDefinitions(data, scope)); })
      .catch((error: unknown) => { if (!cancelled) setDefinitionError(error instanceof Error ? error.message : "No se pudieron cargar los instrumentos"); })
      .finally(() => { if (!cancelled) setLoadingDefinitions(false); });
    return () => { cancelled = true; };
  }, [scope?.organizationId, scope?.formId, scope?.surveyType, reload]);
  useEffect(() => {
    setOrigin(null); setQuestionError(null);
    if (!definitionId || !definitions.some(item => item.id === definitionId)) { setLoadingQuestions(false); return; }
    let cancelled = false;
    setLoadingQuestions(true);
    void surveyApi.questions(definitionId).then(questions => { if (!cancelled) setOrigin({ id: definitionId, questions }); })
      .catch((error: unknown) => { if (!cancelled) setQuestionError(error instanceof Error ? error.message : "No se pudieron cargar las reglas"); })
      .finally(() => { if (!cancelled) setLoadingQuestions(false); });
    return () => { cancelled = true; };
  }, [definitionId, definitions]);
  const [source, setSource] = useState<AnalysisType | "">("");
  const [reviewed, setReviewed] = useState<AnalysisReuseRow[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const validOrigin = origin?.id === definitionId && definitions.some(item => item.id === definitionId) ? origin : null;
  const loading = loadingDefinitions || loadingQuestions;
  const error = definitionError || questionError;
  const blocked = !!definitionId && (loading || !!error || !validOrigin);
  const current = source ? definitionId ? validOrigin ? previewInstrumentAnalysisReuse(questions, validOrigin.questions, definitionId, source, target, true) : [] : previewAnalysisReuse(questions, source, target, true) : [];
  const stale = reviewed !== null && JSON.stringify(current) !== JSON.stringify(reviewed);
  const ready = reviewed?.filter(row => row.status === "ready") ?? [];
  const count = ready.filter(row => selected.includes(row.externalId)).length;
  const currentPage = Math.min(page, Math.max(1, Math.ceil((reviewed?.length ?? 0) / 10)));
  return <section className="space-y-2 rounded border p-3">
    <h4 className="font-semibold">Reutilizar puntuaciones por análisis</h4>
    <p className="text-sm">Revisa antes de aplicar a {labels[target]}. Se conservan reglas existentes, incluso incompletas; no cambia participación, clasificación ni porcentajes. En otro instrumento, texto, tipo y opciones compatibles solo sugieren coincidencias: aceptar una copia no establece equivalencias ni vínculos para resultados.</p>
    {scope && <Dropdown label="Instrumento de origen para reutilizar" value={definitionId} disabled={loadingDefinitions} options={[{ value: "", label: "Este borrador" }, ...definitions.map(item => ({ value: item.id, label: `${item.title} · v${item.version}` }))]} onChange={value => { setDefinitionId(value); setSource(""); setReviewed(null); setSelected([]); setPage(1); }} />}
    {loading && <p role="status">Cargando instrumentos o reglas autorizadas…</p>}
    {error && <div role="alert"><p className="text-sm text-danger">{error}</p><Button variant="secondary" onClick={() => setReload(value => value + 1)}>Reintentar carga de reglas</Button></div>}
    {scope && !loading && !error && !definitions.length && <p className="text-sm">No hay otros instrumentos disponibles de esta organización y programa. Puedes reutilizar desde este borrador.</p>}
    <Dropdown label="Análisis de origen para reutilizar" value={source} options={[{ value: "", label: "Selecciona el origen" }, ...(instrumentMode ? ["pre_post" as const] : ANALYSIS_TYPES).filter(type => definitionId || type !== target).map(value => ({ value, label: labels[value] }))]} onChange={value => { setSource(value); setReviewed(null); setSelected([]); setPage(1); }} />
    <Button variant="secondary" disabled={!source || blocked} onClick={() => { setReviewed(current); setSelected([]); setPage(1); }}>Generar vista previa de reglas</Button>
    {reviewed !== null && <>
      {stale && <p role="alert" className="text-sm text-amber-700">La configuración cambió. Genera otra vista previa y revisa las reglas antes de aplicar.</p>}
      <Table rows={reviewed.slice((currentPage - 1) * 10, currentPage * 10)} keyExtractor={row => row.externalId} emptyText="No hay preguntas habilitadas para el análisis de destino." columns={[
        { key: "select", header: "Aplicar", render: row => <input type="checkbox" aria-label={`Reutilizar regla: ${row.text}`} disabled={stale || blocked || row.status !== "ready"} checked={selected.includes(row.externalId)} onChange={event => setSelected(previous => event.target.checked ? [...previous, row.externalId] : previous.filter(id => id !== row.externalId))} /> },
        { key: "text", header: "Pregunta", render: row => <details className="w-44"><summary className="cursor-pointer truncate" title={row.text}>{row.text}</summary><p className="whitespace-pre-wrap break-words">{row.text}</p>{row.sourceText && <p className="mt-1 text-xs">Origen: {row.sourceText}</p>}</details> },
        { key: "rule", header: "Regla propuesta", render: row => row.rule ? <div className="w-64 break-words">Máximo: {row.rule.maxScore} · {row.rule.scoringMode === "ordered_scale" ? `Escala ${row.rule.inverse ? "inversa" : "normal"}: ${scaleOptionPoints(row.rule.scaleOptions ?? [], row.rule.maxScore, row.rule.inverse, row.rule.excludedOptions).map(item => `${item.value}: ${item.score === null ? "no puntuable" : Number(item.score.toFixed(6))}`).join("; ")}` : row.rule.scoringMode === "numeric_range" ? `Rango ${row.rule.numericRange?.minimum} a ${row.rule.numericRange?.maximum}; ${row.rule.numericRange?.direction === "reverse" ? "inversa" : "directa"}` : row.rule.scoringMode === "option_scores" ? row.rule.optionScores?.map(item => `${item.value}: ${item.excluded ? "no puntuable" : item.score}`).join("; ") : row.rule.correctAnswer ? `Correcta: ${row.rule.correctAnswer}` : "Escala"}{row.rule.responsePolicy && <p>Blancos: excluir · Inválidos: revisar</p>}</div> : "—" },
        { key: "status", header: "Estado", render: row => statuses[row.status] },
      ]} />
      <Pagination meta={{ page: currentPage, pageSize: 10, total: reviewed.length, totalPages: Math.ceil(reviewed.length / 10) }} onPageChange={setPage} />
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={stale || blocked || !ready.length} onClick={() => setSelected(ready.map(row => row.externalId))}>Seleccionar propuestas disponibles</Button>
        <Button disabled={stale || blocked || !count || !source} onClick={() => { if (!source || stale || blocked) return; onApply(definitionId && validOrigin ? applyInstrumentAnalysisReuse(questions, validOrigin.questions, definitionId, source, target, reviewed, selected, true) : applyAnalysisReuse(questions, source, target, reviewed, selected, true)); setReviewed(null); setSelected([]); }}>Aplicar {count} reglas a {labels[target]}</Button>
        <Button variant="secondary" onClick={() => { setReviewed(null); setSelected([]); }}>Descartar vista previa</Button>
      </div>
    </>}
  </section>;
}
