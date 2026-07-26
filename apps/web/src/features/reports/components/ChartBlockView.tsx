import { useRef } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import DownloadIcon from "@mui/icons-material/Download";
import type { ChartBlock } from "../templates/types";
import { exportChartAsPng, exportChartAsSvg } from "../lib/chart-export";
import { useI18n } from "../../../lib/i18n";

const PIE_COLORS = ["#2a78d6", "#eb6834", "#3fa15e", "#e34948", "#8e6fd1", "#d6a92a"];
const INK = "#52514e";

type ChartBlockViewProps = {
  block: ChartBlock;
  data: Record<string, unknown>[];
  showExport?: boolean;
};

export function ChartBlockView({ block, data, showExport = true }: ChartBlockViewProps) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const filename = block.id;

  return (
    <div>
      {(block.title || showExport) && (
        <div className="mb-3 flex items-center justify-between">
          {block.title && <h3 className="text-sm font-semibold text-gray-800">{block.title}</h3>}
          {showExport && (
            <div className="print:hidden flex gap-1">
              <button
                onClick={() => containerRef.current && exportChartAsPng(containerRef.current, filename)}
                title={t("chart.downloadPng")}
                className="flex items-center gap-1 rounded p-1 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <DownloadIcon style={{ fontSize: 15 }} /> PNG
              </button>
              <button
                onClick={() => containerRef.current && exportChartAsSvg(containerRef.current, filename)}
                title={t("chart.downloadSvg")}
                className="flex items-center gap-1 rounded p-1 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <DownloadIcon style={{ fontSize: 15 }} /> SVG
              </button>
            </div>
          )}
        </div>
      )}
      {block.description && <p className="mb-2 text-xs text-gray-500">{block.description}</p>}

      <div ref={containerRef}>
        <ResponsiveContainer width="100%" height={block.height ?? 300}>
          {block.chartType === "bar" ? (
            <BarChart data={data} margin={{ right: 16 }}>
              <CartesianGrid vertical={false} stroke="#eceae4" />
              <XAxis dataKey={block.xKey} tick={{ fill: INK, fontSize: 12 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: INK, fontSize: 12 }} tickLine={false} axisLine={false} />
              <Tooltip cursor={{ fill: "rgba(0,0,0,0.04)" }} />
              <Legend />
              {block.series.map((s) => (
                <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[4, 4, 0, 0]} />
              ))}
            </BarChart>
          ) : block.chartType === "line" ? (
            <LineChart data={data} margin={{ right: 16 }}>
              <CartesianGrid vertical={false} stroke="#eceae4" />
              <XAxis dataKey={block.xKey} tick={{ fill: INK, fontSize: 12 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: INK, fontSize: 12 }} tickLine={false} axisLine={false} />
              <Tooltip />
              <Legend />
              {block.series.map((s) => (
                <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={{ r: 3 }} />
              ))}
            </LineChart>
          ) : (
            <PieChart>
              <Tooltip />
              <Legend />
              <Pie data={data} dataKey={block.series[0]?.key ?? ""} nameKey={block.xKey} outerRadius="75%" label>
                {data.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length] ?? "#2a78d6"} />
                ))}
              </Pie>
            </PieChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
