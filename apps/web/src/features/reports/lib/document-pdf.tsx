import { Document, Image, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import Logo from "../../../assets/epi-logo.png";
import type { ReportData, ReportTemplate } from "../templates/types";
import { formatValue } from "./format";
import { downloadBlob } from "./chart-export";

const PIE_COLORS = ["#2a78d6", "#eb6834", "#3fa15e", "#e34948", "#8e6fd1", "#d6a92a"];
const INK = "#52514e";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, color: INK, fontFamily: "Helvetica" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #e5e2db" },
  logo: { width: 90, height: 34, objectFit: "contain" },
  headerRight: { alignItems: "flex-end" },
  docTitle: { fontSize: 15, fontWeight: 700, color: "#1f2937" },
  docSubtitle: { fontSize: 9, color: "#6b7280", marginTop: 2 },
  docDate: { fontSize: 8, color: "#9ca3af", marginTop: 3 },
  filtersRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 18 },
  filterItem: { fontSize: 9, color: "#4b5563" },
  filterLabel: { color: "#6b7280", fontWeight: 700 },
  section: { marginBottom: 14 },
  blockTitle: { fontSize: 11, fontWeight: 700, color: "#1f2937", marginBottom: 6 },
  paragraph: { fontSize: 10, lineHeight: 1.5, color: "#4b5563" },
  card: { border: "1px solid #e5e2db", borderRadius: 4, padding: 12 },
  kpiRow: { flexDirection: "row", gap: 10 },
  kpiBox: { flex: 1, border: "1px solid #e5e2db", borderRadius: 4, padding: 10 },
  kpiLabel: { fontSize: 8, color: "#6b7280" },
  kpiValue: { fontSize: 16, fontWeight: 700, color: "#1f2937", marginTop: 3 },
  barRow: { marginBottom: 8 },
  barLabel: { fontSize: 9, color: "#374151", marginBottom: 3 },
  barTrack: { flexDirection: "row", alignItems: "center", marginBottom: 2 },
  barSeriesLabel: { width: 40, fontSize: 8, color: "#6b7280" },
  barBg: { flex: 1, height: 7, backgroundColor: "#f1efe9", borderRadius: 2 },
  barFill: { height: 7, borderRadius: 2 },
  barValue: { width: 40, fontSize: 8, textAlign: "right", color: "#374151" },
  table: { display: "flex", width: "auto" },
  tRow: { flexDirection: "row", borderBottom: "1px solid #eceae4" },
  tHeadRow: { flexDirection: "row", borderBottom: "1px solid #d1cfc7", paddingBottom: 4, marginBottom: 2 },
  tCell: { flex: 1, fontSize: 9, padding: 4, color: "#374151" },
  tHeadCell: { flex: 1, fontSize: 8, fontWeight: 700, color: "#6b7280" },
  footer: { position: "absolute", bottom: 20, left: 40, right: 40, fontSize: 8, color: "#9ca3af", textAlign: "center" },
});

function alignStyle(align?: "left" | "right" | "center") {
  return align === "right" ? { textAlign: "right" as const } : align === "center" ? { textAlign: "center" as const } : {};
}

function KpiSection({ template, data }: { template: Extract<ReportTemplate["blocks"][number], { type: "kpi-group" }>; data: ReportData }) {
  return (
    <View style={styles.kpiRow} wrap={false}>
      {template.items.map((item) => (
        <View key={item.key} style={styles.kpiBox}>
          <Text style={styles.kpiLabel}>{item.label}</Text>
          <Text style={styles.kpiValue}>
            {formatValue(data.kpis[item.key] ?? "—", item.format)}
            {item.unit ? ` ${item.unit}` : ""}
          </Text>
        </View>
      ))}
    </View>
  );
}

