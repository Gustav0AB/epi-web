import { useEffect, useState } from "react";
import type { QuestionWithWeight, SurveyDefinitionDto, SurveySetupQuestion, WeightInput } from "@epi/shared";
import { Button, Dropdown, Table } from "../../shared/components";
import { useI18n } from "../../lib/i18n";
import { surveyApi } from "./api";
import { previewReusedWeights } from "./setup-weight-reuse";

type Props = {
  organizationId: string | null;
  surveyType: "LOCAL" | "VISITING" | "OTHER";
  formId: string;
  questions: (SurveySetupQuestion & { options: string[] })[];
  onApply: (rows: { externalId: string; weight: WeightInput }[]) => void;
};

export function ReuseSetupWeights({ organizationId, surveyType, formId, questions, onApply }: Props) {
  const { t } = useI18n();
  const [definitions, setDefinitions] = useState<SurveyDefinitionDto[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [source, setSource] = useState<{ id: string; questions: QuestionWithWeight[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    setLoading(true); setError(null); setDefinitions([]);
    void surveyApi.definitions().then((data) => {
      if (!cancelled) setDefinitions(data.filter((definition) => definition.organizationId === organizationId && definition.type === surveyType && definition.jotformFormId !== formId));
    }).catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : t("jotformCatalog.loadError")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [organizationId, surveyType, formId, reload]);
  useEffect(() => {
    if (!sourceId || !definitions.some((definition) => definition.id === sourceId)) { setSource(null); return; }
    let cancelled = false;
    setSource(null); setLoading(true); setError(null);
    void surveyApi.questions(sourceId).then((data) => { if (!cancelled) setSource({ id: sourceId, questions: data }); })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : t("jotformCatalog.loadError")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sourceId, definitions]);
  if (!organizationId) return null;
  const rows = source?.id === sourceId ? previewReusedWeights(questions, source.questions) : [];
  const ready = rows.flatMap((row) => row.weight ? [{ externalId: row.externalId, weight: row.weight }] : []);
  return <div className="space-y-2 rounded border p-3">
    <Dropdown label={t("surveySetup.reuseSource")} value={sourceId} disabled={loading} options={[{ value: "", label: t("surveySetup.select") }, ...definitions.map((definition) => ({ value: definition.id, label: `${definition.title} · v${definition.version}` }))]} onChange={setSourceId} />
    <p className="text-sm text-gray-500">{t("surveySetup.reuseHint")}</p>
    {loading && <p role="status">{t("table.loading")}</p>}
    {error && <div role="alert" className="text-sm text-danger"><p>{error}</p><Button variant="secondary" onClick={() => setReload((value) => value + 1)}>{t("jotformCatalog.retry")}</Button></div>}
    {!loading && !error && !definitions.length && <p>{t("surveySetup.reuseEmpty")}</p>}
    {!!rows.length && !loading && !error && <>
      <Table rows={rows} keyExtractor={(row) => row.externalId} columns={[
        { key: "text", header: t("jotformCatalog.question") },
        { key: "weight", header: t("surveySetup.weightSummary"), render: (row) => row.weight ? `${row.weight.category}${row.weight.subcategory ? ` / ${row.weight.subcategory}` : ""} · ${row.weight.maxScore}${row.weight.correctAnswer ? ` · ${row.weight.correctAnswer}` : ""}` : "—" },
        { key: "status", header: t("surveySetup.csvResult"), render: (row) => t(`surveySetup.reuseStatus.${row.status}`) },
      ]} />
      <Button variant="secondary" disabled={!ready.length} onClick={() => onApply(ready)}>{t("surveySetup.reuseApply")} ({ready.length})</Button>
    </>}
  </div>;
}
