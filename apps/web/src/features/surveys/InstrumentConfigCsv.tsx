import { InstrumentConfigDownload } from "./InstrumentConfigDownload";
import { useRef, useState } from "react";
import type { SurveySetupDraft, CategoryDto, SiteDto } from "@epi/shared";
import { Button, Dropdown, Table, TextField } from "@epi/ui";
import { surveyApi } from "./api";
import { AssessmentLegacyImport } from "./AssessmentLegacyImport";
import { prefillPreview } from "./instrument-prefill";
import { previewInstrumentConfigCsv } from "./instrument-config-csv";
import { hasScoreValues, previewInstrumentTable, readInstrumentTableCsv, type ConfigQuestion, type ConfigRow } from "./instrument-config-table";

export function InstrumentConfigCsv({ formId, draft, questions, categories, sites, protectedIds = [], catalogReady = true, onApply }: { formId: string; draft: SurveySetupDraft; questions: ConfigQuestion[]; categories: CategoryDto[]; sites: SiteDto[]; protectedIds?: string[]; catalogReady?: boolean; onApply: (draft: SurveySetupDraft) => void }) {
  const [panel, setPanel] = useState<"file" | "source" | "legacy" | null>(null);
  const open = panel === "file";
  const sourceOpen = panel === "source";
  const [sources, setSources] = useState<{ id: string; title: string; rows: ReturnType<typeof prefillPreview> }[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [fileRows, setFileRows] = useState<{ questions: ConfigRow[]; scores?: ConfigRow[]; scoreError?: string } | null>(null);
  const [includeScores, setIncludeScores] = useState(true);
  const [legacyCsv, setLegacyCsv] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState(false);
  const sequence = useRef(0);
  const split = fileRows?.scores !== undefined;
  const scoreError = split && includeScores ? fileRows.scoreError : undefined;
  const modernPreview = fileRows ? previewInstrumentTable(fileRows.questions, draft, questions, categories, split ? includeScores ? fileRows.scores : [] : undefined) : null;
  const scoresAvailable = split && (fileRows.scoreError || fileRows.scores?.some(hasScoreValues));
  const preview = modernPreview ?? (legacyCsv ? previewInstrumentConfigCsv(legacyCsv, formId, draft, questions, categories, sites) : null);
  const matches = modernPreview?.matches ?? [];
  async function findSources() {
    setBusy(true); setError(null); setPanel("source"); setSources([]); setSourceId("");
    try {
      const definitions = (await surveyApi.definitions()).filter(item => item.jotformFormId !== formId);
      const results = await Promise.all(definitions.map(async definition => {
        const data = await surveyApi.reusableConfiguration(definition.id);
        const preview = prefillPreview(draft, questions, categories, data, protectedIds);
        return { id: definition.id, title: `${definition.title} · v${definition.version}${definition.configurationVersion === 4 ? "" : " · versión anterior"}`, rows: definition.configurationVersion === 4 ? preview : { ...preview, draft: null, errors: ["La configuración anterior requiere revisión manual antes de reutilizarse."] } };
      }));
      setSources(results.sort((a, b) => b.rows.count - a.rows.count));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudieron buscar instrumentos"); }
    finally { setBusy(false); }
  }
  const source = sources.find(item => item.id === sourceId);
  async function read(file: File | undefined) {
    const current = ++sequence.current;
    setFileRows(null); setLegacyCsv(""); setError(null); setApplied(false); setIncludeScores(true);
    if (!file) return;
    setBusy(true);
    try {
      if (file.size > 2 * 1024 * 1024) throw Error("El archivo supera 2 MB");
      if (/\.xlsx$/i.test(file.name)) {
        const { readInstrumentWorkbook } = await import("./instrument-config-workbook");
        const imported = await readInstrumentWorkbook(await file.arrayBuffer());
        if (current === sequence.current) setFileRows(imported);
      } else if (/\.csv$/i.test(file.name)) {
        const text = await file.text();
        if (!text.trim()) throw Error("El archivo está vacío");
        if (current === sequence.current) {
          if (text.replace(/^\uFEFF/, "").startsWith("tipo,formulario,")) setLegacyCsv(text);
          else setFileRows({ questions: readInstrumentTableCsv(text) });
        }
      } else throw Error("Usa un archivo .xlsx o .csv");
    } catch (error) { if (current === sequence.current) setError(error instanceof Error ? error.message : "No se pudo leer el archivo"); }
    finally { if (current === sequence.current) setBusy(false); }
  }
  return <section className="space-y-3 rounded border p-3">
    <div className="flex flex-wrap items-start gap-3">
    <Button variant="secondary" onClick={() => setPanel(value => value === "file" ? null : "file")} aria-expanded={open}>Configurar por CSV / Excel</Button>
    <Button variant="secondary" disabled={busy || !draft.siteId || !catalogReady} aria-expanded={sourceOpen} onClick={() => sourceOpen ? setPanel(null) : void findSources()}>Prellenar desde otros instrumentos</Button>
    <AssessmentLegacyImport open={panel === "legacy"} onToggle={() => setPanel(value => value === "legacy" ? null : "legacy")} draft={draft} questions={questions} categories={categories} protectedIds={protectedIds} disabled={busy || !draft.siteId || !catalogReady} onApply={onApply} />
    </div>
    {sourceOpen && <div className="space-y-2"><p className="text-sm">Revisa las coincidencias antes de aplicarlas. Las preguntas ya editadas se conservan.</p><Dropdown label="Instrumento de referencia" value={sourceId} options={[{ value: "", label: "Selecciona un instrumento" }, ...sources.map(item => ({ value: item.id, label: `${item.title} · ${item.rows.count}/${item.rows.total} coincidencias` }))]} onChange={setSourceId} />{!busy && !sources.length && <p>No hay instrumentos disponibles para comparar.</p>}{source && <><Table rows={source.rows.matches} pageSize={10} keyExtractor={row => row.externalId} columns={[{ key: "text", header: "Pregunta" }, { key: "status", header: "Resultado" }]} />{source.rows.errors.map((message, i) => <p role="alert" key={i}>{message}</p>)}<Button disabled={!source.rows.draft} onClick={() => { if (source.rows.draft) { onApply(source.rows.draft); setPanel(null); setSources([]); setApplied(true); } }}>Aplicar {source.rows.count} coincidencias</Button></>}</div>}
    {error && !open && <p role="alert" className="text-danger">{error}</p>}
    {open && <>
      <p className="text-sm">Una fila por pregunta, sin ID de formulario. Reutiliza el archivo en instrumentos con las mismas preguntas y opciones; si cambia alguno, edita esa copia como referencia. Los datos generales se eligen aquí, no en el archivo.</p>
      <p className="text-sm">En Excel, Preguntas corresponde al paso 2 y Ponderaciones a los pasos 3 y 4. Las pestañas Instrucciones y Catálogos sirven de referencia. Puedes cargar solo Preguntas; la aplicación realiza los cálculos después. El CSV simple no admite pestañas ni desplegables.</p>
      <InstrumentConfigDownload blank draft={draft} questions={questions} categories={categories} siteName={sites.find(site => site.id === draft.siteId)?.name ?? "sitio"} disabled={busy || !draft.siteId || !catalogReady} />
      <p className="text-sm">La plantilla conserva preguntas y respuestas originales; sus campos de configuración están vacíos.</p>
      <TextField label="Importar configuración Excel o CSV" type="file" accept=".xlsx,.csv" disabled={busy || !draft.siteId || !catalogReady} onChange={event => void read(event.target.files?.[0])} />
      <p className="text-sm">Se reconocen por texto y, si se repiten, por sección. Las opciones deben coincidir en orden. Las filas sin coincidencia o con opciones distintas no se aplican; las preguntas nuevas del destino conservan sus valores. No se adivinan equivalencias.</p>
      <p className="text-sm">Importar no guarda, vincula ni activa. Revisa los cinco pasos; puedes guardar un borrador y confirmar el registro al final.</p>
      {error && <p role="alert" className="text-danger">{error}</p>}
      {busy && <p role="status">Procesando archivo…</p>}
      {!draft.siteId && <p>Selecciona el sitio para cargar su catálogo de subcategorías.</p>}
      {draft.siteId && !catalogReady && <p role="status">Espera a que esté disponible el catálogo del sitio.</p>}
      {preview && <>
        {scoresAvailable && <label className="flex gap-2"><input type="checkbox" checked={includeScores} onChange={event => setIncludeScores(event.target.checked)} /> Cargar también Ponderaciones</label>}
        {split && !scoresAvailable && <p>Sin ponderaciones en el archivo. Solo se cargará Preguntas.</p>}
        {scoreError && <p role="alert">{scoreError}. Puedes desmarcar Ponderaciones para cargar solo Preguntas.</p>}
        <p>{preview.questionCount} preguntas compatibles · {preview.errors.length} errores{ modernPreview ? ` · ${modernPreview.unchanged} preguntas del destino sin modificar` : " · Formato anterior ligado al formulario"}.</p>
        {matches.some(match => match.status !== "Compatible") && <p role="status" className="text-amber-700">Hay filas sin coincidencia que se omitirán. Revisa la tabla antes de cargar las compatibles.</p>}
        {!!matches.length && <Table rows={matches} pageSize={10} keyExtractor={row => String(row.row)} columns={[{ key: "row", header: "Fila" }, { key: "question", header: "Pregunta", render: row => <p className="min-w-64 max-w-xl whitespace-normal break-words">{row.target !== "—" ? row.target : row.question}{row.target !== "—" && row.target !== row.question && <span className="block text-xs text-gray-600">Archivo: {row.question}</span>}</p> }, { key: "status", header: "Coincidencia" }, { key: "detail", header: "Revisión", render: row => <p className="max-w-md whitespace-normal break-words">{row.detail}</p> }]} />}
        {!!preview.errors.length && <Table rows={preview.errors.slice(0, 100).map((item, id) => ({ ...item, id }))} keyExtractor={row => String(row.id)} columns={[{ key: "row", header: "Fila" }, { key: "message", header: "Corrección necesaria" }]} />}
        {preview.draft && !scoreError && <Button disabled={busy || applied} onClick={() => { onApply(preview.draft!); setApplied(true); setFileRows(null); setLegacyCsv(""); }}>Cargar {preview.questionCount} preguntas compatibles al asistente</Button>}
      </>}
      {applied && <p role="status">Configuración cargada en pantalla. Todavía no se ha guardado; revisa y continúa por todos los pasos.</p>}
    </>}
  </section>;
}
