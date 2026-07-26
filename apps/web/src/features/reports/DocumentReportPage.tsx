import PrintIcon from "@mui/icons-material/Print";
import Logo from "../../assets/epi-logo.png";
import { Button } from "../../shared/components";
import type { ReportData, ReportTemplate } from "./templates/types";
import { ReportRenderer } from "./components/ReportRenderer";
import { useI18n } from "../../lib/i18n";

type AppliedFilter = { label: string; value: string };

type DocumentReportPageProps = {
  template: ReportTemplate;
  data: ReportData;
  appliedFilters: AppliedFilter[];
};

// Vista "documento oficial": mismo ReportRenderer que la vista interactiva,
// en modo "document" (sin botones de exportar chart individuales — para
// imprimir el reporte completo se usa window.print()). El layout está
// pensado para @media print: apps/web/src/index.css define las reglas.
export function DocumentReportPage({ template, data, appliedFilters }: DocumentReportPageProps) {
  const { t, lang } = useI18n();
  const locale = lang === "es" ? "es-MX" : "en-US";
  return (
    <div className="mx-auto max-w-3xl">
      <div className="print:hidden mb-4 flex justify-end">
        <Button variant="secondary" size="sm" onClick={() => window.print()}>
          <PrintIcon style={{ fontSize: 16 }} className="mr-1.5" />
          {t("documentReport.printSave")}
        </Button>
      </div>

      <div id="report-document" className="rounded-lg border border-gray-200 bg-white p-10 print:border-0 print:p-0">
        {/* Membrete */}
        <header className="mb-8 flex flex-col items-start justify-between gap-4 border-b border-gray-200 pb-6 sm:flex-row sm:items-center">
          <img src={Logo} alt="Ecology Project International" className="h-12 w-auto" />
          <div className="text-left sm:text-right">
            <h1 className="text-xl font-bold text-gray-900">{template.title}</h1>
            {template.subtitle && <p className="text-sm text-gray-500">{template.subtitle}</p>}
            <p className="mt-1 text-xs text-gray-400">
              {t("documentReport.generatedOn")} {new Date().toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" })}
            </p>
          </div>
        </header>

        {/* Filtros aplicados */}
        {appliedFilters.length > 0 && (
          <div className="mb-6 flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-600">
            {appliedFilters.map((f) => (
              <span key={f.label}>
                <span className="font-medium text-gray-500">{f.label}:</span> {f.value}
              </span>
            ))}
          </div>
        )}

        <ReportRenderer template={template} data={data} mode="document" />
      </div>
    </div>
  );
}
