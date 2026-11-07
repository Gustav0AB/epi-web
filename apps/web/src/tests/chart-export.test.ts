import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportChartAsPng } from "../features/reports/lib/chart-export";

const context = { scale: vi.fn(), drawImage: vi.fn(), fillRect: vi.fn(), fillText: vi.fn(), font: "", fillStyle: "" };
const canvas = {
  width: 0, height: 0,
  getContext: vi.fn(() => context),
  toBlob: vi.fn((callback: BlobCallback, type: string) => callback(new Blob(["image"], { type }))),
};
const anchor = { href: "", download: "", click: vi.fn(), remove: vi.fn() };
const clone = { setAttribute: vi.fn(), getAttribute: vi.fn(() => null) };
const svg = { clientWidth: 400, clientHeight: 300, cloneNode: vi.fn(() => clone) };
const container = { querySelector: vi.fn(() => svg) } as unknown as HTMLElement;
let imageSource = "";

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  svg.clientWidth = 400; svg.clientHeight = 300;
  canvas.width = 0; canvas.height = 0;
  imageSource = "";
  vi.stubGlobal("document", {
    createElement: (tag: string) => tag === "canvas" ? canvas : anchor,
    body: { appendChild: vi.fn() },
  });
  vi.stubGlobal("XMLSerializer", class { serializeToString() { return '<svg xmlns="http://www.w3.org/2000/svg"></svg>'; } });
  vi.stubGlobal("Image", class {
    onload: (() => void) | null = null;
    set src(value: string) { imageSource = value; this.onload?.(); }
  });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:chart-export");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});
afterEach(() => {
  vi.runAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("chart PNG download", () => {
  it("downloads a 2x PNG with chart-specific filename and series legend", () => {
    exportChartAsPng(container, "curso-barras", 2, [{ label: "Pre", color: "#ef8200" }, { label: "Post", color: "#4297b5" }]);
    expect(imageSource).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(688);
    expect(context.scale).toHaveBeenCalledWith(2, 2);
    expect(context.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 400, 300);
    expect(context.fillText).toHaveBeenCalledWith("Pre", 32, 315, 356);
    expect(context.fillText).toHaveBeenCalledWith("Post", 32, 337, 356);
    expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), "image/png");
    expect(anchor.download).toBe("curso-barras.png");
    expect(anchor.click).toHaveBeenCalledOnce();
    vi.runAllTimers();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:chart-export");
  });
  it("preserves existing PNG callers without a legend", () => {
    exportChartAsPng(container, "legacy");
    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(600);
    expect(context.fillText).not.toHaveBeenCalled();
    expect(anchor.download).toBe("legacy.png");
  });
  it("does not create an empty download before the chart has dimensions", () => {
    svg.clientWidth = 0;
    exportChartAsPng(container, "not-ready");
    expect(anchor.click).not.toHaveBeenCalled();
  });
});
