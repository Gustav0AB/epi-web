import type { ReportTemplate } from "./types";

// Ejemplo 1: Reporte Operativo / Financiero — KPIs + barras de ingresos/gastos por mes.
export const operationalFinancialTemplate: ReportTemplate = {
  key: "operational-financial",
  title: "Reporte Operativo / Financiero",
  subtitle: "Resumen de ingresos, gastos y actividad por sitio",
  category: "operational",
  filters: [
    { key: "siteId", label: "Sitio", kind: "select", optionsSourceKey: "sites" },
    { key: "from", label: "Desde", kind: "date" },
    { key: "to", label: "Hasta", kind: "date" },
  ],
  blocks: [
    {
      id: "kpis",
      type: "kpi-group",
      items: [
        { key: "totalIncome", label: "Ingresos totales", format: "currency" },
        { key: "totalExpenses", label: "Gastos totales", format: "currency" },
        { key: "margin", label: "Margen", format: "percent" },
        { key: "completedSurveys", label: "Encuestas completadas", format: "number" },
      ],
    },
    {
      id: "income-vs-expenses",
      type: "chart",
      title: "Ingresos vs. gastos por mes",
      chartType: "bar",
      dataKey: "monthly",
      xKey: "month",
      series: [
        { key: "income", label: "Ingresos", color: "#2a78d6" },
        { key: "expenses", label: "Gastos", color: "#eb6834" },
      ],
      height: 320,
    },
  ],
};
