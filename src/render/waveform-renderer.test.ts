import { describe, expect, it, vi } from "vitest";
import { darkTheme } from "../core/theme";
import { renderWaveform } from "./waveform-renderer";

function makeCtx() {
  return {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    lineJoin: "",
    lineCap: "",
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

describe("renderWaveform", () => {
  it("fills the background before anything else", () => {
    const ctx = makeCtx();
    renderWaveform(ctx, null, darkTheme, { width: 300, height: 100, showZeroLine: false, samplesPerPixel: 5 });
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 300, 100);
  });

  it("draws nothing further when there are no peaks and the zero line is off", () => {
    const ctx = makeCtx();
    renderWaveform(ctx, null, darkTheme, { width: 300, height: 100, showZeroLine: false, samplesPerPixel: 5 });
    expect(ctx.stroke).not.toHaveBeenCalled();
    expect(ctx.fill).not.toHaveBeenCalled();
  });

  it("draws the zero line even with no peaks, when enabled", () => {
    const ctx = makeCtx();
    renderWaveform(ctx, null, darkTheme, { width: 300, height: 100, showZeroLine: true, samplesPerPixel: 5 });
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
    expect(ctx.strokeStyle).toBe(darkTheme.zeroLineColor);
  });

  it("uses the filled peak-path renderer above the line-mode threshold", () => {
    const ctx = makeCtx();
    const peaks = new Float32Array([-0.5, 0.5, -0.25, 0.25]);
    renderWaveform(ctx, peaks, darkTheme, { width: 2, height: 100, showZeroLine: false, samplesPerPixel: 2 });
    expect(ctx.fill).toHaveBeenCalledTimes(1);
    expect(ctx.stroke).not.toHaveBeenCalled();
    expect(ctx.fillStyle).toBe(darkTheme.waveformColor);
  });

  it("switches to the stroked line renderer at/below the line-mode threshold", () => {
    const ctx = makeCtx();
    const peaks = new Float32Array([-0.5, 0.5, -0.25, 0.25]);
    renderWaveform(ctx, peaks, darkTheme, { width: 2, height: 100, showZeroLine: false, samplesPerPixel: 1.5 });
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
    expect(ctx.fill).not.toHaveBeenCalled();
    expect(ctx.strokeStyle).toBe(darkTheme.waveformColor);
  });

  it("draws the zero line after the waveform when both are present", () => {
    const ctx = makeCtx();
    const peaks = new Float32Array([-0.5, 0.5, -0.25, 0.25]);
    renderWaveform(ctx, peaks, darkTheme, { width: 2, height: 100, showZeroLine: true, samplesPerPixel: 2 });
    expect(ctx.fill).toHaveBeenCalledTimes(1);
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
  });

  it("skips waveform drawing for zero width even with peaks", () => {
    const ctx = makeCtx();
    const peaks = new Float32Array([-0.5, 0.5]);
    renderWaveform(ctx, peaks, darkTheme, { width: 0, height: 100, showZeroLine: false, samplesPerPixel: 2 });
    expect(ctx.fill).not.toHaveBeenCalled();
    expect(ctx.stroke).not.toHaveBeenCalled();
  });
});
