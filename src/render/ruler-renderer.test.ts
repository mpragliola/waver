import { describe, expect, it, vi } from "vitest";
import { darkTheme } from "../core/theme";
import type { ZoomState } from "../core/types";
import { renderRuler } from "./ruler-renderer";

function makeCtx() {
  const calls: { fillText: [string, number, number][] } = { fillText: [] };
  const ctx = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    font: "",
    textBaseline: "",
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn((text: string, x: number, y: number) => calls.fillText.push([text, x, y])),
  } as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

const zoomFullView = (samplesPerPixel: number): ZoomState => ({ samplesPerPixel, offsetSample: 0 });

describe("renderRuler", () => {
  it("draws only the background when there are no samples", () => {
    const { ctx, calls } = makeCtx();
    renderRuler(ctx, zoomFullView(1), darkTheme, {
      width: 300,
      height: 20,
      sampleRate: 44100,
      totalSamples: 0,
      format: "time",
    });
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 300, 20);
    expect(calls.fillText).toHaveLength(0);
  });

  it("labels short clips (<60s) as seconds with a trailing 's'", () => {
    const { ctx, calls } = makeCtx();
    const sampleRate = 44100;
    const totalSamples = 10 * sampleRate;
    renderRuler(ctx, zoomFullView(totalSamples / 300), darkTheme, {
      width: 300,
      height: 20,
      sampleRate,
      totalSamples,
      format: "time",
    });
    expect(calls.fillText.length).toBeGreaterThan(0);
    expect(calls.fillText[0][0]).toMatch(/^\d+s$/);
  });

  it("labels clips between 1 minute and 1 hour as mm:ss", () => {
    const { ctx, calls } = makeCtx();
    const sampleRate = 44100;
    const totalSamples = 90 * sampleRate; // 1:30
    renderRuler(ctx, zoomFullView(totalSamples / 300), darkTheme, {
      width: 300,
      height: 20,
      sampleRate,
      totalSamples,
      format: "time",
    });
    expect(calls.fillText.some(([label]) => /^\d+:\d{2}$/.test(label))).toBe(true);
  });

  it("labels clips >= 1 hour as hh:mm:ss", () => {
    const { ctx, calls } = makeCtx();
    const sampleRate = 44100;
    const totalSamples = 3700 * sampleRate; // just over 1h
    renderRuler(ctx, zoomFullView(totalSamples / 300), darkTheme, {
      width: 300,
      height: 20,
      sampleRate,
      totalSamples,
      format: "time",
    });
    expect(calls.fillText.some(([label]) => /^\d+:\d{2}:\d{2}$/.test(label))).toBe(true);
  });

  it("renders raw sample indices when format is 'samples'", () => {
    const { ctx, calls } = makeCtx();
    const sampleRate = 44100;
    const totalSamples = 10 * sampleRate;
    renderRuler(ctx, zoomFullView(totalSamples / 300), darkTheme, {
      width: 300,
      height: 20,
      sampleRate,
      totalSamples,
      format: "samples",
    });
    expect(calls.fillText.length).toBeGreaterThan(0);
    expect(calls.fillText.every(([label]) => /^\d+$/.test(label))).toBe(true);
  });

  it("shows sub-second decimals when zoomed deep into a short clip", () => {
    const { ctx, calls } = makeCtx();
    const sampleRate = 44100;
    const totalSamples = 5 * sampleRate;
    // Deep zoom: only a fraction of a second visible across the whole width.
    renderRuler(ctx, zoomFullView(2), darkTheme, {
      width: 300,
      height: 20,
      sampleRate,
      totalSamples,
      format: "time",
    });
    expect(calls.fillText.some(([label]) => /^\d+\.\d+s$/.test(label))).toBe(true);
  });

  it("does not throw and draws nothing beyond the background for zero width", () => {
    const { ctx, calls } = makeCtx();
    renderRuler(ctx, zoomFullView(1), darkTheme, {
      width: 0,
      height: 20,
      sampleRate: 44100,
      totalSamples: 1000,
      format: "time",
    });
    expect(calls.fillText).toHaveLength(0);
  });
});
