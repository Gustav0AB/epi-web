import { useEffect, useState } from "react";
import { scoringQuestionPage, setSetupQuestionFactor } from "./setup-steps";
import { assistantScoringReady, scaleOptionPoints, setAssistantScoring, questionClassification, activeAnalysisWeights, setAnalysisWeights, type AnalysisWeights, ANALYSIS_TYPES, configuredForAnalysis, type AnalysisType, type SurveySetupQuestion } from "@epi/shared";
import { Button, Dropdown, Pagination, Table, TextField } from "@epi/ui";

import type { AnalysisReuseScope } from "./setup-analysis-reuse";
import { ScoringProposal } from "./ScoringProposal";
import { ReuseAnalysisScoring } from "./ReuseAnalysisScoring";

import { SetupWeightsTable } from "./SetupWeightsTable";

type Question = SurveySetupQuestion & { options: string[] };
const labels = { pre_post: "Pre/Post", pre_post_post: "Pre/Post + Post-post" };
export function analysisScoringText(question: SurveySetupQuestion) {
  return question.analysisScoring?.map(rule => `${labels[rule.analysisType]}: máximo ${rule.maxScore ?? "pendiente"}${rule.scoringMode === "ordered_scale" ? `; escala ${rule.inverse ? "inversa" : "normal"}: ${scaleOptionPoints(rule.scaleOptions ?? [], rule.maxScore, rule.inverse, rule.excludedOptions).map(item => `${item.value} = ${rule.excludedOptions?.includes(item.value) ? "no puntuable" : item.score === null ? "pendiente" : Number(item.score.toFixed(6))}`).join(", ")}` : rule.scoringMode === "numeric_range" ? `; rango ${rule.numericRange?.minimum ?? "pendiente"} a ${rule.numericRange?.maximum ?? "pendiente"}; dirección ${rule.numericRange?.direction === "direct" ? "directa" : rule.numericRange?.direction === "reverse" ? "inversa" : "pendiente"}` : rule.scoringMode === "option_scores" ? `; puntos por opción: ${rule.optionScores?.map(item => `${item.value} = ${item.excluded ? "no puntuable" : item.score ?? "pendiente"}`).join(", ") || "pendiente"}` : rule.correctAnswer ? `; correcta: ${rule.correctAnswer}` : ""}${rule.responsePolicy ? `; blancos: ${rule.responsePolicy.blank === "exclude" ? "excluir" : "pendiente"}; inválidos: ${rule.responsePolicy.invalid === "review" ? "revisar" : "pendiente"}` : ""}${rule.scoringMode !== "ordered_scale" && rule.excludedOptions?.length ? `; no puntuables: ${rule.excludedOptions.join(", ")}` : ""}${configuredForAnalysis(question, rule.analysisType) ? "" : " (inactiva)"}`).join(" | ") || "Sin puntuación por análisis";
}

