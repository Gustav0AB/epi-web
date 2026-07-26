import { useEffect, useMemo, useState } from "react";
import type { ReportRow, SurveyListItem } from "@epi/shared";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, Dropdown, Label, List } from "../shared/components";
import type { DropdownOption } from "../shared/components";
import { surveyApi } from "../features/surveys/api";
import { StatusBadge } from "../features/surveys/StatusBadge";
import { useI18n } from "../lib/i18n";

const COLOR_PRE = "#2a78d6";
const COLOR_POST = "#eb6834";
const COLOR_NEG = "#e34948";
const INK = "#52514e";

type Filters = { siteId: string; type: string; school: string; category: string; prePost: string };
type FilterOptions = {
  sites: { id: string; name: string }[];
  schools: string[];
  categories: { name: string; subcategory: string | null }[];
};
const EMPTY: Filters = { siteId: "", type: "", school: "", category: "", prePost: "" };

export function HomePage() {
  const { t } = useI18n();

  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [options, setOptions] = useState<FilterOptions>({ sites: [], schools: [], categories: [] });
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(true);
  const [recent, setRecent] = useState<SurveyListItem[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);

  useEffect(() => {
    void surveyApi.list("?limit=8").then(setRecent).catch(() => {}).finally(() => setLoadingRecent(false));
    void surveyApi.reportFilters().then(setOptions).catch(() => {});
  }, []);

  useEffect(() => {
    const p = new URLSearchParams();
    if (filters.siteId) p.set("siteId", filters.siteId);
    if (filters.type) p.set("type", filters.type);
    if (filters.school) p.set("school", filters.school);
    if (filters.category) p.set("category", filters.category);
    const q = p.toString();
    setLoadingRows(true);
    void surveyApi
      .reportResults(q ? `?${q}` : "")
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoadingRows(false));
  }, [filters.siteId, filters.type, filters.school, filters.category]);

  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));

  const title = filters.siteId
    ? (options.sites.find((s) => s.id === filters.siteId)?.name ?? t("reports.globalTitle"))
    : t("reports.globalTitle");

  const showPre = filters.prePost !== "post";
  const showPost = filters.prePost !== "pre";
  const showChange = showPre && showPost;

  const chartData = useMemo(
    () => rows.map((r) => ({ name: r.subcategory ?? r.category, pre: r.pre, post: r.post, change: r.change })),
    [rows]
  );

  const siteOptions: DropdownOption[] = [
    { label: t("reports.allSites"), value: "" },
    ...options.sites.map((s) => ({ label: s.name, value: s.id })),
  ];
  const typeOptions: DropdownOption[] = [
    { label: t("reports.all"), value: "" },
    { label: t("reports.local"), value: "LOCAL" },
    { label: t("reports.visiting"), value: "VISITING" },
  ];
  const schoolOptions: DropdownOption[] = [
    { label: t("reports.allSchools"), value: "" },
    ...options.schools.map((s) => ({ label: s, value: s })),
  ];
  const categoryOptions: DropdownOption[] = [
    { label: t("reports.allCategories"), value: "" },
    ...[...new Set(options.categories.map((c) => c.name))].map((c) => ({ label: c, value: c })),
  ];
  const prePostOptions: DropdownOption[] = [
    { label: t("reports.all"), value: "" },
    { label: t("reports.pre"), value: "pre" },
    { label: t("reports.post"), value: "post" },
  ];

  const pct = (v: number | null) => (v === null ? "—" : `${v}%`);

  return (
    <div className="space-y-6">
      <Label variant="title" className="block">{t("nav.home")}</Label>

      <div className="flex flex-col items-start gap-6 lg:flex-row">
        {/* Analytics */}
        <div className="min-w-0 flex-1 space-y-6">
          <Label variant="subtitle" className="block">{title}</Label>

          <Card>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <Dropdown label={t("reports.site")} options={siteOptions} value={filters.siteId} onChange={(v) => set({ siteId: v })} />
              <Dropdown label={t("reports.localVisiting")} options={typeOptions} value={filters.type} onChange={(v) => set({ type: v })} />
              <Dropdown label={t("reports.school")} options={schoolOptions} value={filters.school} onChange={(v) => set({ school: v })} />
              <Dropdown label={t("reports.category")} options={categoryOptions} value={filters.category} onChange={(v) => set({ category: v })} />
              <Dropdown label={t("reports.prePost")} options={prePostOptions} value={filters.prePost} onChange={(v) => set({ prePost: v })} />
            </div>
            {Object.values(filters).some(Boolean) && (
              <button onClick={() => setFilters(EMPTY)} className="mt-3 text-sm font-medium text-primary hover:underline">
                {t("surveys.filter.clear")}
              </button>
            )}
          </Card>

          <Card>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[28rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-500">
                    <th className="py-2 font-medium">{t("reports.category")}</th>
                    {showPre && <th className="py-2 text-right font-medium">{t("reports.pre")}</th>}
                    {showPost && <th className="py-2 text-right font-medium">{t("reports.post")}</th>}
                    {showChange && <th className="py-2 text-right font-medium">{t("reports.change")}</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((r) => (
                    <tr key={`${r.category}|${r.subcategory ?? ""}`}>
                      <td className="py-2 text-gray-800">
                        {r.subcategory ?? r.category}
                        {r.subcategory && <span className="ml-2 text-xs text-gray-400">{r.category}</span>}
                      </td>
                      {showPre && <td className="py-2 text-right tabular-nums text-gray-700">{pct(r.pre)}</td>}
                      {showPost && <td className="py-2 text-right tabular-nums text-gray-700">{pct(r.post)}</td>}
                      {showChange && (
                        <td
                          className="py-2 text-right font-medium tabular-nums"
                          style={{ color: r.change === null ? INK : r.change < 0 ? COLOR_NEG : COLOR_PRE }}
                        >
                          {r.change === null ? "—" : `${r.change > 0 ? "+" : ""}${r.change}%`}
                        </td>
                      )}
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-gray-400">
                        {loadingRows ? "…" : t("reports.empty")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {rows.length > 0 && (
            <>
              <Card>
                <Label variant="subtitle" className="mb-4 block">{t("reports.barsTitle")}</Label>
                <ResponsiveContainer width="100%" height={Math.max(220, chartData.length * 56)}>
                  <BarChart data={chartData} layout="vertical" margin={{ left: 16, right: 24 }}>
                    <CartesianGrid horizontal={false} stroke="#eceae4" />
                    <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fill: INK, fontSize: 12 }} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="name" width={160} tick={{ fill: INK, fontSize: 12 }} tickLine={false} axisLine={false} />
                    <Tooltip formatter={(v) => `${Number(v)}%`} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                    <Legend />
                    {showPre && <Bar dataKey="pre" name={t("reports.pre")} fill={COLOR_PRE} barSize={12} radius={[0, 4, 4, 0]} />}
                    {showPost && <Bar dataKey="post" name={t("reports.post")} fill={COLOR_POST} barSize={12} radius={[0, 4, 4, 0]} />}
                  </BarChart>
                </ResponsiveContainer>
              </Card>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <Card>
                  <Label variant="subtitle" className="mb-4 block">{t("reports.spiderTitle")}</Label>
                  <ResponsiveContainer width="100%" height={320}>
                    <RadarChart data={chartData} outerRadius="70%">
                      <PolarGrid stroke="#eceae4" />
                      <PolarAngleAxis dataKey="name" tick={{ fill: INK, fontSize: 11 }} />
                      <PolarRadiusAxis domain={[0, 100]} tick={{ fill: INK, fontSize: 10 }} axisLine={false} />
                      <Tooltip formatter={(v) => `${Number(v)}%`} />
                      <Legend />
                      {showPre && <Radar dataKey="pre" name={t("reports.pre")} stroke={COLOR_PRE} fill={COLOR_PRE} fillOpacity={0.15} strokeWidth={2} />}
                      {showPost && <Radar dataKey="post" name={t("reports.post")} stroke={COLOR_POST} fill={COLOR_POST} fillOpacity={0.15} strokeWidth={2} />}
                    </RadarChart>
                  </ResponsiveContainer>
                </Card>

                <Card>
                  <Label variant="subtitle" className="mb-4 block">{t("reports.columnsTitle")}</Label>
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={chartData} margin={{ right: 16 }}>
                      <CartesianGrid vertical={false} stroke="#eceae4" />
                      <XAxis dataKey="name" tick={{ fill: INK, fontSize: 11 }} tickLine={false} axisLine={false} interval={0} angle={-25} textAnchor="end" height={70} />
                      <YAxis unit="%" tick={{ fill: INK, fontSize: 12 }} tickLine={false} axisLine={false} />
                      <Tooltip formatter={(v) => `${Number(v) > 0 ? "+" : ""}${Number(v)}%`} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                      <ReferenceLine y={0} stroke={INK} />
                      <Bar dataKey="change" name={t("reports.change")} barSize={20} radius={[4, 4, 0, 0]}>
                        {chartData.map((d) => (
                          <Cell key={d.name} fill={(d.change ?? 0) < 0 ? COLOR_NEG : COLOR_PRE} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              </div>
            </>
          )}
        </div>

        {/* Quick views */}
        <div className="w-full shrink-0 lg:w-72">
          <Card padding="sm">
            <Label variant="subtitle" className="mb-3 block">{t("home.recentActivity")}</Label>
            <List
              items={recent}
              keyExtractor={(r) => r.id}
              emptyText={loadingRecent ? t("home.loading") : t("home.noSurveysYet")}
              divided
              renderItem={(r) => (
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-800">
                      {r.participant?.name ?? "—"}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-gray-400">
                      {r.participant?.groupName ?? "—"} · {new Date(r.receivedAt).toLocaleString()}
                    </p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
              )}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
