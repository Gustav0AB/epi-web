import { Card, Table } from "../../../shared/components";
import type { Column } from "../../../shared/components";
import type { ReportBlock, ReportData, ReportTemplate } from "../templates/types";
import { ChartBlockView, ChartExportButtons } from "./ChartBlockView";
import { formatValue } from "../lib/format";
import { useI18n } from "../../../lib/i18n";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Legend, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from "recharts";

type ReportRendererProps = {
  template: ReportTemplate;
  data: ReportData;
  mode?: "interactive" | "document"; // document: oculta acciones interactivas (export, etc.)
};

const ReportMotionContext = createContext(true);

// Único punto que interpreta el objeto de configuración — tanto la vista
// interactiva como la vista de documento oficial pasan por aquí; solo cambia
// el `mode` (que hoy únicamente controla si se muestran botones de acción).
export function ReportRenderer({ template, data, mode = "interactive" }: ReportRendererProps) {
  const { lang, t } = useI18n();
  const locale = lang === "es" ? "es-MX" : "en-US";
  if (template.category === "course-impacts") {
    return <CourseImpactReportView template={template} data={data} mode={mode} noDataText={t("reportRenderer.noData")} />;
  }
  return (
    <div className="space-y-6">
      {template.blocks.map((block) => (
        <ReportReveal key={block.id} enabled={mode !== "document"}>
          <ReportBlockView block={block} data={data} showExport={mode === "interactive"} locale={locale} noDataText={t("reportRenderer.noData")} />
        </ReportReveal>
      ))}
    </div>
  );
}

export function ReportReveal({ children, className = "", enabled = true }: { children: React.ReactNode; className?: string; enabled?: boolean }) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || visible) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);

  return <ReportMotionContext.Provider value={enabled ? visible : true}><div ref={ref} className={`report-reveal ${!enabled || visible ? "is-visible" : ""} ${className}`}>{children}</div></ReportMotionContext.Provider>;
}

function AnimatedNumber({ value, format, locale = "es-MX" }: { value: number; format?: "number" | "percent" | "currency"; locale?: string }) {
  const [current, setCurrent] = useState(0);
  const active = useContext(ReportMotionContext);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const start = performance.now();
    const duration = 950;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - progress) ** 3;
      setCurrent(value * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, value]);
  return <span ref={ref}>{formatValue(Number(current.toFixed(value % 1 ? 1 : 0)), format, locale)}</span>;
}

const IMPACT_COLORS = ["#f28c00", "#4196b3", "#a8c67e", "#786a8a"];

