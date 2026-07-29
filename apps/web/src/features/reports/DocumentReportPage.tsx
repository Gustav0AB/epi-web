import { useState } from "react";
import DownloadIcon from "@mui/icons-material/Download";
import { Button } from "../../shared/components";
import type { ReportData, ReportTemplate } from "./templates/types";
import { ReportRenderer } from "./components/ReportRenderer";
import { ReportPrintHeader } from "./components/ReportPrintHeader";
import { useI18n } from "../../lib/i18n";

type AppliedFilter = { label: string; value: string };

type DocumentReportPageProps = {
  template: ReportTemplate;
  data: ReportData;
  appliedFilters: AppliedFilter[];
};

// Vista "documento oficial": mismo ReportRenderer que la vista interactiva,
// en modo "document". La descarga es un PDF real generado con
// @react-pdf/renderer (lib/document-pdf.tsx) — no window.print(): el donante
// se lleva un documento con el formato institucional, no una captura de la
// pantalla.
export function DocumentReportPage({ template, data, appliedFilters }: DocumentReportPageProps) {
  const { t } = useI18n();
  const [generating, setGenerating] = useState(false);

  async function handleDownloadPdf() {
    setGenerating(true);
    try {
      const { downloadDocumentPdf } = await import("./lib/document-pdf");
      await downloadDocumentPdf({
        template,
        data,
        appliedFilters,
        generatedOnLabel: t("documentReport.generatedOn"),
        noDataText: t("reportRenderer.noData"),
      });
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="print:hidden mb-4 flex justify-end">
        <Button variant="secondary" size="sm" onClick={() => void handleDownloadPdf()} disabled={generating}>
          <DownloadIcon style={{ fontSize: 16 }} className="mr-1.5" />
          {generating ? t("documentReport.generatingPdf") : t("documentReport.downloadPdf")}
        </Button>
      </div>

      <div id="report-document" className="rounded-lg border border-gray-200 bg-white p-10 print:border-0 print:p-0">
        <ReportPrintHeader title={template.title} subtitle={template.subtitle} appliedFilters={appliedFilters} />
        <ReportRenderer template={template} data={data} mode="document" />
      </div>
    </div>
  );
}
