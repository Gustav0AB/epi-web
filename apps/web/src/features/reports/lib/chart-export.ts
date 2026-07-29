// Exporta el <svg> que Recharts ya renderiza — sin jsPDF/html2canvas: el DOM
// serializado a XML es suficiente para SVG, y Canvas nativo para PNG.

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function serializeSvg(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  if (!clone.getAttribute("width")) clone.setAttribute("width", String(svg.clientWidth));
  if (!clone.getAttribute("height")) clone.setAttribute("height", String(svg.clientHeight));
  return new XMLSerializer().serializeToString(clone);
}

// Busca el primer <svg> dentro de un contenedor (el chart de Recharts).
export function findChartSvg(container: HTMLElement): SVGSVGElement | null {
  return container.querySelector("svg");
}

export function exportChartAsSvg(container: HTMLElement, filename: string) {
  const svg = findChartSvg(container);
  if (!svg) return;
  const blob = new Blob([serializeSvg(svg)], { type: "image/svg+xml" });
  downloadBlob(blob, `${filename}.svg`);
}

export function exportChartAsPng(container: HTMLElement, filename: string, scale = 2) {
  const svg = findChartSvg(container);
  if (!svg) return;

  const svgString = serializeSvg(svg);
  const width = svg.clientWidth;
  const height = svg.clientHeight;

  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(scale, scale);
    ctx.fillStyle = "#ffffff"; // fondo blanco: los gráficos usan fondo transparente
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    canvas.toBlob((blob) => blob && downloadBlob(blob, `${filename}.png`), "image/png");
  };
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;
}
