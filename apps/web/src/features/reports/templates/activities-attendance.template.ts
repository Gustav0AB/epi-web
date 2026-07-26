import type { ReportTemplate } from "./types";

// Ejemplo 2: Reporte de Actividades / Asistencia — tabla de asistencia + pastel por estado.
export const activitiesAttendanceTemplate: ReportTemplate = {
  key: "activities-attendance",
  title: "Reporte de Actividades / Asistencia",
  subtitle: "Asistencia por grupo y distribución de estados de participación",
  category: "activities",
  filters: [
    { key: "school", label: "Escuela", kind: "select", optionsSourceKey: "schools" },
    { key: "from", label: "Desde", kind: "date" },
    { key: "to", label: "Hasta", kind: "date" },
  ],
  blocks: [
    {
      id: "attendance-by-status",
      type: "chart",
      title: "Distribución por estado de asistencia",
      chartType: "pie",
      dataKey: "byStatus",
      xKey: "status",
      series: [{ key: "count", label: "Participantes", color: "#2a78d6" }],
      height: 280,
    },
    {
      id: "attendance-table",
      type: "table",
      title: "Detalle por grupo",
      dataKey: "byGroup",
      columns: [
        { key: "groupName", label: "Grupo", align: "left", format: "text" },
        { key: "school", label: "Escuela", align: "left", format: "text" },
        { key: "present", label: "Presentes", align: "right", format: "number" },
        { key: "absent", label: "Ausentes", align: "right", format: "number" },
        { key: "attendanceRate", label: "% Asistencia", align: "right", format: "percent" },
      ],
    },
  ],
};
