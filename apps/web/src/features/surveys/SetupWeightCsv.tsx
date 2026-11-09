import { exportWeightCsv } from "./weight-csv";
import { useRef, useState } from "react";
import type { SurveySetupQuestion, WeightInput } from "@epi/shared";
import { Button, Table, TextField } from "@epi/ui";
import { useI18n } from "../../lib/i18n";
import { previewSetupWeights, type WeightCsvRow } from "./setup-weight-csv";

type Props = {
  questions: (SurveySetupQuestion & { options: string[] })[];
  onApply: (rows: { externalId: string; weight: WeightInput }[]) => void;
};

export function SetupWeightCsv({ questions, onApply }: Props) {
  const { t } = useI18n();
  const [csv, setCsv] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const readSequence = useRef(0);
  let rows: WeightCsvRow[] = [];
  let error = fileError;
  if (csv) {
    try { rows = previewSetupWeights(csv, questions); }
    catch (err) { error = err instanceof Error ? err.message : t("surveySetup.csvInvalid"); }
  }
  const valid = rows.flatMap((row) => row.weight ? [{ externalId: row.externalId, weight: row.weight }] : []);

  async function readFile(file: File | undefined) {
    const sequence = ++readSequence.current;
    setCsv(""); setFileError(null); setReading(false);
    if (!file) return;
    if (file.size > 1024 * 1024) { setFileError(t("surveySetup.csvTooLarge")); return; }
    setReading(true);
    try {
      const text = await file.text();
      if (sequence === readSequence.current) {
        if (!text.trim()) setFileError(t("surveySetup.csvInvalid"));
        else setCsv(text);
      }
    } catch (err) { if (sequence === readSequence.current) setFileError(err instanceof Error ? err.message : t("surveySetup.csvInvalid")); }
    finally { if (sequence === readSequence.current) setReading(false); }
  }

  function downloadWeights() {
    const url = URL.createObjectURL(new Blob([exportWeightCsv(questions)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "ponderaciones-borrador.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return <div className="space-y-2 rounded border p-3">
    <Button variant="secondary" onClick={downloadWeights}>{t("scoring.downloadTemplate")}</Button>
    <TextField type="file" accept=".csv,text/csv" label={t("surveySetup.csvImport")} onChange={(event) => void readFile(event.target.files?.[0])} />
    <p className="text-sm text-gray-500">{t("surveySetup.csvHint")}</p>
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    {reading && <p role="status">{t("table.loading")}</p>}
    {!!csv && !error && !reading && <>
      <Table rows={rows} keyExtractor={(row) => String(row.row)} emptyText={t("surveySetup.csvEmpty")} columns={[
        { key: "row", header: t("surveySetup.csvRow") },
        { key: "externalId", header: t("jotformCatalog.question"), render: (row) => questions.find(question => question.externalId === row.externalId)?.text ?? t("surveySetup.csvErrors.unknown") },
        { key: "weight", header: t("surveySetup.weightSummary"), render: (row) => row.weight ? `${row.weight.category}${row.weight.subcategory ? ` / ${row.weight.subcategory}` : ""} · ${row.weight.maxScore}${row.weight.correctAnswer ? ` · ${row.weight.correctAnswer}` : ""}` : "—" },
        { key: "error", header: t("surveySetup.csvResult"), render: (row) => row.error ? t(`surveySetup.csvErrors.${row.error}`) : t("surveySetup.csvValid") },
      ]} />
      <Button variant="secondary" disabled={!valid.length} onClick={() => { onApply(valid); setCsv(""); }}>{t("surveySetup.csvApply")} ({valid.length})</Button>
    </>}
  </div>;
}
