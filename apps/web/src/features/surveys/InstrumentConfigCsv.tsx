import { useRef, useState } from "react";
import type { SurveySetupDraft, CategoryDto, SiteDto } from "@epi/shared";
import { Button, Table, TextField } from "../../shared/components";
import { previewInstrumentConfigCsv } from "./instrument-config-csv";
import { exportInstrumentTableCsv, hasScoreValues, previewInstrumentTable, readInstrumentTableCsv, type ConfigQuestion, type ConfigRow } from "./instrument-config-table";

export function InstrumentConfigCsv({ formId, draft, questions, categories, sites, catalogReady = true, onApply }: { formId: string; draft: SurveySetupDraft; questions: ConfigQuestion[]; categories: CategoryDto[]; sites: SiteDto[]; catalogReady?: boolean; onApply: (draft: SurveySetupDraft) => void }) {
  const [open, setOpen] = useState(false);
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
  function downloadFile(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function download(excel: boolean) {
    setBusy(true); setError(null);
    try {
      if (excel) {
        const { createInstrumentWorkbook } = await import("./instrument-config-workbook");
        const buffer = await createInstrumentWorkbook(draft, questions, categories).xlsx.writeBuffer();
        downloadFile(new Blob([new Uint8Array(buffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "configuracion-preguntas.xlsx");
      } else downloadFile(new Blob([exportInstrumentTableCsv(draft, questions)], { type: "text/csv;charset=utf-8" }), "configuracion-preguntas.csv");
    } catch (error) { setError(error instanceof Error ? error.message : "No se pudo generar el archivo"); }
    finally { setBusy(false); }
  }
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
    <Button variant="secondary" onClick={() => setOpen(value => !value)} aria-expanded={open}>Configurar por CSV / Excel</Button>
    {open && <>
      <p className="text-sm">Una fila por pregunta, sin ID de formulario. Reutiliza el archivo en instrumentos con las mismas preguntas y opciones; si cambia alguno, edita esa copia como referencia. Los datos generales se eligen aquí, no en el archivo.</p>
      <p className="text-sm">En Excel, Preguntas corresponde al paso 2 y Ponderaciones al paso 3. Las pestañas Instrucciones y Catálogos sirven de referencia. Puedes cargar solo Preguntas; la aplicación realiza los cálculos después. El CSV simple no admite pestañas ni desplegables.</p>
      <div className="flex flex-wrap gap-2"><Button disabled={busy || !draft.siteId || !catalogReady} loading={busy} onClick={() => void download(true)}>Descargar Excel con desplegables</Button><Button variant="secondary" disabled={busy || !draft.siteId || !catalogReady} onClick={() => void download(false)}>Descargar CSV simple</Button></div>
      <TextField label="Importar configuración Excel o CSV" type="file" accept=".xlsx,.csv" disabled={busy || !draft.siteId || !catalogReady} onChange={event => void read(event.target.files?.[0])} />
      <p className="text-sm">Se reconocen por texto y, si se repiten, por sección. Las opciones deben coincidir en orden. Las filas sin coincidencia o con opciones distintas no se aplican; las preguntas nuevas del destino conservan sus valores. No se adivinan equivalencias.</p>
      <p className="text-sm">Importar no guarda, vincula ni activa. Revisa los cuatro pasos y guarda manualmente cada sección antes de confirmar al final.</p>
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
        {!!matches.length && <Table rows={matches} pageSize={10} keyExtractor={row => String(row.row)} columns={[{ key: "row", header: "Fila" }, { key: "question", header: "Pregunta del archivo", render: row => <p className="w-52 truncate" title={row.question}>{row.question}</p> }, { key: "status", header: "Coincidencia" }, { key: "detail", header: "Revisión", render: row => <p className="max-w-md whitespace-normal break-words">{row.detail}</p> }]} />}
        {!!preview.errors.length && <Table rows={preview.errors.slice(0, 100).map((item, id) => ({ ...item, id }))} keyExtractor={row => String(row.id)} columns={[{ key: "row", header: "Fila" }, { key: "message", header: "Corrección necesaria" }]} />}
        {preview.draft && !scoreError && <Button disabled={busy || applied} onClick={() => { onApply(preview.draft!); setApplied(true); setFileRows(null); setLegacyCsv(""); }}>Cargar {preview.questionCount} preguntas compatibles al asistente</Button>}
      </>}
      {applied && <p role="status">Configuración cargada en pantalla. Todavía no se ha guardado; revisa y continúa por todos los pasos.</p>}
    </>}
  </section>;
}
