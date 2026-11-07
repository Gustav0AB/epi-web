export type DonutSubcategory = { id: string; label: string; weight: number; value: number | null };
export type DonutCategory = DonutSubcategory & { color: string; children: readonly DonutSubcategory[] };
export type DonutSegment = DonutSubcategory & { type: "category" | "subcategory"; color: string; parentId: string | null; parentLabel: string | null; startAngle: number; endAngle: number; progressEndAngle: number | null };
const tolerance = 1e-6;
function validateItems(items: readonly DonutSubcategory[]) {
  if (new Set(items.map(item => item.id)).size !== items.length) throw new Error("Los identificadores deben ser únicos dentro de cada grupo.");
  for (const item of items) {
    if (!item.id.trim() || !item.label.trim()) throw new Error("Cada segmento necesita identificador y nombre.");
    if (!Number.isFinite(item.weight) || item.weight < 0 || item.weight > 100) throw new Error("Los pesos deben estar entre 0 y 100.");
    if (item.value !== null && (!Number.isFinite(item.value) || item.value < 0 || item.value > 100)) throw new Error("Los resultados deben estar entre 0 y 100, o ser null si no hay datos.");
  }
  if (items.length && Math.abs(items.reduce((sum, item) => sum + item.weight, 0) - 100) > tolerance) throw new Error("Los pesos de cada grupo deben sumar 100%; no se normalizan automáticamente.");
}
export function buildDonutSegments(categories: readonly DonutCategory[]): DonutSegment[] {
  validateItems(categories);
  const segments: DonutSegment[] = []; let cursor = 0;
  for (const category of categories) {
    validateItems(category.children);
    if (!category.color.trim()) throw new Error("Cada categoría necesita un color.");
    const start = cursor; const span = category.weight * 3.6;
    const segment = (item: DonutSubcategory, type: DonutSegment["type"], startAngle: number, angle: number): DonutSegment => ({ id: item.id, label: item.label, weight: item.weight, value: item.value, type, color: category.color, parentId: type === "subcategory" ? category.id : null, parentLabel: type === "subcategory" ? category.label : null, startAngle, endAngle: startAngle + angle, progressEndAngle: item.value === null ? null : startAngle + angle * item.value / 100 });
    segments.push(segment(category, "category", start, span));
    let childCursor = start;
    for (const child of category.children) { const childSpan = span * child.weight / 100; segments.push(segment(child, "subcategory", childCursor, childSpan)); childCursor += childSpan; }
    cursor += span;
  }
  return segments;
}
// Angles start at twelve o'clock and increase clockwise; radii use the 360×360 viewBox.
export function donutArcPath(innerRadius: number, outerRadius: number, startAngle: number, endAngle: number): string {
  const span = endAngle - startAngle;
  if (![innerRadius, outerRadius, startAngle, endAngle].every(Number.isFinite) || innerRadius <= 0 || outerRadius <= innerRadius || span < 0 || span > 360 + tolerance) throw new Error("Geometría del anillo inválida.");
  if (span === 0) return "";
  const point = (radius: number, angle: number) => `${180 + radius * Math.sin(angle * Math.PI / 180)} ${180 - radius * Math.cos(angle * Math.PI / 180)}`;
  if (span >= 360 - 1e-9) return `M ${point(outerRadius,startAngle)} A ${outerRadius} ${outerRadius} 0 1 1 ${point(outerRadius,startAngle+180)} A ${outerRadius} ${outerRadius} 0 1 1 ${point(outerRadius,startAngle)} Z M ${point(innerRadius,startAngle)} A ${innerRadius} ${innerRadius} 0 1 0 ${point(innerRadius,startAngle+180)} A ${innerRadius} ${innerRadius} 0 1 0 ${point(innerRadius,startAngle)} Z`;
  const large = span > 180 ? 1 : 0;
  return `M ${point(outerRadius,startAngle)} A ${outerRadius} ${outerRadius} 0 ${large} 1 ${point(outerRadius,endAngle)} L ${point(innerRadius,endAngle)} A ${innerRadius} ${innerRadius} 0 ${large} 0 ${point(innerRadius,startAngle)} Z`;
}
export function donutSegmentDescription(segment: DonutSegment): string {
  return `${segment.type === "category" ? "Categoría" : "Subcategoría"}: ${segment.label}${segment.parentLabel ? `. Categoría padre: ${segment.parentLabel}` : ""}. Peso${segment.parentId ? " dentro de su categoría" : ""}: ${segment.weight}%. Resultado: ${segment.value === null ? "Sin datos" : `${segment.value}%`}.`;
}