function CourseImpactReportView({ template, data, mode, noDataText }: ReportRendererProps & { noDataText: string }) {
  const title = template.title.replace(/\s*-\s*Course Impacts?$/i, "");
  const subtitle = template.subtitle ?? "";
  const activity = template.blocks.find((block) => block.id === "course-activity-satisfaction");
  const categoryChart = template.blocks.find((block) => block.id === "environmental-literacy");
  const spotlightChart = template.blocks.find((block) => block.id === "spotlight-chart");
  const hero = data.texts.heroPhotoUrl;
  const coursePhoto = data.texts.coursePhotoUrl;
  const categoryRows = data.series.categoryComparison ?? [];
  const spotlightRows = data.series.spotlightRows ?? [];
  const satisfaction = Number(data.kpis.overallSatisfaction ?? 0);
  const improvement = Number(data.kpis.overallImprovement ?? 0);

  return (
    <div className="overflow-hidden bg-white text-[#242424]">
      <ReportReveal enabled={mode !== "document"}><section className="bg-[#70aec2] text-white">
        <div className="px-6 pb-5 pt-4 sm:px-10">
          <div className="text-[10px] font-semibold uppercase tracking-[0.28em] opacity-95">Ecology Project International</div>
          <h1 className="mt-4 text-center text-3xl font-light uppercase tracking-wide sm:text-5xl">{title}</h1>
          <div className="mx-auto mt-2 h-0.5 w-24 bg-white/70" />
        </div>
        {hero && <img src={hero} alt="" className="block h-52 w-full object-cover sm:h-72" />}
        <div className="bg-[#f28c00] px-4 py-2 text-center text-lg font-medium sm:text-2xl">{subtitle}</div>
      </section></ReportReveal>

      <ReportReveal enabled={mode !== "document"}><section className="grid gap-6 p-5 sm:grid-cols-2 sm:p-8">
        <div className="border-r-0 border-[#f28c00] sm:border-r sm:pr-6">
          <h2 className="text-center text-xl font-bold">Overall Satisfaction</h2>
          <div className="mt-4 flex justify-center">
            <div className="relative h-40 w-40 rounded-full" style={{ background: `conic-gradient(#4196b3 ${Math.max(0, Math.min(100, satisfaction))}%, #e8eef0 0)` }}>
              <div className="absolute inset-5 flex items-center justify-center rounded-full bg-white text-2xl font-semibold text-[#4196b3]"><AnimatedNumber value={satisfaction} format="percent" /></div>
            </div>
          </div>
          <p className="mt-5 min-h-28 whitespace-pre-wrap border-t border-dashed border-[#f28c00] pt-4 text-base leading-relaxed text-gray-700">{data.texts.studentQuote || noDataText}</p>
          <div className="mt-5 rounded-[50%] bg-[#4196b3] px-8 py-6 text-center text-white">
            <div className="text-5xl font-light"><AnimatedNumber value={satisfaction} format="percent" /></div>
            <div className="mt-1 text-xs font-semibold uppercase tracking-wide">{data.texts.recommendationText || "of participants indicated that they would recommend this course to other students."}</div>
          </div>
        </div>

        <div>
          {activity?.type === "chart" && <ChartBlockView block={activity} data={data.series[activity.dataKey] ?? []} showExport={mode === "interactive"} />}
          <div className="mt-5 border-t border-dashed border-[#f28c00] pt-4">
            <h2 className="text-xl font-bold">Conservation Impacts</h2>
            <p className="mt-3 whitespace-pre-wrap text-lg leading-relaxed text-[#f28c00]">{data.texts.conservationImpacts || noDataText}</p>
          </div>
        </div>
      </section></ReportReveal>

      <ReportReveal enabled={mode !== "document"}><section className="border-t-8 border-[#f28c00]">
        <div className="bg-[#4196b3] px-5 py-3 text-center text-3xl font-light text-white sm:text-4xl">Environmental Literacy</div>
        <div className="bg-[#f28c00] px-4 py-1 text-center text-sm text-white">{subtitle}</div>
        <div className="p-5 sm:p-8">
          <p className="text-center text-sm text-gray-600">EPI measures impacts on students in ecological knowledge, dispositions, competencies, and social-emotional skills.</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-4">
            {["Ecological knowledge is students' knowledge of physical and ecological systems.", "Dispositions are students' perspectives on their influence and willingness to participate.", "Competencies are clusters of skills and abilities practiced when analyzing problems.", "Social-emotional skills represent the ability to understand self, listen to peers, and work together."].map((copy, index) => (
              <div key={copy} className="border-2 p-3 text-xs leading-relaxed" style={{ borderColor: IMPACT_COLORS[index] }}>{copy}</div>
            ))}
          </div>
          <div className="mt-5 border-b border-gray-300 pb-4">
            {categoryChart?.type === "chart" && <ChartBlockView block={categoryChart} data={data.series[categoryChart.dataKey] ?? categoryRows} showExport={mode === "interactive"} />}
            <div className="ml-5 hidden w-32 text-center sm:block"><div className="text-4xl font-semibold text-[#4196b3]"><AnimatedNumber value={improvement} format="percent" /></div><div className="text-xs font-bold uppercase text-[#4196b3]">Overall improvement</div></div>
          </div>
          <div className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            <div>
              <h2 className="mb-3 text-xl font-bold">EPI Course Impacts</h2>
              <ExportableRadar data={spotlightRows} showExport={mode === "interactive"} />
            </div>
            <div>
              {coursePhoto && <img src={coursePhoto} alt="Course fieldwork" className="h-64 w-full object-cover" />}
              <h3 className="mt-2 text-center text-sm font-bold">Most Improved Area of Knowledge</h3>
              <div className="mt-2 flex justify-between border border-[#4196b3] px-3 py-2 text-sm"><span>{String(data.tables.mostImproved?.[0]?.name ?? "—")}</span><span>+{String(data.tables.mostImproved?.[0]?.change ?? "—")}%</span></div>
            </div>
          </div>
          <div className="mt-6 grid gap-6 border-t border-dashed border-[#f28c00] pt-5 lg:grid-cols-2">
            <div>{spotlightChart?.type === "chart" && <ChartBlockView block={spotlightChart} data={data.series[spotlightChart.dataKey] ?? []} showExport={mode === "interactive"} />}</div>
            <div><h2 className="text-center text-lg font-bold">{data.texts.spotlightText?.split("\n")[0] ?? "Impact Spotlight"}</h2><p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{data.texts.spotlightText?.split("\n").slice(1).join("\n") || noDataText}</p></div>
          </div>
        </div>
      </section></ReportReveal>
    </div>
  );
}

