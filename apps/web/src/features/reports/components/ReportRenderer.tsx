import { Card, Table } from "../../../shared/components";
import type { Column } from "../../../shared/components";
import type { ReportBlock, ReportData, ReportTemplate } from "../templates/types";
import { ChartBlockView } from "./ChartBlockView";
import { formatValue } from "../lib/format";
import { useI18n } from "../../../lib/i18n";

type ReportRendererProps = {
  template: ReportTemplate;
  data: ReportData;
  mode?: "interactive" | "document"; // document: oculta acciones interactivas (export, etc.)
};

// Único punto que interpreta el objeto de configuración — tanto la vista
// interactiva como la vista de documento oficial pasan por aquí; solo cambia
// el `mode` (que hoy únicamente controla si se muestran botones de acción).
export function ReportRenderer({ template, data, mode = "interactive" }: ReportRendererProps) {
  const { lang, t } = useI18n();
  const locale = lang === "es" ? "es-MX" : "en-US";
  return (
    <div className="space-y-6">
      {template.blocks.map((block) => (
        <ReportBlockView key={block.id} block={block} data={data} showExport={mode === "interactive"} locale={locale} noDataText={t("reportRenderer.noData")} />
      ))}
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

  if (block.type === "kpi-group") {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {block.items.map((item) => (
          <Card key={item.key}>
            <p className="text-xs font-medium text-gray-500">{item.label}</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">
              {formatValue(data.kpis[item.key] ?? "—", item.format, locale)}
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
