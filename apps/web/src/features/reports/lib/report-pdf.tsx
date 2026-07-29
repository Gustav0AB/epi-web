import { Document, Image, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import type { ReportRow } from "@epi/shared";
import Logo from "../../../assets/epi-logo.png";
import type { ReportSection } from "../ReportsPage";
import { filterSectionRows } from "./section-rows";
import { downloadBlob } from "./chart-export";
import type { I18nKey } from "../../../lib/i18n";

const COLOR_PRE = "#2a78d6";
const COLOR_POST = "#eb6834";
const COLOR_NEG = "#e34948";
const INK = "#52514e";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, color: INK, fontFamily: "Helvetica" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #e5e2db" },
  logo: { width: 90, height: 34, objectFit: "contain" },
  headerRight: { alignItems: "flex-end" },
  docTitle: { fontSize: 15, fontWeight: 700, color: "#1f2937" },
  docDate: { fontSize: 8, color: "#9ca3af", marginTop: 3 },
  filtersRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 18 },
  filterItem: { fontSize: 9, color: "#4b5563" },
  filterLabel: { color: "#6b7280", fontWeight: 700 },
  section: { marginBottom: 14 },
  h1: { fontSize: 16, fontWeight: 700, color: "#1f2937", marginBottom: 4 },
  paragraph: { fontSize: 10, lineHeight: 1.5, color: "#4b5563" },
  card: { border: "1px solid #e5e2db", borderRadius: 4, padding: 12 },
  barRow: { marginBottom: 8 },
  barLabel: { fontSize: 9, color: "#374151", marginBottom: 3 },
  barTrack: { flexDirection: "row", alignItems: "center", marginBottom: 2 },
  barSeriesLabel: { width: 30, fontSize: 8, color: "#6b7280" },
  barBg: { flex: 1, height: 7, backgroundColor: "#f1efe9", borderRadius: 2 },
  barFill: { height: 7, borderRadius: 2 },
  barValue: { width: 32, fontSize: 8, textAlign: "right", color: "#374151" },
  table: { display: "flex", width: "auto" },
  tRow: { flexDirection: "row", borderBottom: "1px solid #eceae4" },
  tHeadRow: { flexDirection: "row", borderBottom: "1px solid #d1cfc7", paddingBottom: 4, marginBottom: 2 },
  tCellLabel: { flex: 2, fontSize: 9, padding: 4, color: "#374151" },
  tCell: { flex: 1, fontSize: 9, padding: 4, textAlign: "right", color: "#374151" },
  tHeadCellLabel: { flex: 2, fontSize: 8, fontWeight: 700, color: "#6b7280" },
  tHeadCell: { flex: 1, fontSize: 8, fontWeight: 700, textAlign: "right", color: "#6b7280" },
  footer: { position: "absolute", bottom: 20, left: 40, right: 40, fontSize: 8, color: "#9ca3af", textAlign: "center" },
});

const pct = (v: number | null) => (v === null ? "—" : `${v}%`);

type ReportPdfArgs = {
  title: string;
  appliedFilters: { label: string; value: string }[];
  sections: ReportSection[];
  rows: ReportRow[];
  t: (key: I18nKey) => string;
  locale?: string;
};

function BarSeries({ label, value, color, widthPct }: { label: string; value: string; color: string; widthPct: number }) {
  return (
    <View style={styles.barTrack}>
      <Text style={styles.barSeriesLabel}>{label}</Text>
      <View style={styles.barBg}>
        <View style={[styles.barFill, { width: `${widthPct}%`, backgroundColor: color }]} />
      </View>
      <Text style={styles.barValue}>{value}</Text>
    </View>
  );
}

// bar/radar comparten la misma visualización de barras horizontales pre/post
// en el PDF — la geometría polar real de "radar" queda para cuando haga
// falta; hoy la fuente de datos (categoría → pre/post %) es idéntica.
function BarOrRadarSection({ rows, showPre, showPost, t }: { rows: ReportRow[]; showPre: boolean; showPost: boolean; t: (k: I18nKey) => string }) {
  return (
    <View style={styles.card} wrap={false}>
      {rows.map((r) => (
        <View key={`${r.category}|${r.subcategory ?? ""}`} style={styles.barRow}>
          <Text style={styles.barLabel}>{r.subcategory ?? r.category}</Text>
          {showPre && <BarSeries label={t("reports.pre")} value={pct(r.pre)} color={COLOR_PRE} widthPct={r.pre ?? 0} />}
          {showPost && <BarSeries label={t("reports.post")} value={pct(r.post)} color={COLOR_POST} widthPct={r.post ?? 0} />}
        </View>
      ))}
    </View>
  );
}