// Gráficas de barra/línea se dibujan como barras horizontales vectoriales
// (una serie por fila); "pie" se aproxima como barras de % del total —
// geometría circular real queda pendiente si hace falta más adelante.
function ChartSection({ block, rows }: { block: Extract<ReportTemplate["blocks"][number], { type: "chart" }>; rows: Record<string, unknown>[] }) {
  if (block.chartType === "pie") {
    const seriesKey = block.series[0]?.key ?? "";
    const total = rows.reduce((acc, r) => acc + (Number(r[seriesKey]) || 0), 0) || 1;
    return (
      <View style={styles.card} wrap={false}>
        {rows.map((r, i) => {
          const value = Number(r[seriesKey]) || 0;
          const widthPct = Math.min(100, (value / total) * 100);
          return (
            <View key={String(r[block.xKey] ?? i)} style={styles.barRow}>
              <Text style={styles.barLabel}>{String(r[block.xKey] ?? "")}</Text>
              <View style={styles.barTrack}>
                <View style={styles.barBg}>
                  <View style={[styles.barFill, { width: `${widthPct}%`, backgroundColor: PIE_COLORS[i % PIE_COLORS.length] ?? "#2a78d6" }]} />
                </View>
                <Text style={styles.barValue}>{Math.round(widthPct)}%</Text>
              </View>
            </View>
          );
        })}
      </View>
    );
  }

  const values = rows.flatMap((r) => block.series.map((s) => Number(r[s.key]) || 0));
  const max = Math.max(1, ...values);
  return (
    <View style={styles.card} wrap={false}>
      {rows.map((r, i) => (
        <View key={String(r[block.xKey] ?? i)} style={styles.barRow}>
          <Text style={styles.barLabel}>{String(r[block.xKey] ?? "")}</Text>
          {block.series.map((s) => {
            const value = Number(r[s.key]) || 0;
            return (
              <View key={s.key} style={styles.barTrack}>
                <Text style={styles.barSeriesLabel}>{s.label}</Text>
                <View style={styles.barBg}>
                  <View style={[styles.barFill, { width: `${Math.min(100, (value / max) * 100)}%`, backgroundColor: s.color }]} />
                </View>
                <Text style={styles.barValue}>{value}</Text>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function TableSection({ block, rows }: { block: Extract<ReportTemplate["blocks"][number], { type: "table" }>; rows: Record<string, unknown>[] }) {
  return (
    <View style={styles.card} wrap={false}>
      <View style={styles.table}>
        <View style={styles.tHeadRow}>
          {block.columns.map((col) => (
            <Text key={col.key} style={[styles.tHeadCell, alignStyle(col.align)]}>{col.label}</Text>
          ))}
        </View>
        {rows.map((row, i) => (
          <View key={i} style={styles.tRow}>
            {block.columns.map((col) => {
              const value = row[col.key];
              const text =
                value === undefined || value === null
                  ? "—"
                  : col.format === "percent" || col.format === "currency" || col.format === "number"
                    ? formatValue(value as number, col.format)
                    : String(value);
              return (
                <Text key={col.key} style={[styles.tCell, alignStyle(col.align)]}>{text}</Text>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

type DocumentPdfArgs = {
  template: ReportTemplate;
  data: ReportData;
  appliedFilters: { label: string; value: string }[];
  generatedOnLabel: string;
  noDataText: string;
  locale?: string;
};

function InstitutionalDocument({ template, data, appliedFilters, generatedOnLabel, noDataText, locale = "es-MX" }: DocumentPdfArgs) {
  return (
    <Document title={template.title}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image no acepta alt */}
          <Image src={Logo} style={styles.logo} />
          <View style={styles.headerRight}>
            <Text style={styles.docTitle}>{template.title}</Text>
            {template.subtitle && <Text style={styles.docSubtitle}>{template.subtitle}</Text>}
            <Text style={styles.docDate}>
              {generatedOnLabel} {new Date().toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" })}
            </Text>
          </View>
        </View>

        {appliedFilters.length > 0 && (
          <View style={styles.filtersRow}>
            {appliedFilters.map((f) => (
              <Text key={f.label} style={styles.filterItem}>
                <Text style={styles.filterLabel}>{f.label}: </Text>
                {f.value}
              </Text>
            ))}
          </View>
        )}

        {template.blocks.map((block) => (
          <View key={block.id} style={styles.section}>
            {block.title && block.type !== "text" && <Text style={styles.blockTitle}>{block.title}</Text>}

            {block.type === "kpi-group" && <KpiSection template={block} data={data} />}
            {block.type === "chart" && <ChartSection block={block} rows={data.series[block.dataKey] ?? []} />}
            {block.type === "table" && <TableSection block={block} rows={data.tables[block.dataKey] ?? []} />}
            {block.type === "text" && (
              <>
                {block.title && <Text style={styles.blockTitle}>{block.title}</Text>}
                <Text style={styles.paragraph}>
                  {(block.dataKey ? data.texts[block.dataKey] : block.content) || noDataText}
                </Text>
              </>
            )}
          </View>
        ))}

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) => `Ecology Project International — ${pageNumber} / ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );
}

export async function downloadDocumentPdf(args: DocumentPdfArgs): Promise<void> {
  const blob = await pdf(<InstitutionalDocument {...args} />).toBlob();
  const dateSlug = new Date().toISOString().slice(0, 10);
  downloadBlob(blob, `${args.template.key}-${dateSlug}.pdf`);
}
