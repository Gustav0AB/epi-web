import type { ReportTemplate } from "./types";

// Plantilla de prueba conectada a data real (ver report-data-resolvers.ts
// en el backend) — mientras se definen los N diseños institucionales
// finales junto con EPI, esta sirve para validar el flujo completo:
// filtro de sitio/global → resolver de datos reales → campos de texto
// llenados por el operativo → PDF formal.
export const seasonalSiteReportTemplate: ReportTemplate = {
  key: "seasonal-site-report",
  title: "Reporte de Temporada",
  subtitle: "Resultados de encuestas pre / post por sitio",
  category: "seasonal",
  filters: [{ key: "siteId", label: "Sitio", kind: "select", optionsSourceKey: "sites" }],
  blocks: [
    {
      id: "kpis",
      type: "kpi-group",
      items: [
        { key: "courses", label: "Cursos", format: "number" },
        { key: "participants", label: "Participantes", format: "number" },
        { key: "completedSurveys", label: "Encuestas completadas", format: "number" },
      ],
    },
    {
      id: "category-chart",
      type: "chart",
      title: "Comparativo pre vs. post por categoría",
      chartType: "bar",
      dataKey: "categoryComparison",
      xKey: "name",
      series: [
        { key: "pre", label: "Pre", color: "#2a78d6" },
        { key: "post", label: "Post", color: "#eb6834" },
      ],
      height: 320,
    },
    { id: "achievements", type: "text", title: "Logros de la temporada", dataKey: "achievements" },
    { id: "challenges", type: "text", title: "Retos de la temporada", dataKey: "challenges" },
    {
      id: "category-table",
      type: "table",
      title: "Detalle por categoría",
      dataKey: "categoryBreakdown",
      columns: [
        { key: "name", label: "Categoría", align: "left", format: "text" },
        { key: "pre", label: "Pre", align: "right", format: "percent" },
        { key: "post", label: "Post", align: "right", format: "percent" },
        { key: "change", label: "Cambio", align: "right", format: "percent" },
      ],
    },
  ],
};