function ChangeSection({ rows, t }: { rows: ReportRow[]; t: (k: I18nKey) => string }) {
  const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.change ?? 0)));
  return (
    <View style={styles.card} wrap={false}>
      {rows.map((r) => {
        const change = r.change ?? 0;
        const widthPct = Math.min(100, (Math.abs(change) / maxAbs) * 100);
        return (
          <View key={`${r.category}|${r.subcategory ?? ""}`} style={styles.barRow}>
            <Text style={styles.barLabel}>{r.subcategory ?? r.category}</Text>
            <BarSeries
              label={t("reports.change")}
              value={r.change === null ? "—" : `${change > 0 ? "+" : ""}${change}%`}
              color={change < 0 ? COLOR_NEG : COLOR_PRE}
              widthPct={widthPct}
            />
          </View>
        );
      })}
    </View>
  );
}

function TableSection({ rows, showPre, showPost, showChange, t }: { rows: ReportRow[]; showPre: boolean; showPost: boolean; showChange: boolean; t: (k: I18nKey) => string }) {
  return (
    <View style={styles.card} wrap={false}>
      <View style={styles.table}>
        <View style={styles.tHeadRow}>
          <Text style={styles.tHeadCellLabel}>{t("reports.category")}</Text>
          {showPre && <Text style={styles.tHeadCell}>{t("reports.pre")}</Text>}
          {showPost && <Text style={styles.tHeadCell}>{t("reports.post")}</Text>}
          {showChange && <Text style={styles.tHeadCell}>{t("reports.change")}</Text>}
        </View>
        {rows.map((r) => (
          <View key={`${r.category}|${r.subcategory ?? ""}`} style={styles.tRow}>
            <Text style={styles.tCellLabel}>{r.subcategory ?? r.category}</Text>
            {showPre && <Text style={styles.tCell}>{pct(r.pre)}</Text>}
            {showPost && <Text style={styles.tCell}>{pct(r.post)}</Text>}
            {showChange && <Text style={styles.tCell}>{r.change === null ? "—" : `${r.change > 0 ? "+" : ""}${r.change}%`}</Text>}
          </View>
        ))}
      </View>
    </View>
  );
}

function ReportDocument({ title, appliedFilters, sections, rows, t, locale = "es-MX" }: ReportPdfArgs) {
  return (
    <Document title={title}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image no acepta alt */}
          <Image src={Logo} style={styles.logo} />
          <View style={styles.headerRight}>
            <Text style={styles.docTitle}>{title}</Text>
            <Text style={styles.docDate}>
              {t("documentReport.generatedOn")} {new Date().toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" })}
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

        {sections.map((sec) => {
          const filteredRows = filterSectionRows(rows, sec.selectedCategories);
          const showChange = sec.showPre && sec.showPost;
          return (
            <View key={sec.id} style={styles.section}>
              {sec.type === "title" && <Text style={styles.h1}>{sec.content}</Text>}
              {sec.type === "text" && <Text style={styles.paragraph}>{sec.content}</Text>}
              {(sec.type === "bar" || sec.type === "radar") && (
                <BarOrRadarSection rows={filteredRows} showPre={sec.showPre} showPost={sec.showPost} t={t} />
              )}
              {sec.type === "change" && <ChangeSection rows={filteredRows} t={t} />}
              {sec.type === "table" && (
                <TableSection rows={filteredRows} showPre={sec.showPre} showPost={sec.showPost} showChange={showChange} t={t} />
              )}
            </View>
          );
        })}

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) => `Ecology Project International — ${pageNumber} / ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );
}

export async function downloadReportPdf(args: ReportPdfArgs): Promise<void> {
  const blob = await pdf(<ReportDocument {...args} />).toBlob();
  const dateSlug = new Date().toISOString().slice(0, 10);
  downloadBlob(blob, `reporte-epi-${dateSlug}.pdf`);
}
