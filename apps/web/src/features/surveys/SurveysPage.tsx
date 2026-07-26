import { useCallback, useEffect, useState } from "react";
import type {
  GroupSummary,
  SiteDto,
  SurveyDefinitionDto,
  SurveyListItem,
} from "@epi/shared";
import { SUBMISSION_STATUSES } from "@epi/shared";
import { Button, Card, DatePicker, Label, Table } from "../../shared/components";
import type { Column, DropdownOption } from "../../shared/components";
import { Dropdown } from "../../shared/components";
import { surveyApi } from "./api";
import { StatusBadge } from "./StatusBadge";
import { useI18n } from "../../lib/i18n";

type Filters = {
  surveyDefinitionId: string;
  status: string;
  groupName: string;
  siteId: string;
  type: string;
  isPre: string; // "" | "true" | "false"
  from: string;
  to: string;
};

const EMPTY: Filters = {
  surveyDefinitionId: "",
  status: "",
  groupName: "",
  siteId: "",
  type: "",
  isPre: "",
  from: "",
  to: "",
};

function buildQuery(f: Filters): string {
  const p = new URLSearchParams();
  if (f.surveyDefinitionId) p.set("surveyDefinitionId", f.surveyDefinitionId);
  if (f.status) p.set("status", f.status);
  if (f.groupName) p.set("groupName", f.groupName);
  if (f.siteId) p.set("siteId", f.siteId);
  if (f.type) p.set("type", f.type);
  if (f.isPre) p.set("isPre", f.isPre);
  if (f.from) p.set("from", f.from);
  if (f.to) p.set("to", `${f.to}T23:59:59`); // inclusivo hasta fin del día
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function SurveysPage() {
  const { t } = useI18n();
  const STATUS_LABELS: Record<string, string> = {
    PROCESADO: t("surveys.status.processed"),
    PENDIENTE_CONFIGURACION: t("surveys.status.pending"),
    COMPLETADO: t("surveys.status.completed"),
    ERROR: t("surveys.status.error"),
  };
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [rows, setRows] = useState<SurveyListItem[]>([]);
  const [definitions, setDefinitions] = useState<SurveyDefinitionDto[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [sites, setSites] = useState<SiteDto[]>([]);
  const [summary, setSummary] = useState<GroupSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);
  const [completingGroup, setCompletingGroup] = useState<string | null>(null);
  const [completeError, setCompleteError] = useState<string | null>(null);

  useEffect(() => {
    void surveyApi.definitions().then(setDefinitions).catch(() => {});
    void surveyApi.groups().then(setGroups).catch(() => {});
    void surveyApi.sites().then(setSites).catch(() => {});
    void surveyApi.summary().then(setSummary).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await surveyApi.list(buildQuery(filters)));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void load();
  }, [load]);

  async function reprocess(id: string) {
    setReprocessingId(id);
    try {
      await surveyApi.reprocess(id);
      await load();
    } finally {
      setReprocessingId(null);
    }
  }

  // Marca COMPLETADO las encuestas procesadas del grupo (requiere pre y post).
  async function completeGroup(groupName: string) {
    setCompletingGroup(groupName);
    setCompleteError(null);
    try {
      await surveyApi.completeGroup(groupName);
      setSummary(await surveyApi.summary());
      await load();
    } catch (e) {
      setCompleteError(e instanceof Error ? e.message : t("surveys.summary.completeError"));
    } finally {
      setCompletingGroup(null);
    }
  }

  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));

  const surveyOptions: DropdownOption[] = [
    { label: t("surveys.filter.allSurveys"), value: "" },
    ...definitions.map((d) => ({
      label: `${d.jotformFormId} (v${d.version})`,
      value: d.id,
    })),
  ];
  const statusOptions: DropdownOption[] = [
    { label: t("surveys.filter.allStatuses"), value: "" },
    ...SUBMISSION_STATUSES.map((s) => ({ label: STATUS_LABELS[s] ?? s, value: s })),
  ];
  const groupOptions: DropdownOption[] = [
    { label: t("surveys.filter.allGroups"), value: "" },
    ...groups.map((g) => ({ label: g, value: g })),
  ];
  const siteOptions: DropdownOption[] = [
    { label: t("surveys.filter.allSites"), value: "" },
    ...sites.map((s) => ({ label: s.name, value: s.id })),
  ];
  const typeOptions: DropdownOption[] = [
    { label: t("surveys.filter.localAndVisiting"), value: "" },
    { label: t("surveys.filter.local"), value: "LOCAL" },
    { label: t("surveys.filter.visiting"), value: "VISITING" },
  ];
  const prePostOptions: DropdownOption[] = [
    { label: t("surveys.filter.preAndPost"), value: "" },
    { label: t("surveys.filter.pre"), value: "true" },
    { label: t("surveys.filter.post"), value: "false" },
  ];

  const columns: Column<SurveyListItem>[] = [
    { key: "participant", header: t("surveys.table.participant"), render: (r) => r.participant?.name ?? "—" },
    { key: "group", header: t("surveys.table.group"), render: (r) => r.participant?.groupName ?? "—" },
    {
      key: "survey",
      header: t("surveys.table.survey"),
      render: (r) => r.surveyDefinition?.jotformFormId ?? "—",
    },
    {
      key: "prePost",
      header: t("surveys.table.prePost"),
      render: (r) => (r.isPre === null ? "—" : r.isPre ? t("surveys.filter.pre") : t("surveys.filter.post")),
    },
    {
      key: "receivedAt",
      header: t("surveys.table.date"),
      render: (r) => new Date(r.receivedAt).toLocaleString(),
    },
    {
      key: "status",
      header: t("surveys.table.status"),
      render: (r) => (
        <div className="flex items-center gap-1.5" title={r.processingError ?? undefined}>
          <StatusBadge status={r.status} />
          {r.isDuplicate && (
            <span
              className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
              title={t("surveys.duplicateTitle")}
            >
              {t("surveys.duplicate")}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) =>
        r.status === "PENDIENTE_CONFIGURACION" || r.status === "ERROR" ? (
          <Button
            variant="secondary"
            size="sm"
            loading={reprocessingId === r.id}
            onClick={() => reprocess(r.id)}
          >
            {t("surveys.reprocess")}
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Label variant="title" className="block">
          {t("surveys.title")}
        </Label>
        <p className="mt-0.5 text-sm text-gray-500">
          {t("surveys.subtitle")}
        </p>
      </div>

      <Card>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Dropdown
            label={t("surveys.filter.survey")}
            options={surveyOptions}
            value={filters.surveyDefinitionId}
            onChange={(v) => set({ surveyDefinitionId: v })}
          />
          <Dropdown
            label={t("surveys.filter.site")}
            options={siteOptions}
            value={filters.siteId}
            onChange={(v) => set({ siteId: v })}
          />
          <Dropdown
            label={t("surveys.filter.localVisiting")}
            options={typeOptions}
            value={filters.type}
            onChange={(v) => set({ type: v })}
          />
          <Dropdown
            label={t("surveys.filter.prePost")}
            options={prePostOptions}
            value={filters.isPre}
            onChange={(v) => set({ isPre: v })}
          />
          <Dropdown
            label={t("surveys.filter.status")}
            options={statusOptions}
            value={filters.status}
            onChange={(v) => set({ status: v })}
          />
          <Dropdown
            label={t("surveys.filter.group")}
            options={groupOptions}
            value={filters.groupName}
            onChange={(v) => set({ groupName: v })}
          />
          <DatePicker
            label={t("surveys.filter.from")}
            value={filters.from}
            onChange={(v) => set({ from: v })}
          />
          <DatePicker
            label={t("surveys.filter.to")}
            value={filters.to}
            onChange={(v) => set({ to: v })}
          />
        </div>
        {Object.values(filters).some(Boolean) && (
          <button
            onClick={() => setFilters(EMPTY)}
            className="mt-3 text-sm font-medium text-primary hover:underline"
          >
            {t("surveys.filter.clear")}
          </button>
        )}
      </Card>

      {/* Resumen por grupo: pre/post, alumnos y respuestas en blanco. Un grupo
          solo puede completarse cuando existen ambas encuestas (pre y post). */}
      {summary.length > 0 && (
        <Card>
          <Label variant="subtitle" className="mb-1 block">
            {t("surveys.summary.title")}
          </Label>
          <p className="mb-4 text-sm text-gray-500">
            {t("surveys.summary.note")}
          </p>
          {completeError && <p className="mb-3 text-sm text-danger">{completeError}</p>}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500">
                  <th className="py-2 font-medium">{t("surveys.summary.groupSchool")}</th>
                  <th className="py-2 font-medium">{t("surveys.filter.pre")}</th>
                  <th className="py-2 font-medium">{t("surveys.filter.post")}</th>
                  <th className="py-2 font-medium">{t("surveys.summary.students")}</th>
                  <th className="py-2 font-medium">{t("surveys.summary.blanks")}</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {summary.map((g) => (
                  <tr key={g.groupName}>
                    <td className="py-2 text-gray-800">{g.groupName}</td>
                    <td className="py-2 text-gray-600">{g.preCount}</td>
                    <td className="py-2 text-gray-600">{g.postCount}</td>
                    <td className="py-2 text-gray-600">{g.students}</td>
                    <td className="py-2 text-gray-600">{g.blanks}</td>
                    <td className="py-2 text-right">
                      {g.completed ? (
                        <span className="text-xs font-medium text-primary">{t("surveys.summary.completed")}</span>
                      ) : (
                        <Button
                          size="sm"
                          disabled={!g.canComplete}
                          title={!g.canComplete ? t("surveys.summary.missingPrePost") : undefined}
                          loading={completingGroup === g.groupName}
                          onClick={() => completeGroup(g.groupName)}
                        >
                          {t("surveys.summary.complete")}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Table
        columns={columns}
        rows={rows}
        keyExtractor={(r) => r.id}
        loading={loading}
        emptyText={t("surveys.table.empty")}
        pageSize={25}
      />
    </div>
  );
}
