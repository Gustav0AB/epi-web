import { useState } from "react";
import type { CategoryDto, SurveySetupDraft } from "@epi/shared";
import { Button } from "@epi/ui";
import { exportInstrumentTableCsv, type ConfigQuestion } from "./instrument-config-table";

export function instrumentDownloadName(instrument: string, site: string, date: Date, extension: "xlsx" | "csv") {
  const safe = (value: string) => value.normalize("NFC").replace(/[\\/:*?"<>|\x00-\x1f]/g, " ").replace(/\s+/g, " ").trim().replace(/^\.+|\.+$/g, "").slice(0, 80) || "sin-nombre";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${safe(instrument)}-${safe(site)}-${month}${day}${date.getFullYear()}.${extension}`;
}

export function InstrumentConfigDownload({ draft, questions, categories, siteName, blank = false, disabled = false }: { draft: SurveySetupDraft; questions: ConfigQuestion[]; categories: CategoryDto[]; siteName: string; blank?: boolean; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function download(excel: boolean) {
    setBusy(true); setError(null);
    try {
      let blob: Blob;
      if (excel) {
        const { createInstrumentWorkbook } = await import("./instrument-config-workbook");
        const buffer = await createInstrumentWorkbook(draft, questions, categories, blank).xlsx.writeBuffer();
        blob = new Blob([new Uint8Array(buffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      } else blob = new Blob([exportInstrumentTableCsv(draft, questions, blank)], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = url; link.download = instrumentDownloadName(draft.instrumentName, siteName, new Date(), excel ? "xlsx" : "csv"); link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo generar el archivo"); }
    finally { setBusy(false); }
  }
  const legacy = questions.some(question => question.analysisScoring?.some(rule => rule.optionScores !== undefined || rule.numericRange !== undefined || rule.scoringMode === "option_scores" || rule.scoringMode === "numeric_range"));
  return <div className="space-y-2">{!blank && legacy && <p role="status" className="text-sm text-amber-700">Las reglas antiguas por opción o rango se marcan para revisión y no se pueden reconstruir automáticamente desde este archivo.</p>}<div className="flex flex-wrap gap-2"><Button disabled={disabled || busy} loading={busy} onClick={() => void download(true)}>{blank ? "Descargar plantilla Excel" : "Descargar configuración Excel"}</Button><Button variant="secondary" disabled={disabled || busy} onClick={() => void download(false)}>{blank ? "Descargar plantilla CSV" : "Descargar configuración CSV"}</Button></div>{error && <p role="alert" className="text-danger">{error}</p>}</div>;
}
