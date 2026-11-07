import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { HierarchicalProgressDonut } from "../shared/components/HierarchicalProgressDonut";
import { buildDonutSegments, donutArcPath, donutSegmentDescription, type DonutCategory } from "../shared/components/hierarchical-donut";
const categories: DonutCategory[] = [{ id: "knowledge", label: "Conocimiento", weight: 40, value: 20, color: "#2b6579", children: [{ id: "bio", label: "Biodiversidad", weight: 50, value: 80 },{ id: "conservation", label: "Conservación", weight: 50, value: 0 }] },{ id: "skills", label: "Habilidades", weight: 60, value: 100, color: "#ef8200", children: [{ id: "observation", label: "Observación", weight: 100, value: 100 }] }];
describe("HierarchicalProgressDonut (standalone)", () => {
 it("uses category weights for angles and relative weights for children", () => {
  const segments = buildDonutSegments(categories); expect(segments[0]!.startAngle).toBe(0); expect(segments[0]!.endAngle).toBe(144); expect(segments[1]!.endAngle).toBe(72); expect(segments[2]!.startAngle).toBe(72); expect(segments[2]!.endAngle).toBe(144); expect(segments[3]!.startAngle).toBe(144); expect(segments[3]!.endAngle).toBe(360);
 });
 it("does not clip child progress to its parent's result", () => {
  const [parent,child] = buildDonutSegments(categories); expect(parent!.progressEndAngle).toBeCloseTo(28.8); expect(child!.progressEndAngle).toBeCloseTo(57.6); expect(child!.color).toBe(parent!.color); expect(child!.parentLabel).toBe("Conocimiento");
 });
 it("keeps every child inside the angular interval of its own category", () => {
  const segments = buildDonutSegments(categories); for(const child of segments.filter(s => s.parentId)) { const parent = segments.find(s => s.id === child.parentId && s.type === "category")!; expect(child.startAngle).toBeGreaterThanOrEqual(parent.startAngle); expect(child.endAngle).toBeLessThanOrEqual(parent.endAngle); }
 });
 it("handles zero, full progress, missing data and a full-circle sector", () => {
  const full = [{ ...categories[0]!, weight: 100, value: 100, children: [] }]; const segment = buildDonutSegments(full)[0]!; expect(segment.progressEndAngle).toBe(360); expect(donutArcPath(92,122,0,360).match(/ A /g)).toHaveLength(4); expect(donutArcPath(92,122,0,0)).toBe("");
  expect(buildDonutSegments([{ ...full[0]!, value: null }])[0]!.progressEndAngle).toBeNull(); expect(buildDonutSegments(categories)[2]!.progressEndAngle).toBe(72);
 });
 it("does not normalize incorrect or nonfinite weights or results", () => {
  for(const patch of [{ weight: 39 },{ weight: NaN },{ weight: -1 },{ value: 101 },{ value: Infinity },{ id: "skills" },{ label: "" }]) expect(() => buildDonutSegments([{ ...categories[0]!, ...patch },categories[1]!])).toThrow();
  expect(() => buildDonutSegments([{ ...categories[0]!, children: [{ ...categories[0]!.children[0]!, weight: 99 }] },categories[1]!])).toThrow(/sumar 100/);
 });
 it("allows normal floating-point sums, zero-weight nodes and categories without children", () => {
  const data = [33.333333333333336,33.333333333333336,33.33333333333333,0].map((weight,i) => ({ id: String(i), label: String(i), weight, value: 0, color: "#123456", children: [] })); expect(buildDonutSegments(data)[data.length-1]!.endAngle).toBeCloseTo(360);
 });
 it("renders the supplied general index exactly, never a recomputed average", () => {
  const html = renderToStaticMarkup(<HierarchicalProgressDonut title="Índice general" value={73.123456} categories={categories} />); expect(html).toContain("73.123456%"); expect(html).toContain('viewBox="0 0 360 360"'); expect(html).not.toContain("NaN");
 });
 it("provides keyboard focus and names, hierarchy, weights and values for assistive technology", () => {
  const html = renderToStaticMarkup(<HierarchicalProgressDonut title="EPI" value={0} categories={categories} onSegmentClick={() => {}} />); expect(html).toContain('role="button"'); expect(html).toContain('tabindex="0"'); expect(html).toContain("Categoría padre: Conocimiento"); expect(html).toContain("Peso dentro de su categoría: 50%"); expect(donutSegmentDescription(buildDonutSegments(categories)[1]!)).toContain("Resultado: 80%");
 });
 it("rejects invalid inputs visibly without drawing a misleading chart", () => {
  for(const props of [{ value: -1 },{ value: NaN },{ size: 0 },{ categories: [{ ...categories[0]!, weight: 99 }] }]) { const html = renderToStaticMarkup(<HierarchicalProgressDonut title="EPI" value={50} categories={categories} {...props} />); expect(html).toContain('role="alert"'); expect(html).not.toContain("<svg"); }
 });
 it("supports no data, an optional legend and independent instances", () => {
  expect(renderToStaticMarkup(<HierarchicalProgressDonut title="EPI" value={null} categories={[]} />)).toContain("No hay categorías");
  expect(renderToStaticMarkup(<HierarchicalProgressDonut title="EPI" value={null} categories={categories} showLegend={false} />)).not.toContain("<figcaption");
  const html = renderToStaticMarkup(<><HierarchicalProgressDonut title="Uno" value={0} categories={categories} /><HierarchicalProgressDonut title="Dos" value={100} categories={categories} /></>); const ids = [...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]); expect(new Set(ids).size).toBe(ids.length);
 });
 it("rejects invalid arc geometry instead of generating NaN paths", () => {
  for(const args of [[0,1,0,10],[10,5,0,10],[10,20,20,10],[10,20,0,400],[10,20,NaN,10]]) expect(() => donutArcPath(...args as [number,number,number,number])).toThrow();
 });
});
