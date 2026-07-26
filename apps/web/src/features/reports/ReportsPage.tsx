import { useEffect, useMemo, useState } from "react";
import type { ReportRow } from "@epi/shared";
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
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import DeleteOutlineIcon from "@mui/icons-material/Delete";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import { Button, Card, DatePicker, Dropdown, Label } from "../../shared/components";
import type { DropdownOption } from "../../shared/components";
import { surveyApi } from "../surveys/api";
import { useI18n, type I18nKey } from "../../lib/i18n";

const COLOR_PRE = "#2a78d6";
const COLOR_POST = "#eb6834";
const COLOR_NEG = "#e34948";
const INK = "#52514e";

// ─── Section types ───────────────────────────────────────────────────────────

type SectionType = "title" | "text" | "bar" | "radar" | "change" | "table";

type ReportSection = {
  id: string;
  type: SectionType;
  content: string;             // title / text sections
  showPre: boolean;
  showPost: boolean;
  selectedCategories: string[]; // empty = all
  configOpen: boolean;
};

const SECTION_LABEL_KEYS: Record<SectionType, I18nKey> = {
  title: "reportBuilder.section.title",
  text: "reportBuilder.section.text",
  bar: "reportBuilder.section.bar",
  radar: "reportBuilder.section.radar",
  change: "reports.change",
  table: "reportBuilder.section.table",
};

function makeSection(type: SectionType, t: (key: I18nKey) => string): ReportSection {
  return {
    id: crypto.randomUUID(),
    type,
    content: type === "title" ? t("reportBuilder.defaultTitleContent") : type === "text" ? t("reportBuilder.defaultTextContent") : "",
    showPre: true,
    showPost: true,
    selectedCategories: [],
    configOpen: false,
  };
}

// ─── Filters ─────────────────────────────────────────────────────────────────

type Filters = { siteId: string; type: string; school: string; category: string; from: string; to: string };
type FilterOptions = {
  sites: { id: string; name: string }[];
  schools: string[];
  categories: { name: string; subcategory: string | null }[];
};
const EMPTY: Filters = { siteId: "", type: "", school: "", category: "", from: "", to: "" };

// ─── Section card ─────────────────────────────────────────────────────────────

type SectionCardProps = {
  section: ReportSection;
  rows: ReportRow[];
  allCategories: string[];
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  onToggleConfig: () => void;
  onUpdate: (patch: Partial<ReportSection>) => void;
};

