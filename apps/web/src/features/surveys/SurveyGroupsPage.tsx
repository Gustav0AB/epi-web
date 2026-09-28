import { useCallback, useEffect, useMemo, useState } from "react";
import type { SurveyGroupSearchRow } from "@epi/shared";
import { Button, Card, DatePicker, Label, Table } from "../../shared/components";
import type { Column } from "../../shared/components";
import { surveyApi } from "./api";
import { useI18n } from "../../lib/i18n";

function yearRange() {
  const year = new Date().getFullYear();
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

function query(from: string, to: string) {
  const p = new URLSearchParams();
  if (from) p.set("from", from);
  if (to) p.set("to", to);
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function SurveyGroupsPage() {
  const { t } = useI18n();
  const initial = useMemo(yearRange, []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [rows, setRows] = useState<SurveyGroupSearchRow[]>([]);
  const [totalGroups, setTotalGroups] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await surveyApi.groupSearch(query(from, to));
      setRows(result.rows);
      setTotalGroups(result.totalGroups);
    } catch {
      setRows([]);
      setTotalGroups(0);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: Column<SurveyGroupSearchRow>[] = [
    { key: "school", header: t("surveyGroups.table.school"), render: (r) => r.school },
    { key: "date", header: t("surveyGroups.table.date"), render: (r) => new Date(`${r.date}T00:00:00`).toLocaleDateString() },
    { key: "studentsResponded", header: t("surveyGroups.table.students"), align: "right" },
    { key: "manager", header: t("surveyGroups.table.manager"), render: (r) => r.manager ?? "—" },
    { key: "preCount", header: "Pre", align: "right" },
    { key: "postCount", header: "Post", align: "right" },
    { key: "cqsCount", header: "CQS", align: "right" },
    {
      key: "improvementPercent",
      header: t("surveyGroups.table.improvement"),
      align: "right",
      render: (r) => (r.improvementPercent === null ? "—" : `${r.improvementPercent > 0 ? "+" : ""}${r.improvementPercent}%`),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Label variant="title" className="block">{t("surveyGroups.title")}</Label>
        <p className="mt-0.5 text-sm text-gray-500">{t("surveyGroups.subtitle")}</p>
      </div>

      <Card>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[12rem_12rem_auto]">
          <DatePicker label={t("surveys.filter.from")} value={from} onChange={setFrom} />
          <DatePicker label={t("surveys.filter.to")} value={to} onChange={setTo} />
          <div className="flex items-end gap-2">
            <Button loading={loading} onClick={load}>{t("surveys.history.search")}</Button>
            <button onClick={() => { setFrom(""); setTo(""); }} className="pb-2 text-sm font-medium text-primary hover:underline">
              {t("surveys.filter.clear")}
            </button>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card><p className="text-sm text-gray-500">{t("surveyGroups.totalGroups")}</p><p className="mt-1 text-2xl font-semibold text-gray-900">{totalGroups}</p></Card>
        <Card><p className="text-sm text-gray-500">{t("surveyGroups.totalStudents")}</p><p className="mt-1 text-2xl font-semibold text-gray-900">{rows.reduce((sum, r) => sum + r.studentsResponded, 0)}</p></Card>
        <Card><p className="text-sm text-gray-500">{t("surveyGroups.withImprovement")}</p><p className="mt-1 text-2xl font-semibold text-gray-900">{rows.filter((r) => r.improvementPercent !== null).length}</p></Card>
      </div>

      <Table
        columns={columns}
        rows={rows}
        keyExtractor={(r) => r.id}
        loading={loading}
        emptyText={t("surveyGroups.empty")}
        pageSize={25}
      />
    </div>
  );
}