export function AnalysisAnswerScoring({ question, questions, analysisType, onChange }: { question: Question; questions: Question[]; analysisType: AnalysisType; onChange: (questions: SurveySetupQuestion[]) => void }) {
  const rule = question.analysisScoring?.find(item => item.analysisType === analysisType);
  const mode = rule?.scoringMode === "ordered_scale" ? "ordered_scale" : question.type === "ONE_ANSWER" ? "standard" : "ordered_scale";
  const compatible = !rule || assistantScoringReady([question], analysisType);
  return <div className="w-56 space-y-2">
    {rule && !compatible && <p role="alert" className="text-sm text-amber-700">Revisa y confirma la regla con los controles actuales. No se convertirán puntos parciales ni rangos anteriores automáticamente.</p>}
    {question.type === "ONE_ANSWER" && <Dropdown aria-label={`Método de puntuación ${labels[analysisType]}: ${question.text}`} value={mode} options={[{ value: "standard", label: "Respuesta correcta" }, { value: "ordered_scale", label: "Escala ordenada" }]} onChange={scoringMode => onChange(setAssistantScoring(questions, question.externalId, analysisType, { scoringMode }))} />}
    {mode === "standard" ? <>
      {question.options.length ? <Dropdown aria-label={`Respuesta correcta ${labels[analysisType]}: ${question.text}`} error={!rule?.correctAnswer ? "Selecciona la respuesta correcta." : question.options.length && !question.options.includes(rule.correctAnswer) ? "La respuesta ya no existe entre las opciones." : undefined} value={rule?.correctAnswer ?? ""} options={[{ value: "", label: "Selecciona la respuesta correcta" }, ...question.options.map(value => ({ value, label: value }))]} onChange={correctAnswer => onChange(setAssistantScoring(questions, question.externalId, analysisType, { correctAnswer: correctAnswer || null, scoringMode: "standard" }))} /> : <TextField aria-label={`Respuesta correcta ${labels[analysisType]}: ${question.text}`} error={!rule?.correctAnswer ? "Selecciona la respuesta correcta." : question.options.length && !question.options.includes(rule.correctAnswer) ? "La respuesta ya no existe entre las opciones." : undefined} value={rule?.correctAnswer ?? ""} onChange={event => onChange(setAssistantScoring(questions, question.externalId, analysisType, { correctAnswer: event.target.value || null, scoringMode: "standard" }))} />}
      <p className="text-xs">La respuesta correcta vale {rule?.maxScore ?? "el máximo indicado"} puntos. Sin puntuación parcial.</p>
      {question.options.length > 0 && <details><summary className="cursor-pointer text-sm">Respuestas no puntuables</summary>{question.options.map(value => <label key={value} className="flex items-center gap-2 text-xs"><input type="checkbox" aria-label={`No puntuable ${labels[analysisType]}: ${question.text} / ${value}`} checked={rule?.excludedOptions?.includes(value) ?? false} disabled={value === rule?.correctAnswer && !rule.excludedOptions?.includes(value)} onChange={event => onChange(setAssistantScoring(questions, question.externalId, analysisType, { scoringMode: "standard", excludedOptions: event.target.checked ? [...(rule?.excludedOptions ?? []), value] : (rule?.excludedOptions ?? []).filter(item => item !== value) }))} />{value}</label>)}</details>}
    </> : <>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" aria-label={`Puntuación inversa ${labels[analysisType]}: ${question.text}`} checked={rule?.inverse ?? false} onChange={event => onChange(setAssistantScoring(questions, question.externalId, analysisType, { inverse: event.target.checked, scoringMode: "ordered_scale" }))} />Puntuación inversa</label>
      <p className="text-xs">{rule?.inverse ? "Máximo en la última opción." : "Máximo en la primera opción (de mayor a menor)."} Confirma los puntos en el orden del formulario.</p>
      <ul className="space-y-1" aria-label={`Puntos por respuesta ${labels[analysisType]}: ${question.text}`}>{scaleOptionPoints(question.options, rule?.maxScore ?? null, rule?.inverse, rule?.excludedOptions).map(option => <li key={option.value} className="space-y-1 rounded border p-2"><div className="flex justify-between gap-2"><span className="min-w-0 break-words">{option.value}</span><span className="shrink-0">{rule?.excludedOptions?.includes(option.value) ? "No puntuable" : option.score === null ? "Pendiente" : `${Number(option.score.toFixed(6))} puntos`}</span></div><label className="flex items-center gap-2 text-xs"><input type="checkbox" aria-label={`No puntuable ${labels[analysisType]}: ${question.text} / ${option.value}`} checked={rule?.excludedOptions?.includes(option.value) ?? false} onChange={event => onChange(setAssistantScoring(questions, question.externalId, analysisType, { scoringMode: "ordered_scale", excludedOptions: event.target.checked ? [...(rule?.excludedOptions ?? []), option.value] : (rule?.excludedOptions ?? []).filter(value => value !== option.value) }))} />No puntuable</label></li>)}</ul>
      {!question.options.length && <p role="alert">El origen no ofrece opciones ordenadas. Esta escala queda pendiente; no se deducen opciones ni rangos.</p>}
    </>}
    {rule && !compatible && <Button size="sm" variant="secondary" onClick={() => onChange(setAssistantScoring(questions, question.externalId, analysisType, { scoringMode: mode }))}>Confirmar regla actual</Button>}
  </div>;
}

export function AnalysisWeightsSummary({ questions, weights, includeIaa, instrumentMode = false }: { questions: Question[]; weights: AnalysisWeights; includeIaa: boolean; instrumentMode?: boolean }) {
  return <section className="space-y-2"><h3 className="font-semibold">{instrumentMode ? "Distribución del instrumento" : "Distribución por análisis (provisional)"}</h3>{(instrumentMode ? ["pre_post" as const] : ANALYSIS_TYPES).map(type => {
    const active = activeAnalysisWeights(questions, weights, type, includeIaa);
    const categories = [...new Set(active.subcategoryWeights.map(item => item.category))];
    const percentage = (weight: number | null | undefined) => weight == null ? "Pendiente" : `${weight}%`;
    return <div key={type} className="space-y-2">
      <p className="text-sm">Desviación estándar: {weights.find(item => item.analysisType === type)?.standardDeviation === "sample" ? "Muestral" : weights.find(item => item.analysisType === type)?.standardDeviation === "population" ? "Poblacional" : "Desactivada"}</p>
      {!instrumentMode && <h4 className="text-sm font-semibold">{labels[type]}</h4>}
      {!categories.length && <p className="text-sm">Sin preguntas habilitadas</p>}
      <div className="grid gap-3 sm:grid-cols-2">{categories.map(category => <section key={category} className="min-w-0 rounded border">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-gray-50 px-3 py-2">
          <h5 className="break-words text-sm font-semibold">{category}</h5>
          {includeIaa && <span className="text-xs">Peso IAA: {percentage(active.categoryWeights.find(item => item.category === category)?.weight)}</span>}
        </div>
        <dl className="divide-y px-3 text-sm">{active.subcategoryWeights.filter(item => item.category === category).map(item => <div key={item.subcategory} className="flex justify-between gap-3 py-2">
          <dt className="min-w-0 break-words">{item.subcategory}</dt><dd className="shrink-0 font-medium tabular-nums">{percentage(item.weight)}</dd>
        </div>)}</dl>
      </section>)}</div>
    </div>;
  })}</section>;
}