function SectionCard({
  section,
  rows,
  allCategories,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onDelete,
  onToggleConfig,
  onUpdate,
}: SectionCardProps) {
  const { t } = useI18n();
  const isContent = section.type !== "title" && section.type !== "text";

  const filteredRows =
    section.selectedCategories.length === 0
      ? rows
      : rows.filter((r) => section.selectedCategories.includes(r.category));

  const chartData = filteredRows.map((r) => ({
    name: r.subcategory ?? r.category,
    pre: r.pre,
    post: r.post,
    change: r.change,
  }));

  const showChange = section.showPre && section.showPost;
  const pct = (v: number | null) => (v === null ? "—" : `${v}%`);

  function toggleCategory(cat: string) {
    const cats = section.selectedCategories;
    if (cats.length === 0) {
      // all shown → uncheck this one
      onUpdate({ selectedCategories: allCategories.filter((c) => c !== cat) });
    } else {
      const next = cats.includes(cat) ? cats.filter((c) => c !== cat) : [...cats, cat];
      // if all selected again, normalize back to empty (= all)
      onUpdate({ selectedCategories: next.length >= allCategories.length ? [] : next });
    }
  }

  return (
    <Card>
      {/* Header row */}
      <div className="mb-4 flex items-center gap-2">
        <span className="shrink-0 rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
          {t(SECTION_LABEL_KEYS[section.type])}
        </span>

        {/* Inline text edit for title / text sections */}
        {!isContent && (
          <input
            value={section.content}
            onChange={(e) => onUpdate({ content: e.target.value })}
            className="flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm text-gray-700 transition-colors hover:border-gray-200 focus:border-gray-300 focus:outline-none"
            placeholder={section.type === "title" ? t("reportBuilder.titlePlaceholder") : t("reportBuilder.textPlaceholder")}
          />
        )}

        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          {isContent && (
            <button
              onClick={onToggleConfig}
              title={t("reportBuilder.configure")}
              className={[
                "rounded p-1 transition-colors hover:bg-gray-100",
                section.configOpen ? "text-primary" : "text-gray-400",
              ].join(" ")}
            >
              <TuneOutlinedIcon style={{ fontSize: 17 }} />
            </button>
          )}
          <button
            onClick={onMoveUp}
            disabled={isFirst}
            title={t("reportBuilder.moveUp")}
            className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 disabled:opacity-30"
          >
            <KeyboardArrowUpIcon style={{ fontSize: 17 }} />
          </button>
          <button
            onClick={onMoveDown}
            disabled={isLast}
            title={t("reportBuilder.moveDown")}
            className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 disabled:opacity-30"
          >
            <KeyboardArrowDownIcon style={{ fontSize: 17 }} />
          </button>
          <button
            onClick={onDelete}
            title={t("reportBuilder.delete")}
            className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-danger"
          >
            <DeleteOutlineIcon style={{ fontSize: 17 }} />
          </button>
        </div>
      </div>

      {/* Config panel */}
      {isContent && section.configOpen && (
        <div className="mb-4 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
          {/* Pre / Post toggles (not on "change" sections — always pre→post diff) */}
          {section.type !== "change" && (
            <div className="flex flex-wrap gap-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={section.showPre}
                  onChange={(e) => onUpdate({ showPre: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 accent-primary"
                />
                {t("reportBuilder.showPre")}
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={section.showPost}
                  onChange={(e) => onUpdate({ showPost: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 accent-primary"
                />
                {t("reportBuilder.showPost")}
              </label>
            </div>
          )}

          {/* Category filter */}
          {allCategories.length > 0 && (
            <div>
              <div className="mb-1.5 flex items-center gap-2">
                <p className="text-xs font-medium text-gray-500">
                  {t("reportBuilder.categories")}
                  {section.selectedCategories.length > 0 && (
                    <span className="ml-1 text-gray-400">({section.selectedCategories.length} {t("table.of")} {allCategories.length})</span>
                  )}
                </p>
                {section.selectedCategories.length > 0 && (
                  <button
                    onClick={() => onUpdate({ selectedCategories: [] })}
                    className="text-xs text-primary hover:underline"
                  >
                    {t("reportBuilder.showAll")}
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {allCategories.map((cat) => (
                  <label
                    key={cat}
                    className="flex cursor-pointer items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={section.selectedCategories.length === 0 || section.selectedCategories.includes(cat)}
                      onChange={() => toggleCategory(cat)}
                      className="h-3 w-3 rounded border-gray-300 accent-primary"
                    />
                    {cat}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Section content */}
      {section.type === "title" && (
        <h2 className="text-2xl font-bold text-gray-900">{section.content || t("reportBuilder.section.title")}</h2>
      )}

      {section.type === "text" && (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-600">{section.content || t("reportBuilder.textPlaceholder")}</p>
      )}

      {section.type === "bar" && (
        <ResponsiveContainer width="100%" height={Math.max(220, chartData.length * 56)}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 16, right: 24 }}>
            <CartesianGrid horizontal={false} stroke="#eceae4" />
            <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fill: INK, fontSize: 12 }} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="name" width={160} tick={{ fill: INK, fontSize: 12 }} tickLine={false} axisLine={false} />
            <Tooltip formatter={(v) => `${Number(v)}%`} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
            <Legend />
            {section.showPre && <Bar dataKey="pre" name={t("reports.pre")} fill={COLOR_PRE} barSize={12} radius={[0, 4, 4, 0]} />}
            {section.showPost && <Bar dataKey="post" name={t("reports.post")} fill={COLOR_POST} barSize={12} radius={[0, 4, 4, 0]} />}
          </BarChart>
        </ResponsiveContainer>
      )}

      {section.type === "radar" && (
        <ResponsiveContainer width="100%" height={320}>
          <RadarChart data={chartData} outerRadius="70%">
            <PolarGrid stroke="#eceae4" />
            <PolarAngleAxis dataKey="name" tick={{ fill: INK, fontSize: 11 }} />
            <PolarRadiusAxis domain={[0, 100]} tick={{ fill: INK, fontSize: 10 }} axisLine={false} />
            <Tooltip formatter={(v) => `${Number(v)}%`} />
            <Legend />
            {section.showPre && <Radar dataKey="pre" name={t("reports.pre")} stroke={COLOR_PRE} fill={COLOR_PRE} fillOpacity={0.15} strokeWidth={2} />}
            {section.showPost && <Radar dataKey="post" name={t("reports.post")} stroke={COLOR_POST} fill={COLOR_POST} fillOpacity={0.15} strokeWidth={2} />}
          </RadarChart>
        </ResponsiveContainer>
      )}

      {section.type === "change" && (
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
      )}

      {section.type === "table" && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th className="py-2 font-medium">{t("reports.category")}</th>
                {section.showPre && <th className="py-2 text-right font-medium">{t("reports.pre")}</th>}
                {section.showPost && <th className="py-2 text-right font-medium">{t("reports.post")}</th>}
                {showChange && <th className="py-2 text-right font-medium">{t("reports.change")}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-gray-400">{t("reports.empty")}</td>
                </tr>
              ) : (
                filteredRows.map((r) => (
                  <tr key={`${r.category}|${r.subcategory ?? ""}`}>
                    <td className="py-2 text-gray-800">
                      {r.subcategory ?? r.category}
                      {r.subcategory && <span className="ml-2 text-xs text-gray-400">{r.category}</span>}
                    </td>
                    {section.showPre && <td className="py-2 text-right tabular-nums text-gray-700">{pct(r.pre)}</td>}
                    {section.showPost && <td className="py-2 text-right tabular-nums text-gray-700">{pct(r.post)}</td>}
                    {showChange && (
                      <td
                        className="py-2 text-right font-medium tabular-nums"
                        style={{ color: r.change === null ? INK : r.change < 0 ? COLOR_NEG : COLOR_PRE }}
                      >
                        {r.change === null ? "—" : `${r.change > 0 ? "+" : ""}${r.change}%`}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function ReportsPage() {
  const { t } = useI18n();
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [options, setOptions] = useState<FilterOptions>({ sites: [], schools: [], categories: [] });
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [sections, setSections] = useState<ReportSection[]>([]);

  useEffect(() => {
    void surveyApi.reportFilters().then(setOptions).catch(() => {});
  }, []);

  useEffect(() => {
    if (!Object.values(filters).some(Boolean)) { setRows([]); return; }
    const p = new URLSearchParams();
    if (filters.siteId) p.set("siteId", filters.siteId);
    if (filters.type) p.set("type", filters.type);
    if (filters.school) p.set("school", filters.school);
    if (filters.category) p.set("category", filters.category);
    if (filters.from) p.set("from", filters.from);
    if (filters.to) p.set("to", `${filters.to}T23:59:59`);
    setLoading(true);
    void surveyApi
      .reportResults(`?${p.toString()}`)
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [filters.siteId, filters.type, filters.school, filters.category, filters.from, filters.to]);

  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));

  const allCategories = useMemo(
    () => [...new Set(rows.map((r) => r.category))],
    [rows]
  );

  function addSection(type: SectionType) {
    setSections((s) => [...s, makeSection(type, t)]);
  }

  function removeSection(id: string) {
    setSections((s) => s.filter((sec) => sec.id !== id));
  }

  function moveSection(id: string, dir: -1 | 1) {
    setSections((s) => {
      const idx = s.findIndex((sec) => sec.id === id);
      const next = idx + dir;
      if (idx === -1 || next < 0 || next >= s.length) return s;
      const arr = [...s];
      [arr[idx], arr[next]] = [arr[next]!, arr[idx]!];
      return arr;
    });
  }

  function updateSection(id: string, patch: Partial<ReportSection>) {
    setSections((s) => s.map((sec) => (sec.id === id ? { ...sec, ...patch } : sec)));
  }

  const siteOptions: DropdownOption[] = [
    { label: t("reports.allSites"), value: "" },
    ...options.sites.map((s) => ({ label: s.name, value: s.id })),
  ];
  const typeOptions: DropdownOption[] = [
    { label: t("surveys.filter.localAndVisiting"), value: "" },
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

  return (
    <div className="space-y-6">
      <div>
        <Label variant="title" className="block">{t("nav.reports")}</Label>
        <p className="mt-0.5 text-sm text-gray-500">
          {t("reportBuilder.subtitle")}
        </p>
      </div>

      {/* Search / filter card */}
      <Card>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Dropdown label={t("reports.site")} options={siteOptions} value={filters.siteId} onChange={(v) => set({ siteId: v })} />
          <Dropdown label={t("surveys.filter.localVisiting")} options={typeOptions} value={filters.type} onChange={(v) => set({ type: v })} />
          <Dropdown label={t("reports.school")} options={schoolOptions} value={filters.school} onChange={(v) => set({ school: v })} />
          <Dropdown label={t("reports.category")} options={categoryOptions} value={filters.category} onChange={(v) => set({ category: v })} />
          <DatePicker label={t("surveys.filter.from")} value={filters.from} onChange={(v) => set({ from: v })} />
          <DatePicker label={t("surveys.filter.to")} value={filters.to} onChange={(v) => set({ to: v })} />
        </div>
        {Object.values(filters).some(Boolean) && (
          <button onClick={() => { setFilters(EMPTY); setSections([]); }} className="mt-3 text-sm font-medium text-primary hover:underline">
            {t("surveys.filter.clear")}
          </button>
        )}
      </Card>

      {/* Empty / loading state */}
      {loading && <p className="text-center text-sm text-gray-400">{t("reportBuilder.loadingData")}</p>}
      {!loading && rows.length === 0 && Object.values(filters).some(Boolean) && (
        <p className="text-center text-sm text-gray-400">{t("reports.empty")}</p>
      )}

      {/* Builder — shown once data is loaded */}
      {rows.length > 0 && (
        <>
          {/* Add section toolbar */}
          <div>
            <p className="mb-2 text-sm font-medium text-gray-500">{t("reportBuilder.addSection")}</p>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(SECTION_LABEL_KEYS) as SectionType[]).map((type) => (
                <Button key={type} variant="ghost" size="sm" onClick={() => addSection(type)}>
                  + {t(SECTION_LABEL_KEYS[type])}
                </Button>
              ))}
            </div>
          </div>

          {sections.length === 0 && (
            <p className="py-8 text-center text-sm text-gray-400">
              {t("reportBuilder.emptySections")}
            </p>
          )}

          {sections.map((sec, idx) => (
            <SectionCard
              key={sec.id}
              section={sec}
              rows={rows}
              allCategories={allCategories}
              isFirst={idx === 0}
              isLast={idx === sections.length - 1}
              onMoveUp={() => moveSection(sec.id, -1)}
              onMoveDown={() => moveSection(sec.id, 1)}
              onDelete={() => removeSection(sec.id)}
              onToggleConfig={() => updateSection(sec.id, { configOpen: !sec.configOpen })}
              onUpdate={(patch) => updateSection(sec.id, patch)}
            />
          ))}
        </>
      )}
    </div>
  );
}
