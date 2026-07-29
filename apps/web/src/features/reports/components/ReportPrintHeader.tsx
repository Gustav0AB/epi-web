import Logo from "../../../assets/epi-logo.png";
import { useI18n } from "../../../lib/i18n";

type AppliedFilter = { label: string; value: string };

type ReportPrintHeaderProps = {
  title: string;
  subtitle?: string | undefined;
  appliedFilters: AppliedFilter[];
};

// Membrete compartido entre DocumentReportPage y la exportación a PDF del
// constructor de reportes (ReportsPage) — mismo layout, mismas reglas de
// impresión (@media print en index.css apunta a #report-document).
export function ReportPrintHeader({ title, subtitle, appliedFilters }: ReportPrintHeaderProps) {
  const { t, lang } = useI18n();
  const locale = lang === "es" ? "es-MX" : "en-US";
  return (
    <>
      <header className="mb-8 flex flex-col items-start justify-between gap-4 border-b border-gray-200 pb-6 sm:flex-row sm:items-center">
        <img src={Logo} alt="Ecology Project International" className="h-12 w-auto" />
        <div className="text-left sm:text-right">
          <h1 className="text-xl font-bold text-gray-900">{title}</h1>
          {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
          <p className="mt-1 text-xs text-gray-400">
            {t("documentReport.generatedOn")} {new Date().toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
      </header>

      {appliedFilters.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-600">
          {appliedFilters.map((f) => (
            <span key={f.label}>
              <span className="font-medium text-gray-500">{f.label}:</span> {f.value}
            </span>
          ))}
        </div>
      )}
    </>
  );
}