export function SetupAnalysisScoring({ questions, onChange, weights = [], onWeightsChange, includeIaa = true, reuseScope, instrumentMode = false, focusRequest, onFocusHandled, view = "all" }: { view?: "all" | "groups" | "questions"; onFocusHandled?: () => void; focusRequest?: { id: string; request: number } | null; instrumentMode?: boolean; reuseScope?: AnalysisReuseScope | undefined; questions: Question[]; onChange: (questions: SurveySetupQuestion[]) => void; weights?: AnalysisWeights; onWeightsChange?: (weights: AnalysisWeights) => void; includeIaa?: boolean }) {
  const [analysisType, setAnalysisType] = useState<AnalysisType>("pre_post");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<"all" | "ready" | "pending">("all");
  const [category, setCategory] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const rows = questions.filter(question => configuredForAnalysis(question, analysisType));
  const activeWeights = activeAnalysisWeights(questions, weights, analysisType, includeIaa);
  const categories = [...new Set(rows.map(question => questionClassification(question)?.category).filter((value): value is string => !!value))].sort((a, b) => a.localeCompare(b, "es"));
  const ready = new Set(rows.filter(question => assistantScoringReady([question], analysisType)).map(question => question.externalId));
  const pending = rows.length - ready.size;
  // Keep the focused row visible until the user finishes editing it.
  const visibleRows = rows.filter(question => (!category || questionClassification(question)?.category === category) && (status === "all" || question.externalId === editingId || ready.has(question.externalId) === (status === "ready")));
  const currentPage = Math.min(page, Math.max(1, Math.ceil(visibleRows.length / 10)));
  useEffect(() => {
    if (!focusRequest) return;
    const nextPage = scoringQuestionPage(rows.map(question => question.externalId), focusRequest.id);
    if (nextPage === null) return;
    setStatus("all"); setCategory(""); setEditingId(null); setPage(nextPage);
  }, [focusRequest]);
  useEffect(() => {
    if (!focusRequest || category || status !== "all" || currentPage !== scoringQuestionPage(rows.map(question => question.externalId), focusRequest.id)) return;
    const field = document.getElementById(`scoring-question-${focusRequest.id}`);
    if (field) { field.focus(); onFocusHandled?.(); }
  }, [focusRequest, status, category, currentPage]);
  return <section className="space-y-3 rounded border p-3">
    <h3 className="font-semibold">{view === "groups" ? "Ponderaciones por categoría" : view === "questions" ? "Ponderaciones por pregunta" : instrumentMode ? "Puntuación y ponderaciones del instrumento" : "Puntuación y ponderaciones por análisis"}</h3>
    {view !== "groups" && <><p className="text-sm">El instrumento conserva la respuesta correcta y valor o la escala con máximo e inversión de cada pregunta. Los puntos de la escala se distribuyen automáticamente entre las opciones; no hay puntuación parcial. Configurar no activa cálculos ni vínculos.</p>
    <p className="text-sm">Blancos y no puntuables fuera del cálculo, nunca como cero. Respuestas inválidas para revisión. Configurar no activa resultados. Para ajustar el peso de una pregunta, primero indica su puntaje máximo.</p></>}
    {!instrumentMode && <Dropdown label="Análisis que estás configurando" value={analysisType} options={ANALYSIS_TYPES.map(value => ({ value, label: labels[value] }))} onChange={value => { setAnalysisType(value as AnalysisType); setCategory(""); setPage(1); setEditingId(null); }} />}
    {view !== "questions" && onWeightsChange && <div className="rounded border p-3"><Dropdown label="Desviación estándar del instrumento" value={weights.find(item => item.analysisType === analysisType)?.standardDeviation ?? "disabled"} options={[{ value: "disabled", label: "No calcular" }, { value: "sample", label: "Muestral" }, { value: "population", label: "Poblacional" }]} onChange={value => {
      if (value === "disabled" || value === "sample" || value === "population") onWeightsChange(setAnalysisWeights(weights, analysisType, { standardDeviation: value }));
    }} /><p className="mt-2 text-sm">Se calcula sobre los puntajes válidos de cada envío, por categoría y subcategoría, en escala de 0 a 100. La muestral requiere al menos dos envíos válidos. La elección se conserva con la versión del instrumento.</p></div>}
    {view !== "questions" && onWeightsChange && <SetupWeightsTable groupsOnly includeIaa={includeIaa} questions={rows} categoryWeights={activeWeights.categoryWeights} subcategoryWeights={activeWeights.subcategoryWeights} onCategoryWeightsChange={categoryWeights => onWeightsChange(setAnalysisWeights(weights, analysisType, { categoryWeights }))} onSubcategoryWeightsChange={subcategoryWeights => onWeightsChange(setAnalysisWeights(weights, analysisType, { subcategoryWeights }))} />}
    {view !== "groups" && <><ScoringProposal key={analysisType} questions={questions} analysis={analysisType} onApply={onChange} />
    <ReuseAnalysisScoring key={`${analysisType}-${reuseScope?.organizationId}-${reuseScope?.surveyType}-${reuseScope?.formId}`} scope={reuseScope} questions={questions} target={analysisType} onApply={onChange} instrumentMode={instrumentMode} />
    <div className="flex flex-wrap items-end gap-3">
      <Dropdown label="Categoría" value={category} options={[{ value: "", label: "Todas las categorías" }, ...categories.map(value => ({ value, label: value }))]} onChange={value => { setCategory(value); setPage(1); setEditingId(null); }} />
      <Dropdown label="Estado de la puntuación" value={status} options={[{ value: "all", label: "Todas" }, { value: "ready", label: "Solo configuradas" }, { value: "pending", label: "Solo pendientes" }]} onChange={value => { setStatus(value); setPage(1); setEditingId(null); }} />
      <p role="status" className="pb-1 text-sm">{ready.size} configuradas · {pending} pendientes de puntuación · {visibleRows.length} visibles{!instrumentMode && <> en {labels[analysisType]}</>}</p>
    </div>
    <div onBlurCapture={event => {
      if (!event.target.closest("tr")?.contains(event.relatedTarget)) setEditingId(null);
    }}>
    <Table rows={visibleRows.slice((currentPage - 1) * 10, currentPage * 10)} keyExtractor={question => question.externalId} emptyText={rows.length ? "No hay preguntas con este estado." : "No hay preguntas evaluables. Revisa el rol de las preguntas en el paso 2."} columns={[
      { key: "text", header: "Pregunta", render: question => <p className="min-w-48 max-w-md whitespace-pre-wrap break-words">{question.text.replace(/<\/?strong\b[^>]*>/gi, "")}</p> },
      { key: "category", header: "Categoría / Subcategoría", render: question => <span>{questionClassification(question)?.category || "—"}<br />{questionClassification(question)?.subcategory || "—"}</span> },
      { key: "maxScore", header: "Puntaje máximo", render: question => <TextField id={`scoring-question-${question.externalId}`} aria-label={`Máximo ${labels[analysisType]}: ${question.text}`} error={question.analysisScoring?.find(rule => rule.analysisType === analysisType)?.maxScore == null ? "Indica el máximo." : question.analysisScoring!.find(rule => rule.analysisType === analysisType)!.maxScore! < 0 ? "El máximo no puede ser negativo." : undefined} type="number" min={0} step="any" className="w-20" onFocus={() => setEditingId(question.externalId)} value={question.analysisScoring?.find(rule => rule.analysisType === analysisType)?.maxScore ?? ""} onChange={event => onChange(setAssistantScoring(questions, question.externalId, analysisType, { maxScore: event.target.value === "" ? null : Number(event.target.value) }))} /> },
      { key: "factor", header: "Peso de pregunta", render: question => <Dropdown aria-label={`Peso de pregunta: ${question.text}`} value={String(question.weight?.factor ?? 1)} disabled={question.analysisScoring?.find(rule => rule.analysisType === "pre_post")?.maxScore == null || !questionClassification(question)?.category} options={Array.from({ length: 10 }, (_, index) => ({ value: String(index + 1), label: String(index + 1) }))} onChange={value => onChange(questions.map(item => item.externalId === question.externalId ? setSetupQuestionFactor(item, Number(value)) : item))} /> },
      { key: "correctAnswer", header: "Puntuación de respuestas", render: question => <div onFocusCapture={() => setEditingId(question.externalId)}><AnalysisAnswerScoring question={question} questions={questions} analysisType={analysisType} onChange={onChange} /></div> },
      { key: "status", header: "Estado", render: question => ready.has(question.externalId) ? "Configurada" : "Pendiente" },
    ]} />
    </div>
    <Pagination meta={{ page: currentPage, pageSize: 10, total: visibleRows.length, totalPages: Math.ceil(visibleRows.length / 10) }} onPageChange={setPage} /></>}
  </section>;
}
