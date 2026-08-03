import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drawPeakLine, drawPeakPath, setupHiDPICanvas } from "./canvas-utils";

function makeCtx() {
  return {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    lineJoin: "",
    lineCap: "",
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    setTransform: vi.fn(),
    imageSmoothingEnabled: false,
    imageSmoothingQuality: "",
  } as unknown as CanvasRenderingContext2D;
}

describe("drawPeakPath", () => {
  it("traces the top edge forward and the bottom edge backward, then closes and fills", () => {
    const ctx = makeCtx();
    // width=2: peaks = [min0, max0, min1, max1]
    const peaks = new Float32Array([-0.5, 0.5, -0.25, 0.25]);
    drawPeakPath(ctx, peaks, 2, 10);

    expect(ctx.beginPath).toHaveBeenCalledTimes(1);
    expect(ctx.moveTo).toHaveBeenCalledWith(0, 10 - 0.5 * 10);
    // Forward pass over max values (x=0..width-1)
    expect(ctx.lineTo).toHaveBeenNthCalledWith(1, 0, 10 - 0.5 * 10);
    expect(ctx.lineTo).toHaveBeenNthCalledWith(2, 1, 10 - 0.25 * 10);
    // Backward pass over min values (x=width-1..0)
    expect(ctx.lineTo).toHaveBeenNthCalledWith(3, 1, 10 - -0.25 * 10);
    expect(ctx.lineTo).toHaveBeenNthCalledWith(4, 0, 10 - -0.5 * 10);
    expect(ctx.closePath).toHaveBeenCalledTimes(1);
    expect(ctx.fill).toHaveBeenCalledTimes(1);
  });

  it("handles zero width without drawing any line segments", () => {
    const ctx = makeCtx();
    const peaks = new Float32Array([0, 0]);
    drawPeakPath(ctx, peaks, 0, 10);
    expect(ctx.lineTo).not.toHaveBeenCalled();
    expect(ctx.fill).toHaveBeenCalledTimes(1);
  });
});

describe("drawPeakLine", () => {
  it("strokes a single polyline through the max values, starting from x=0", () => {
    const ctx = makeCtx();
    const peaks = new Float32Array([-0.5, 0.5, -0.25, 0.25, -0.125, 0.125]);
    drawPeakLine(ctx, peaks, 3, 10);

    expect(ctx.lineWidth).toBe(0.8);
    expect(ctx.lineJoin).toBe("round");
    expect(ctx.lineCap).toBe("round");
    expect(ctx.moveTo).toHaveBeenCalledWith(0, 10 - 0.5 * 10);
    expect(ctx.lineTo).toHaveBeenNthCalledWith(1, 1, 10 - 0.25 * 10);
    expect(ctx.lineTo).toHaveBeenNthCalledWith(2, 2, 10 - 0.125 * 10);
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
  });
});

describe("setupHiDPICanvas", () => {
  let canvas: HTMLCanvasElement;
  let ctx: ReturnType<typeof makeCtx>;

  beforeEach(() => {
    ctx = makeCtx();
    canvas = {
      width: 0,
      height: 0,
      style: {},
      getContext: vi.fn(() => ctx),
    } as unknown as HTMLCanvasElement;
    vi.stubGlobal("window", { devicePixelRatio: 2 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sizes the backing bitmap by devicePixelRatio and sets a matching CSS size", () => {
    const result = setupHiDPICanvas(canvas, 100, 50);
    expect(canvas.width).toBe(200);
    expect(canvas.height).toBe(100);
    expect(canvas.style.width).toBe("100px");
    expect(canvas.style.height).toBe("50px");
    expect(ctx.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
    expect(ctx.imageSmoothingEnabled).toBe(true);
    expect(ctx.imageSmoothingQuality).toBe("high");
    expect(result).toBe(ctx);
  });

  it("clamps pixel dimensions to a minimum of 1", () => {
    setupHiDPICanvas(canvas, 0, 0);
    expect(canvas.width).toBe(1);
    expect(canvas.height).toBe(1);
  });

  it("skips reallocation and transform reset when pixel size is unchanged", () => {
    setupHiDPICanvas(canvas, 100, 50); // first call: 200x100 backing
    ctx.setTransform = vi.fn();

    setupHiDPICanvas(canvas, 100, 50); // same CSS size -> same pixel size
    expect(ctx.setTransform).not.toHaveBeenCalled();
  });

  it("still updates CSS size even when the backing bitmap is unchanged", () => {
    setupHiDPICanvas(canvas, 100, 50);
    setupHiDPICanvas(canvas, 100, 50);
    expect(canvas.style.width).toBe("100px");
    expect(canvas.style.height).toBe("50px");
  });

  it("reallocates when devicePixelRatio changes even if CSS size stays the same", () => {
    setupHiDPICanvas(canvas, 100, 50); // dpr=2 -> 200x100
    vi.stubGlobal("window", { devicePixelRatio: 1 });
    setupHiDPICanvas(canvas, 100, 50); // dpr=1 -> 100x50
    expect(canvas.width).toBe(100);
    expect(canvas.height).toBe(50);
  });

  it("falls back to a devicePixelRatio of 1 when unset", () => {
    vi.stubGlobal("window", {});
    setupHiDPICanvas(canvas, 100, 50);
    expect(canvas.width).toBe(100);
    expect(canvas.height).toBe(50);
  });

  it("throws when the 2D context is unavailable", () => {
    canvas.getContext = vi.fn(() => null);
    expect(() => setupHiDPICanvas(canvas, 100, 50)).toThrow("2D canvas context unavailable");
  });
});
