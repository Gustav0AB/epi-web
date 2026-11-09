import { useId, useState } from "react";
import { buildDonutSegments, donutArcPath, donutSegmentDescription, type DonutCategory, type DonutSegment } from "./hierarchical-donut";
export type HierarchicalProgressDonutProps = {
  title: string;
  value: number | null;
  categories: readonly DonutCategory[];
  size?: number;
  showLegend?: boolean;
  onSegmentClick?: (segment: DonutSegment) => void;
  className?: string;
};
const segmentKey = (segment: DonutSegment) => JSON.stringify([segment.type, segment.parentId, segment.id]);
const percentage = (value: number | null) => value === null ? "Sin datos" : `${value}%`;

export function HierarchicalProgressDonut({ title, value, categories, size = 360, showLegend = true, onSegmentClick, className = "" }: HierarchicalProgressDonutProps) {
  const id = useId();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  let segments: DonutSegment[];
  try {
    if (!Number.isFinite(size) || size <= 0) throw new Error("El tamaño debe ser un número positivo.");
    if (value !== null && (!Number.isFinite(value) || value < 0 || value > 100)) throw new Error("El índice general debe estar entre 0 y 100, o ser null.");
    segments = buildDonutSegments(categories);
  } catch(error) { return <div className={className} role="alert">{title}: {error instanceof Error ? error.message : "Datos del gráfico inválidos"}</div>; }
  const categorySegments = segments.filter(segment => segment.type === "category");
  const selected = segments.find(segment => segmentKey(segment) === selectedKey) ?? categorySegments[0];
  const highlighted = segments.find(segment => segmentKey(segment) === (hovered ?? focused)) ?? selected;
  const highlightedCategory = highlighted?.parentId ?? highlighted?.id;
  const category = categorySegments.find(segment => segment.id === (selected?.parentId ?? selected?.id));
  const children = category ? segments.filter(segment => segment.parentId === category.id) : [];
  const select = (segment: DonutSegment) => {
    setSelectedKey(segmentKey(segment));
    onSegmentClick?.(segment);
  };
  const keyboard = (event: React.KeyboardEvent, segment: DonutSegment) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(segment); }
  };
  return <figure className={`m-0 w-full ${className}`} aria-label={title}>
    <figcaption className="mb-3 text-sm font-semibold">{title}</figcaption>
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1fr)]">
      {showLegend && <nav aria-label="Categorías del índice" className="min-w-0">
        <h3 className="mb-2 text-sm font-semibold">Categorías</h3>
        <ul className="m-0 list-none space-y-2 p-0 text-sm">{categorySegments.map(segment => <li key={segmentKey(segment)}>
          <button type="button" aria-pressed={category?.id === segment.id} aria-controls={`${id}-detail`}
            className={`flex w-full items-start gap-2 rounded-lg border p-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 ${highlightedCategory === segment.id ? "border-gray-500 bg-gray-100" : "border-gray-200 bg-white"}`}
            onClick={() => select(segment)} onMouseEnter={() => setHovered(segmentKey(segment))} onMouseLeave={() => setHovered(null)}
            onFocus={() => { setFocused(segmentKey(segment)); setHovered(null); }} onBlur={() => setFocused(null)}>
            <span aria-hidden="true" className="mt-1 h-3 w-3 shrink-0 rounded-sm" style={{ background: segment.color }} />
            <span className="min-w-0 break-words"><span className="block font-medium">{segment.label}</span><span className="text-gray-600">{percentage(segment.value)}</span></span>
          </button>
        </li>)}</ul>
      </nav>}
      <div className={`min-w-0 ${showLegend ? "" : "lg:col-span-2"}`}>
        <svg viewBox="0 0 360 360" width="100%" style={{ maxWidth: size, display: "block", margin: "0 auto" }} role="group" aria-label={`${title}: ${percentage(value)}`} aria-describedby={`${id}-description`}>
          <desc id={`${id}-description`}>Anillo interior: categorías. Anillo exterior: subcategorías. Selecciona un segmento para consultar su detalle. El peso define el ángulo y el resultado colorea cada segmento de forma independiente.</desc>
          {segments.filter(segment => segment.endAngle > segment.startAngle).map(segment => {
            const inner = segment.type === "category" ? 52 : 112;
            const outer = segment.type === "category" ? 105 : 166;
            const track = donutArcPath(inner, outer, segment.startAngle, segment.endAngle);
            const inCategory = (segment.parentId ?? segment.id) === highlightedCategory;
            const exact = highlighted && segmentKey(highlighted) === segmentKey(segment);
            return <g key={segmentKey(segment)} role="button" tabIndex={0} aria-label={donutSegmentDescription(segment)} aria-pressed={selected === segment} aria-controls={`${id}-detail`}
              onMouseEnter={() => setHovered(segmentKey(segment))} onMouseLeave={() => setHovered(null)}
              onFocus={() => { setFocused(segmentKey(segment)); setHovered(null); }} onBlur={() => setFocused(null)}
              onKeyDown={event => keyboard(event, segment)} onClick={() => select(segment)}
              style={{ cursor: "pointer", opacity: highlighted && !inCategory ? 0.45 : 1, transition: "opacity 150ms" }}>
              <path d={track} fill={segment.color} fillOpacity={0.18} stroke="white" strokeWidth={1.5} aria-hidden="true" />
              {segment.progressEndAngle !== null && segment.progressEndAngle > segment.startAngle && <path d={donutArcPath(inner, outer, segment.startAngle, segment.progressEndAngle)} fill={segment.color} stroke="white" strokeWidth={1.5} aria-hidden="true" />}
              {inCategory && <path d={track} fill="none" stroke="#111827" strokeWidth={exact ? 2.5 : 1} pointerEvents="none" aria-hidden="true" />}
            </g>;
          })}
          <text x={180} y={180} dominantBaseline="middle" textAnchor="middle" fontSize={Math.min(28, 90 / percentage(value).length * 1.5)} fontWeight={600} fill="#111827" pointerEvents="none" aria-hidden="true">{value === null ? "—" : `${value}%`}</text>
        </svg>
        {!categories.length && <p role="status" className="text-center text-sm text-gray-500">No hay categorías disponibles.</p>}
      </div>
      <section id={`${id}-detail`} aria-label="Detalle de categoría" aria-live="polite" className="min-w-0 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm">
        {category ? <>
          <h3 className="break-words text-base font-semibold" style={{ color: category.color }}>{category.label}</h3>
          <dl className="my-3 grid grid-cols-2 gap-2"><dt>Resultado</dt><dd className="text-right font-semibold">{percentage(category.value)}</dd><dt>Peso del índice</dt><dd className="text-right">{category.weight}%</dd></dl>
          <h4 className="mb-2 font-semibold">Subcategorías</h4>
          {children.length ? <ul className="space-y-2">{children.map(child => <li key={segmentKey(child)} className={`rounded border p-2 ${selected === child ? "border-gray-500 bg-white" : "border-transparent"}`}>
            <span className="block break-words font-medium">{child.label}</span><dl className="mt-1 grid grid-cols-2 gap-1 text-gray-600"><dt>Resultado</dt><dd className="text-right">{percentage(child.value)}</dd><dt>Peso relativo</dt><dd className="text-right">{child.weight}%</dd></dl>
          </li>)}</ul> : <p className="text-gray-600">Sin subcategorías.</p>}
        </> : <p className="text-gray-600">Sin categorías para consultar.</p>}
      </section>
    </div>
  </figure>;
}
