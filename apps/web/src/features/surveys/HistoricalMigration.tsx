import { useState } from "react";
import type { HistoricalImportResult, HistoricalSubmissionDto, SurveyDefinitionDto } from "@epi/shared";
import { Button, Card, DatePicker, Label } from "../../shared/components";
import { surveyApi } from "./api";
import { useI18n } from "../../lib/i18n";

export function HistoricalMigration({ definitions, onImported }: { definitions: SurveyDefinitionDto[]; onImported?: () => void }) {
  const { t } = useI18n();
  const [definitionIds, setDefinitionIds] = useState<string[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState<HistoricalSubmissionDto[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<HistoricalImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggleDefinition(id: string) {
    setDefinitionIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  function query() {
    const p = new URLSearchParams();
    p.set("surveyDefinitionIds", definitionIds.join(","));
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    return `?${p.toString()}`;
  }

  async function search() {
    if (definitionIds.length === 0) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const nextRows = await surveyApi.historicalSubmissions(query());
      setRows(nextRows);
      setSelectedIds(nextRows.filter((r) => !r.alreadyImported).map((r) => r.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("surveys.history.error"));
    } finally {
      setLoading(false);
    }
  }

  async function importRows(ids: string[]) {
    if (definitionIds.length === 0 || ids.length === 0) return;
    setImporting(true);
    setError(null);
    try {
      setResult(
        await surveyApi.importHistoricalSubmissions({
          surveyDefinitionIds: definitionIds,
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
          submissionIds: ids,
        })
      );
      await search();
      onImported?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("surveys.history.error"));
    } finally {
      setImporting(false);
    }
  }

  const importable = rows.filter((r) => !r.alreadyImported);
  const updatedUntil =
    rows.length > 0 && importable.length === 0
      ? new Date(Math.max(...rows.map((r) => new Date(r.createdAt).getTime()))).toLocaleString()
      : null;

  return (
    <Card>
      <Label variant="subtitle" className="mb-3 block">
        {t("surveys.history.title")}
      </Label>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_12rem_12rem_auto]">
        <div>
          <p className="mb-2 text-sm font-medium text-gray-700">{t("scoring.selectSurvey")}</p>
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-gray-200 p-2">
            {definitions.map((d) => (
              <label key={d.id} className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={definitionIds.includes(d.id)} onChange={() => toggleDefinition(d.id)} />
                <span>{d.title}{d.accountName ? ` · ${d.accountName}` : ""}</span>
              </label>
            ))}
          </div>
        </div>
        <DatePicker label={t("surveys.filter.from")} value={from} onChange={setFrom} />
        <DatePicker label={t("surveys.filter.to")} value={to} onChange={setTo} />
        <div className="flex items-end">
          <Button loading={loading} disabled={definitionIds.length === 0} onClick={search}>
            {t("surveys.history.search")}
          </Button>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      {updatedUntil && <p className="mt-3 text-sm text-gray-700">{t("surveys.history.updatedUntil")} {updatedUntil}</p>}
      {result && (
        <p className="mt-3 text-sm text-gray-700">
          {t("surveys.history.imported")}: <strong>{result.imported}</strong> ·{" "}
          {t("scoring.result.skipped")}: <strong>{result.skipped}</strong> ·{" "}
          {t("scoring.result.reprocessed")}: <strong>{result.processed}</strong> ·{" "}
          {t("scoring.result.stillPending")}: <strong>{result.pending}</strong> ·{" "}
          {t("scoring.result.withError")}: <strong>{result.errors}</strong>
        </p>
      )}

      {rows.length > 0 && (
        <div className="mt-4 space-y-3">
          <div className="flex justify-end">
            <Button loading={importing} disabled={selectedIds.length === 0} onClick={() => void importRows(selectedIds)}>
              {t("surveys.history.importSelected")}
            </Button>
          </div>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 bg-white text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">
                    <input
                      type="checkbox"
                      checked={selectedIds.length > 0 && selectedIds.length === importable.length}
                      onChange={(e) => setSelectedIds(e.target.checked ? importable.map((r) => r.id) : [])}
                    />
                  </th>
                  <th className="px-4 py-3 text-left font-medium">{t("surveys.table.survey")}</th>
                  <th className="px-4 py-3 text-left font-medium">{t("surveys.table.date")}</th>
                  <th className="px-4 py-3 text-left font-medium">{t("common.status")}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        disabled={r.alreadyImported}
                        checked={selectedIds.includes(r.id)}
                        onChange={(e) =>
                          setSelectedIds((ids) => (e.target.checked ? [...ids, r.id] : ids.filter((id) => id !== r.id)))
                        }
                      />
                    </td>
                    <td className="px-4 py-3 text-gray-700">{r.formTitle}</td>
                    <td className="px-4 py-3 text-gray-700">{new Date(r.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {r.alreadyImported ? t("surveys.history.alreadyImported") : t("surveys.history.ready")}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!r.alreadyImported && (
                        <Button size="sm" variant="secondary" loading={importing} onClick={() => void importRows([r.id])}>
                          {t("surveys.history.importOne")}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
}
