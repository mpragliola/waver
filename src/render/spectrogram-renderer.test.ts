import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { darkTheme } from "../core/theme";
import { renderSpectrogram } from "./spectrogram-renderer";

function makeCtx() {
  return {
    fillStyle: "",
    font: "",
    textAlign: "",
    textBaseline: "",
    imageSmoothingEnabled: false,
    imageSmoothingQuality: "",
    fillRect: vi.fn(),
    fillText: vi.fn(),
    createImageData: vi.fn((w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) })),
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

class FakeOffscreenCanvas {
  width: number;
  height: number;
  putImageData = vi.fn();
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
  getContext() {
    return { putImageData: this.putImageData };
  }
}

describe("renderSpectrogram", () => {
  beforeEach(() => {
    vi.stubGlobal("OffscreenCanvas", FakeOffscreenCanvas);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fills the background first", () => {
    const ctx = makeCtx();
    renderSpectrogram(ctx, null, darkTheme, { width: 100, height: 50, freqBins: 8 });
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 100, 50);
  });

  it("shows a loading label when columns are null but there is room to draw", () => {
    const ctx = makeCtx();
    renderSpectrogram(ctx, null, darkTheme, { width: 100, height: 50, freqBins: 8 });
    expect(ctx.fillText).toHaveBeenCalledWith("Calculating spectrogram…", 50, 25);
  });

  it("does not show the loading label when there is no room to draw", () => {
    const ctx = makeCtx();
    renderSpectrogram(ctx, null, darkTheme, { width: 0, height: 50, freqBins: 8 });
    expect(ctx.fillText).not.toHaveBeenCalled();
  });

  it("does nothing further when columns are null", () => {
    const ctx = makeCtx();
    renderSpectrogram(ctx, null, darkTheme, { width: 100, height: 50, freqBins: 8 });
    expect(ctx.createImageData).not.toHaveBeenCalled();
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });

  it("rasterizes columns into an offscreen image and draws it scaled to the target size", () => {
    const ctx = makeCtx();
    const freqBins = 2;
    const width = 3;
    const columns = new Float32Array(width * freqBins).fill(0.5);
    renderSpectrogram(ctx, columns, darkTheme, { width, height: 40, freqBins });

    expect(ctx.createImageData).toHaveBeenCalledWith(width, freqBins);
    expect(ctx.imageSmoothingEnabled).toBe(true);
    expect(ctx.imageSmoothingQuality).toBe("high");
    expect(ctx.drawImage).toHaveBeenCalledWith(expect.any(FakeOffscreenCanvas), 0, 0, width, freqBins, 0, 0, width, 40);
  });

  it("flips rows vertically: bin 0 (lowest frequency) lands at the bottom of the image", () => {
    const ctx = makeCtx();
    const freqBins = 2;
    const width = 1;
    // bin 0 (source row 0) -> intensity 1 (top of the LUT gradient), bin 1 -> intensity 0 (bottom).
    const columns = new Float32Array([1, 0]);
    renderSpectrogram(ctx, columns, darkTheme, { width, height: 20, freqBins });

    const imageData = (ctx.createImageData as ReturnType<typeof vi.fn>).mock.results[0].value as { data: Uint8ClampedArray };
    // destRow for bin 0 is freqBins-1-0 = 1 (image's bottom row), and for bin 1 is row 0 (top).
    const topRowColor = [imageData.data[0], imageData.data[1], imageData.data[2]];
    const bottomRowColor = [imageData.data[4], imageData.data[5], imageData.data[6]];
    expect(bottomRowColor).not.toEqual(topRowColor);
    expect(darkTheme.spectrogramColors.length).toBeGreaterThanOrEqual(2);
  });

  it("skips rendering entirely for zero freqBins", () => {
    const ctx = makeCtx();
    const columns = new Float32Array(0);
    renderSpectrogram(ctx, columns, darkTheme, { width: 100, height: 50, freqBins: 0 });
    expect(ctx.createImageData).not.toHaveBeenCalled();
  });
});
