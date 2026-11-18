import { useRef, useState } from "react";
import { Button, Dropdown, Table, TextField } from "@epi/ui";
import type { CategoryDto, SurveySetupDraft } from "@epi/shared";
import { parseAssessmentCsv, type AssessmentParseResult } from "./assessment-csv";
import { previewAssessmentImport } from "./assessment-import";
import type { ConfigQuestion } from "./instrument-config-table";

export function AssessmentLegacyImport({ draft, questions, categories, protectedIds, disabled, onApply, open, onToggle }: { open: boolean; onToggle: () => void; draft: SurveySetupDraft; questions: ConfigQuestion[]; categories: CategoryDto[]; protectedIds: string[]; disabled: boolean; onApply: (draft: SurveySetupDraft) => void }) {
  const [file, setFile] = useState<AssessmentParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [confirmed, setConfirmed] = useState<Record<number, string>>({});
  const [selectedCategories, setSelectedCategories] = useState<Record<string, string>>({});
  const sequence = useRef(0);
  const preview = file ? previewAssessmentImport(file, draft, questions, categories, protectedIds, confirmed, selectedCategories) : null;
  async function read(value: File | undefined) {
    const current = ++sequence.current; setFile(null); setError(null); setLoaded(false); setConfirmed({}); setSelectedCategories({});
    if (!value) return;
    try {
      if (!/\.csv$/i.test(value.name)) throw new Error("Selecciona un archivo CSV.");
      if (value.size > 2 * 1024 * 1024) throw new Error("El archivo supera 2 MB.");
      const parsed = parseAssessmentCsv(await value.text());
      if (sequence.current === current) setFile(parsed);
    } catch (reason) { if (sequence.current === current) setError(reason instanceof Error ? reason.message : "No se pudo leer el archivo."); }
  }
  return <>
    <Button variant="secondary" onClick={onToggle} aria-expanded={open}>Configurar por formato antiguo</Button>
    {open && <div className="w-full space-y-3 rounded border p-3">
      <p className="text-sm">Carga un CSV Assessment Results / Answer Key. Las preguntas se comparan con el formulario actual; el archivo no se modifica y la configuración no se guarda automáticamente.</p>
      <TextField label="Archivo Assessment CSV" type="file" accept=".csv,text/csv" disabled={disabled} onChange={event => void read(event.target.files?.[0])} />
      {disabled && <p>Selecciona el sitio y espera a que cargue el catálogo de subcategorías.</p>}
      {error && <p role="alert" className="text-danger">{error}</p>}
      {file && preview && <>
        <p>{file.columns.length} preguntas detectadas · {preview.count} listas para cargar. Post Only se conserva como indicador y queda pendiente de revisión.</p>
        {preview.rows.some(row => row.status !== "Lista para cargar" && !row.status.startsWith("Lista para cargar;")) && <p className="text-sm">Pendientes: {Object.entries(preview.rows.reduce<Record<string, number>>((counts, row) => {
          if (!row.status.startsWith("Lista para cargar")) counts[row.status] = (counts[row.status] ?? 0) + 1;
          return counts;
        }, {})).map(([reason, count]) => `${count}: ${reason}`).join(" · ")}.</p>}
        <p className="text-sm">Las escalas se cargarán en sentido normal con el puntaje máximo del archivo. Las preguntas evaluables ya cargadas que coincidan con el archivo se marcarán como revisadas sin cambiar su configuración. Revisa las coincidencias de filas de matriz antes de guardar. Cuando el texto cambió, compara ambas preguntas y confirma la coincidencia sugerida. Si falta una subcategoría, selecciona la actual del catálogo; se aplicará a las preguntas que tengan el mismo nombre en el archivo.</p>
        {file.warnings.map((warning, i) => <p key={i} role="status" className="text-amber-700">Columna {warning.column}: {warning.message}</p>)}
        <Table rows={preview.rows} keyExtractor={row => String(row.id)} pageSize={10} columns={[
          { key: "question", header: "Pregunta", render: row => <div className="min-w-64 whitespace-normal break-words"><p>{row.matchedQuestion ?? row.question}</p>{row.matchedQuestion && row.matchedQuestion !== row.question && <p className="mt-1 text-xs text-gray-600">Archivo: {row.question}</p>}</div> },
          { key: "type", header: "Tipo" }, { key: "subcategory", header: "Subcategoría", render: row => <div className="min-w-56 space-y-1"><p>Archivo: {row.subcategory ?? "Sin subcategoría"}</p>{row.needsCategoryChoice && <Dropdown label={`Subcategoría actual para ${row.question}`} value={selectedCategories[row.categoryKey] ?? ""} options={[{ value: "", label: "Selecciona una subcategoría" }, ...categories.filter(item => item.isActive && item.subcategory).map(item => ({ value: item.id, label: `${item.name} / ${item.subcategory}` }))]} onChange={value => setSelectedCategories(current => ({ ...current, [row.categoryKey]: value }))} />}</div> },
          { key: "maximum", header: "Máximo", render: row => row.maximum ?? "—" }, { key: "correct", header: "Respuesta correcta", render: row => row.correct ?? "—" },
          { key: "scaleDirection", header: "Escala", render: row => row.scaleDirection ?? "—" }, { key: "postOnly", header: "Post Only", render: row => row.postOnly ? "Sí" : "No" }, { key: "status", header: "Revisión", render: row => <div>{row.status}{row.status === "Coincidencia sugerida; confirmar" && row.suggestedId && <Button variant="secondary" onClick={() => setConfirmed(value => ({ ...value, [row.id]: row.suggestedId! }))}>Confirmar coincidencia</Button>}</div> },
        ]} />
        {preview.errors.map((issue, index) => <p key={index} role="alert" className="text-danger">{issue.message}</p>)}
        <Button disabled={disabled || !preview.draft} onClick={() => { if (preview.draft) { onApply(preview.draft); setFile(null); setLoaded(true); } }}>Cargar {preview.count} preguntas al asistente</Button>
      </>}
      {loaded && <p role="status">Configuración cargada en pantalla. Revisa los pasos y guarda los cambios manualmente.</p>}
    </div>}
  </>;
}
