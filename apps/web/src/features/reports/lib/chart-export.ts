// Exporta el <svg> que Recharts ya renderiza — sin jsPDF/html2canvas: el DOM
// serializado a XML es suficiente para SVG, y Canvas nativo para PNG.

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function serializeSvg(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const typography = getComputedStyle(svg);
  clone.setAttribute("font-family", typography.fontFamily);
  clone.setAttribute("font-size", typography.fontSize);
  clone.setAttribute("font-weight", typography.fontWeight);
  if (svg.clientWidth > 0) clone.setAttribute("width", String(svg.clientWidth));
  if (svg.clientHeight > 0) clone.setAttribute("height", String(svg.clientHeight));
  return new XMLSerializer().serializeToString(clone);
}

// Recharts can render legend icons before the actual chart surface.
export function findChartSvg(container: HTMLElement): SVGSVGElement | null {
  return Array.from(container.querySelectorAll<SVGSVGElement>("svg")).find(svg => !svg.closest(".recharts-legend-wrapper")) ?? null;
}

export function exportChartAsSvg(container: HTMLElement, filename: string) {
  const svg = findChartSvg(container);
  if (!svg) return;
  const blob = new Blob([serializeSvg(svg)], { type: "image/svg+xml" });
  downloadBlob(blob, `${filename}.svg`);
}

export function exportChartAsPng(container: HTMLElement, filename: string, scale = 2, legend: { label: string; color: string }[] = []) {
  const svg = findChartSvg(container);
  if (!svg) return;

  const svgString = serializeSvg(svg);
  const width = svg.clientWidth;
  const height = svg.clientHeight;
  if (width <= 0 || height <= 0) return;

  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = (height + legend.length * 22) * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(scale, scale);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height + legend.length * 22);
    ctx.drawImage(img, 0, 0, width, height);
    const typography = getComputedStyle(svg);
    ctx.font = `${typography.fontWeight} ${typography.fontSize} ${typography.fontFamily}`;
    legend.forEach((item, index) => {
      const y = height + index * 22 + 4;
      ctx.fillStyle = item.color;
      ctx.fillRect(12, y, 12, 12);
      ctx.fillStyle = "#374151";
      ctx.fillText(item.label, 32, y + 11, Math.max(1, width - 44));
    });
    canvas.toBlob((blob) => blob && downloadBlob(blob, `${filename}.png`), "image/png");
  };
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;
}
