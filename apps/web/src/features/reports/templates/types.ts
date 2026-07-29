// Estructura modular de plantillas de reporte. Cada plantilla es un objeto
// plano (serializable a JSON) que describe filtros + bloques de contenido;
// el mismo objeto alimenta tanto la vista interactiva como el documento
// oficial — solo cambia quién lo renderiza (ver ReportRenderer).

export type FormatKind = "number" | "percent" | "currency";

export type KpiItem = {
  key: string; // referencia a ReportData.kpis[key]
  label: string;
  format?: FormatKind;
  unit?: string;
};

export type ChartSeries = {
  key: string; // campo numérico dentro de cada fila de la serie
  label: string;
  color: string;
};

export type ReportBlockBase = {
  id: string;
  title?: string;
  description?: string;
};

export type KpiBlock = ReportBlockBase & {
  type: "kpi-group";
  items: KpiItem[];
};

export type ChartBlock = ReportBlockBase & {
  type: "chart";
  chartType: "bar" | "line" | "pie";
  dataKey: string; // referencia a ReportData.series[dataKey]
  xKey: string; // campo usado como categoría/eje X (o nombre de sector en pie)
  series: ChartSeries[]; // uno o más campos numéricos a graficar
  height?: number;
};

export type TableColumn = {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
  format?: FormatKind | "date" | "text";
};

export type TableBlock = ReportBlockBase & {
  type: "table";
  dataKey: string; // referencia a ReportData.tables[dataKey]
  columns: TableColumn[];
};

export type TextBlock = ReportBlockBase & {
  type: "text";
  content?: string; // texto fijo de la plantilla (boilerplate)
  dataKey?: string; // si se define, el texto es "llenable": viene de ReportData.texts[dataKey],
  // capturado por el usuario operativo al armar el reporte (ver getFillableTextFields).
};

export type ReportBlock = KpiBlock | ChartBlock | TableBlock | TextBlock;

export type ReportFilterField = {
  key: string;
  label: string;
  kind: "select" | "date" | "date-range";
  optionsSourceKey?: string; // se resuelve en runtime contra el endpoint de opciones
};

export type ReportTemplate = {
  key: string; // id único, ej. "operational-financial"
  title: string;
  subtitle?: string;
  category: string; // libre: "operational" | "activities" | ...
  filters: ReportFilterField[];
  blocks: ReportBlock[];
};

// Datos resueltos para una plantilla dada: los bloques solo referencian
// claves de este objeto (kpis / series / tables / texts), nunca datos
// embebidos. `texts` son los campos de texto libre llenados por el
// operativo (AssignedReport.textContent).
export type ReportData = {
  kpis: Record<string, number | string>;
  series: Record<string, Record<string, unknown>[]>;
  tables: Record<string, Record<string, unknown>[]>;
  texts: Record<string, string>;
};

// Los bloques "text" con dataKey son los campos que el operativo debe
// llenar al armar/editar un reporte asignado de esta plantilla — se derivan
// de los bloques en vez de declararse aparte, para no mantener dos listas.
export function getFillableTextFields(template: ReportTemplate): { key: string; label: string }[] {
  return template.blocks
    .filter((b): b is TextBlock => b.type === "text" && !!b.dataKey)
    .map((b) => ({ key: b.dataKey!, label: b.title ?? b.dataKey! }));
}
