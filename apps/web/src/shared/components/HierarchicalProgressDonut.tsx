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
export function HierarchicalProgressDonut({ title, value, categories, size = 360, showLegend = true, onSegmentClick, className = "" }: HierarchicalProgressDonutProps) {
  const id = useId(); const [hovered,setHovered] = useState<string | null>(null); const [focused,setFocused] = useState<string | null>(null); const [dismissed,setDismissed] = useState(false);
  let segments: DonutSegment[];
  try {
    if (!Number.isFinite(size) || size <= 0) throw new Error("El tamaño debe ser un número positivo.");
    if (value !== null && (!Number.isFinite(value) || value < 0 || value > 100)) throw new Error("El índice general debe estar entre 0 y 100, o ser null.");
    segments = buildDonutSegments(categories);
  } catch(error) { return <div className={className} role="alert">{title}: {error instanceof Error ? error.message : "Datos del gráfico inválidos"}</div>; }
  const key = (segment: DonutSegment) => JSON.stringify([segment.type,segment.parentId,segment.id]);
  const active = segments.find(segment => key(segment) === (focused ?? hovered));
  const centerValue = value === null ? "Sin datos" : `${value}%`;
  const focus = (segment: DonutSegment) => { setFocused(key(segment)); setDismissed(false); };
  const hover = (segment: DonutSegment) => { setHovered(key(segment)); setDismissed(false); };
  const keyboard = (event: React.KeyboardEvent, segment: DonutSegment) => {
    if (event.key === "Escape") { setDismissed(true); return; }
    if (onSegmentClick && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onSegmentClick(segment); }
  };
  return <figure className={`m-0 ${className}`} style={{ width: size, maxWidth: "100%" }} onMouseLeave={() => setHovered(null)}>
    <svg viewBox="0 0 360 360" width="100%" role="group" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}>
      <title id={`${id}-title`}>{title}: {centerValue}</title><desc id={`${id}-description`}>Anillo interior: categorías. Anillo exterior: subcategorías. El peso define el ángulo y el resultado colorea cada segmento de forma independiente.</desc>
      {segments.filter(segment => segment.endAngle > segment.startAngle).map(segment => {
        const inner = segment.type === "category" ? 92 : 132; const outer = segment.type === "category" ? 122 : 162;
        const track = donutArcPath(inner,outer,segment.startAngle,segment.endAngle); const selected = active === segment;
        return <g key={key(segment)} role={onSegmentClick ? "button" : "img"} tabIndex={0} aria-label={donutSegmentDescription(segment)} aria-describedby={selected && !dismissed ? `${id}-tooltip` : undefined} onMouseEnter={() => hover(segment)} onFocus={() => focus(segment)} onBlur={() => setFocused(null)} onKeyDown={event => keyboard(event,segment)} onClick={onSegmentClick ? () => onSegmentClick(segment) : undefined} style={{ cursor: onSegmentClick ? "pointer" : "default" }}>
          <path d={track} fill={segment.color} fillOpacity={0.18} stroke="white" strokeWidth={1.5} aria-hidden="true" />
          {segment.progressEndAngle !== null && segment.progressEndAngle > segment.startAngle && <path d={donutArcPath(inner,outer,segment.startAngle,segment.progressEndAngle)} fill={segment.color} stroke="white" strokeWidth={1.5} aria-hidden="true" />}
          {selected && <path d={track} fill="none" stroke="#111827" strokeWidth={2} pointerEvents="none" aria-hidden="true" />}
        </g>;
      })}
      <foreignObject x={114} y={126} width={132} height={108} pointerEvents="none" aria-hidden="true"><div className="flex h-full flex-col items-center justify-center text-center text-gray-900"><div className="max-h-12 overflow-hidden break-words text-sm" title={title}>{title}</div><div className="mt-1 font-semibold" style={{ fontSize: Math.min(28,180/centerValue.length) }}>{centerValue}</div></div></foreignObject>
    </svg>
    {!categories.length && <p role="status" className="text-center text-sm text-gray-500">No hay categorías disponibles.</p>}
    {showLegend && <figcaption><ul className="m-0 list-none space-y-2 p-0 text-sm">{segments.map(segment => <li key={key(segment)} className={segment.parentId ? "ml-5" : ""}>
      {onSegmentClick ? <button type="button" className="flex w-full items-start gap-2 rounded text-left focus-visible:outline focus-visible:outline-2" onClick={() => onSegmentClick(segment)} onMouseEnter={() => hover(segment)} onFocus={() => focus(segment)} onBlur={() => setFocused(null)} onKeyDown={event => { if(event.key === "Escape") setDismissed(true); }} aria-describedby={active === segment && !dismissed ? `${id}-tooltip` : undefined}><LegendLabel segment={segment} /></button> : <div className="flex items-start gap-2"><LegendLabel segment={segment} /></div>}
    </li>)}</ul></figcaption>}
    {active && !dismissed && <div id={`${id}-tooltip`} role="tooltip" className="mt-3 rounded border bg-white p-3 text-sm text-gray-900">{donutSegmentDescription(active)}</div>}
  </figure>;
}
function LegendLabel({ segment }: { segment: DonutSegment }) {
  return <><span aria-hidden="true" className="mt-1 inline-block h-3 w-3 shrink-0 rounded-sm" style={{ background: segment.color }} /><span className="min-w-0 break-words">{segment.label} · Peso{segment.parentId ? " relativo" : ""}: {segment.weight}% · {segment.value === null ? "Sin datos" : `${segment.value}%`}</span></>;
}