function ExportableRadar({ data, showExport }: { data: Record<string, unknown>[]; showExport: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        setInView(true);
        observer.disconnect();
      }
    }, { threshold: 0.15 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={containerRef}>
      {showExport && <div className="mb-2 flex justify-end"><ChartExportButtons containerRef={containerRef} filename="environmental-literacy-radar" /></div>}
      <div className="h-[330px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} outerRadius="68%">
            <PolarGrid />
            <PolarAngleAxis dataKey="name" tick={{ fontSize: 9 }} />
            <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 8 }} />
            <Radar name="Pre %" dataKey="pre" stroke="#f28c00" fill="#f28c00" fillOpacity={0.12} isAnimationActive={inView} animationBegin={150} animationDuration={900} />
            <Radar name="Post %" dataKey="post" stroke="#4196b3" fill="#4196b3" fillOpacity={0.12} isAnimationActive={inView} animationBegin={150} animationDuration={900} />
            <Legend />
            <Tooltip />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ReportBlockView({
  block,
  data,
  showExport,
  locale,
  noDataText,
}: {
  block: ReportBlock;
  data: ReportData;
  showExport: boolean;
  locale: string;
  noDataText: string;
}) {
  if (block.type === "text") {
    const content = block.dataKey ? (data.texts[block.dataKey] ?? "") : (block.content ?? "");
    return (
      <Card>
        {block.title && <h3 className="mb-1 text-sm font-semibold text-gray-800">{block.title}</h3>}
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-600">{content || noDataText}</p>
      </Card>
    );
  }

  if (block.type === "image") {
    const src = data.texts[block.dataKey]?.trim();
    const caption = block.captionKey ? data.texts[block.captionKey]?.trim() : "";
    return (
      <Card>
        {block.title && <h3 className="mb-3 text-sm font-semibold text-gray-800">{block.title}</h3>}
        {src ? (
          <img src={src} alt={block.title ?? ""} className="w-full rounded object-cover" style={{ height: block.height ?? 260 }} />
        ) : (
          <div className="flex items-center justify-center rounded border border-dashed border-gray-300 bg-gray-50 text-sm text-gray-400" style={{ height: block.height ?? 260 }}>
            {noDataText}
          </div>
        )}
        {caption && <p className="mt-2 text-xs text-gray-500">{caption}</p>}
      </Card>
    );
  }

  if (block.type === "kpi-group") {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {block.items.map((item) => (
          <Card key={item.key}>
            <p className="text-xs font-medium text-gray-500">{item.label}</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">
              {typeof data.kpis[item.key] === "number" ? <AnimatedNumber value={Number(data.kpis[item.key])} locale={locale} {...(item.format ? { format: item.format } : {})} /> : formatValue(data.kpis[item.key] ?? "—", item.format, locale)}
              {item.unit && <span className="ml-1 text-sm font-normal text-gray-400">{item.unit}</span>}
            </p>
          </Card>
        ))}
      </div>
    );
  }

  if (block.type === "chart") {
    const rows = data.series[block.dataKey] ?? [];
    return (
      <Card>
        <ChartBlockView block={block} data={rows} showExport={showExport} />
      </Card>
    );
  }

  // table
  const rows = data.tables[block.dataKey] ?? [];
  const columns: Column<Record<string, unknown>>[] = block.columns.map((col) => ({
    key: col.key,
    header: col.label,
    ...(col.align ? { align: col.align } : {}),
    render: (row) => {
      const value = row[col.key];
      if (value === undefined || value === null) return "—";
      return col.format === "percent" || col.format === "currency" || col.format === "number"
        ? formatValue(value as number, col.format, locale)
        : String(value);
    },
  }));

  return (
    <Card>
      {block.title && <h3 className="mb-3 text-sm font-semibold text-gray-800">{block.title}</h3>}
      <Table columns={columns} rows={rows} keyExtractor={(_, i) => String(i)} emptyText={noDataText} />
    </Card>
  );
}
