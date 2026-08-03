import { describe, expect, it, vi } from "vitest";
import { darkTheme } from "../core/theme";
import { renderMinimap } from "./minimap-renderer";

function makeCtx() {
  return {
    fillStyle: "",
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

describe("renderMinimap", () => {
  it("fills the background even with no peaks", () => {
    const ctx = makeCtx();
    renderMinimap(ctx, null, darkTheme, { width: 200, height: 40, totalSamples: 0, zoom: { samplesPerPixel: 1, offsetSample: 0 }, mainPixelWidth: 100 });
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 200, 40);
  });

  it("skips drawing peaks when there are none", () => {
    const ctx = makeCtx();
    renderMinimap(ctx, null, darkTheme, { width: 200, height: 40, totalSamples: 1000, zoom: { samplesPerPixel: 1, offsetSample: 0 }, mainPixelWidth: 100 });
    expect(ctx.fill).not.toHaveBeenCalled();
  });

  it("draws the peak path when peaks are provided", () => {
    const ctx = makeCtx();
    const peaks = new Float32Array([-0.5, 0.5, -0.25, 0.25]);
    renderMinimap(ctx, peaks, darkTheme, { width: 2, height: 40, totalSamples: 1000, zoom: { samplesPerPixel: 1, offsetSample: 0 }, mainPixelWidth: 100 });
    expect(ctx.fill).toHaveBeenCalledTimes(1);
  });

  it("skips both the viewport overlay and any zero-division when totalSamples is zero", () => {
    const ctx = makeCtx();
    renderMinimap(ctx, null, darkTheme, { width: 200, height: 40, totalSamples: 0, zoom: { samplesPerPixel: 5, offsetSample: 10 }, mainPixelWidth: 100 });
    // Background fill only — no overlay fillRect follows.
    expect(ctx.fillRect).toHaveBeenCalledTimes(1);
  });

  it("positions the viewport overlay proportionally to the visible range", () => {
    const ctx = makeCtx();
    // totalSamples=1000, visible = [100, 100+2*100=300] -> overlay at 10%..30% of width
    renderMinimap(ctx, null, darkTheme, {
      width: 200,
      height: 40,
      totalSamples: 1000,
      zoom: { samplesPerPixel: 2, offsetSample: 100 },
      mainPixelWidth: 100,
    });
    expect(ctx.fillRect).toHaveBeenNthCalledWith(2, 20, 0, 40, 40);
    expect(ctx.fillStyle).toBe(darkTheme.minimapOverlayColor);
  });

  it("clamps the overlay to a minimum 1px width for a very small visible range", () => {
    const ctx = makeCtx();
    renderMinimap(ctx, null, darkTheme, {
      width: 200,
      height: 40,
      totalSamples: 1_000_000,
      zoom: { samplesPerPixel: 1, offsetSample: 0 },
      mainPixelWidth: 1,
    });
    const overlayCall = (ctx.fillRect as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(overlayCall[2]).toBe(1);
  });
});
