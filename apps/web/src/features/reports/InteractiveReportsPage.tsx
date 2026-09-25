import { useEffect, useState } from "react";
import ArticleOutlinedIcon from "@mui/icons-material/ArticleOutlined";
import { Button, Card, Dropdown, Label } from "../../shared/components";
import type { DropdownOption } from "../../shared/components";
import { getReportTemplate, missingRequiredReportFields } from "./templates";
import type { ReportData } from "./templates/types";
import { ReportRenderer } from "./components/ReportRenderer";
import { DocumentReportPage } from "./DocumentReportPage";
import { reportsApi, REPORT_STATUSES } from "./api";
import type { AssignedReport, ReportStatus } from "./api";
import { surveyApi } from "../surveys/api";
import { useI18n } from "../../lib/i18n";

export function InteractiveReportsPage() {
  const { t, lang } = useI18n();
  const locale = lang === "es" ? "es-MX" : "en-US";
  const STATUS_LABELS: Record<ReportStatus, string> = {
    pending: t("interactiveReports.status.pending"),
    in_review: t("interactiveReports.status.inReview"),
    published: t("interactiveReports.status.published"),
  };
  const STATUS_FILTER_OPTIONS: DropdownOption[] = [
    { label: t("surveys.filter.allStatuses"), value: "" },
    ...REPORT_STATUSES.map((s) => ({ label: STATUS_LABELS[s], value: s })),
  ];
  const [status, setStatus] = useState<string>("published");
  const [reports, setReports] = useState<AssignedReport[]>([]);
  const [loading, setLoading] = useState(false);

  const [selected, setSelected] = useState<AssignedReport | null>(null);
  const [data, setData] = useState<ReportData | null>(null);
  const [selectedError, setSelectedError] = useState<string | null>(null);
  const [documentView, setDocumentView] = useState(false);

  // Sitio (o "" = Global, todo el alcance del usuario asignado) — el propio
  // donante/decisor lo puede mover, acotado a lo que su organización y
  // exclusiones le permiten ver (mismo /api/reports/filters que usa /reports).
  const [siteId, setSiteId] = useState("");
  const [siteOptions, setSiteOptions] = useState<DropdownOption[]>([]);

  useEffect(() => {
    setLoading(true);
    void reportsApi
      .assigned(status ? (status as ReportStatus) : undefined)
      .then(setReports)
      .catch(() => setReports([]))
      .finally(() => setLoading(false));
  }, [status]);

  useEffect(() => {
    void surveyApi
      .reportFilters()
      .then((f) =>
        setSiteOptions([{ label: t("reports.allSites"), value: "" }, ...f.sites.map((s) => ({ label: s.name, value: s.id }))])
      )
      .catch(() => {});
  }, [t]);

  function openReport(report: AssignedReport) {
    setSelected(report);
    setDocumentView(false);
    setSiteId("");
    setData(null);
    if (report.status !== "published") {
      setSelectedError("Este reporte todavia no esta aprobado para visualizarse.");
      return;
    }
    setSelectedError(null);
    void reportsApi.data(report.id).then(setData).catch((e: unknown) => {
      setData(null);
      setSelectedError(e instanceof Error ? e.message : "No se pudo cargar el reporte.");
    });
  }

  function changeSite(nextSiteId: string) {
    setSiteId(nextSiteId);
    if (!selected) return;
    void reportsApi.data(selected.id, nextSiteId).then(setData).catch((e: unknown) => {
      setData(null);
      setSelectedError(e instanceof Error ? e.message : "No se pudo cargar el reporte.");
    });
  }

  const template = selected ? getReportTemplate(selected.templateKey) : undefined;
  const siteLabel = siteOptions.find((o) => o.value === siteId)?.label ?? t("reports.allSites");
  const missingFields = selected && template && data ? missingRequiredReportFields(template, data, selected.filters) : [];

  // Detalle de un reporte: interactivo o documento oficial.
  if (selected && template && (selectedError || missingFields.length > 0)) {
    return (
      <div className="space-y-4">
        <button onClick={() => setSelected(null)} className="text-sm font-medium text-primary hover:underline">
          {t("interactiveReports.backToAll")}
        </button>
        <Card>
          <p className="font-medium text-gray-900">{selected.title}</p>
          <p className="mt-2 text-sm text-gray-500">
            {selectedError ?? `Faltan datos para generar el reporte: ${missingFields.join(", ")}.`}
          </p>
        </Card>
      </div>
    );
  }

  if (selected && template && data) {
    const appliedFilters = [
      { label: t("reports.site"), value: siteLabel },
      { label: t("surveys.filter.status"), value: STATUS_LABELS[selected.status] },
      { label: t("interactiveReports.updatedLabel"), value: new Date(selected.updatedAt).toLocaleDateString(locale) },
    ];

    if (documentView) {
      return (
        <div className="space-y-4">
          <div className="print:hidden">
            <button onClick={() => setDocumentView(false)} className="text-sm font-medium text-primary hover:underline">
              {t("interactiveReports.backToInteractive")}
            </button>
          </div>
          <DocumentReportPage template={template} data={data} appliedFilters={appliedFilters} />
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <button onClick={() => setSelected(null)} className="text-sm font-medium text-primary hover:underline">
              {t("interactiveReports.backToAll")}
            </button>
            <Label variant="title" className="mt-1 block">{template.title}</Label>
          </div>
          <div className="flex items-center gap-3">
            {siteOptions.length > 0 && (
              <div className="w-48">
                <Dropdown label={t("reports.site")} options={siteOptions} value={siteId} onChange={changeSite} />
              </div>
            )}
            <Button variant="secondary" size="sm" onClick={() => setDocumentView(true)}>
              <ArticleOutlinedIcon style={{ fontSize: 16 }} className="mr-1.5" />
              {t("interactiveReports.viewDocument")}
            </Button>
          </div>
        </div>
        <ReportRenderer template={template} data={data} mode="interactive" />
      </div>
    );
  }

  // Listado de reportes asignados al usuario.
  return (
    <div className="space-y-6">
      <div>
        <Label variant="title" className="block">{t("interactiveReports.myReports")}</Label>
        <p className="mt-0.5 text-sm text-gray-500">{t("interactiveReports.subtitle")}</p>
      </div>

      <Card>
        <Dropdown label={t("surveys.filter.status")} options={STATUS_FILTER_OPTIONS} value={status} onChange={setStatus} />
      </Card>

      {loading && <p className="text-center text-sm text-gray-400">{t("interactiveReports.loading")}</p>}
      {!loading && reports.length === 0 && (
        <p className="text-center text-sm text-gray-400">{t("interactiveReports.noneAssigned")}</p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {reports.map((report) => (
          <button key={report.id} onClick={() => openReport(report)} className="text-left">
            <Card className="h-full transition-shadow hover:shadow-md">
              <p className="font-medium text-gray-900">{report.title}</p>
              <p className="mt-1 text-xs text-gray-500">
                {STATUS_LABELS[report.status]} · {new Date(report.updatedAt).toLocaleDateString(locale)}
              </p>
            </Card>
          </button>
        ))}
      </div>
    </div>
  );
}
