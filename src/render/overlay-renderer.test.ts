import { describe, expect, it, vi } from "vitest";
import { darkTheme } from "../core/theme";
import { renderCursor, renderHoverLine, renderSelection } from "./overlay-renderer";

function makeCtx() {
  return {
    fillStyle: "",
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    fillRect: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  } as unknown as CanvasRenderingContext2D;
}

describe("renderCursor", () => {
  it("draws a centered vertical bar at the cursor's pixel position and resets alpha", () => {
    const ctx = makeCtx();
    const zoom = { samplesPerPixel: 10, offsetSample: 0 };
    renderCursor(ctx, 100, zoom, darkTheme, 50); // sample 100 -> pixel 10
    expect(ctx.fillStyle).toBe(darkTheme.cursorColor);
    expect(ctx.fillRect).toHaveBeenCalledWith(9, 0, 2, 50);
    expect(ctx.globalAlpha).toBe(1);
  });
});

describe("renderHoverLine", () => {
  it("draws a thin centered line at the given pixel and resets alpha", () => {
    const ctx = makeCtx();
    renderHoverLine(ctx, 42, darkTheme, 80);
    expect(ctx.fillStyle).toBe(darkTheme.cursorColor);
    expect(ctx.fillRect).toHaveBeenCalledWith(41.5, 0, 1, 80);
    expect(ctx.globalAlpha).toBe(1);
  });
});

describe("renderSelection", () => {
  it("fills the selection span using screen compositing, then restores source-over", () => {
    const ctx = makeCtx();
    const zoom = { samplesPerPixel: 10, offsetSample: 0 };
    renderSelection(ctx, { startSample: 100, endSample: 300 }, zoom, darkTheme, 60);
    expect(ctx.fillRect).toHaveBeenCalledWith(10, 0, 20, 60);
    expect(ctx.globalCompositeOperation).toBe("source-over");
  });

  it("skips the edge glow when no accent edge is given", () => {
    const ctx = makeCtx();
    const zoom = { samplesPerPixel: 10, offsetSample: 0 };
    renderSelection(ctx, { startSample: 0, endSample: 100 }, zoom, darkTheme, 60);
    expect(ctx.createLinearGradient).not.toHaveBeenCalled();
    expect(ctx.fillRect).toHaveBeenCalledTimes(1);
  });

  it("skips the edge glow when accentFade is 0", () => {
    const ctx = makeCtx();
    const zoom = { samplesPerPixel: 10, offsetSample: 0 };
    renderSelection(ctx, { startSample: 0, endSample: 100 }, zoom, darkTheme, 60, "start", 0);
    expect(ctx.createLinearGradient).not.toHaveBeenCalled();
  });

  it("draws an inward-glowing gradient at the start edge", () => {
    const ctx = makeCtx();
    const zoom = { samplesPerPixel: 10, offsetSample: 0 };
    renderSelection(ctx, { startSample: 100, endSample: 300 }, zoom, darkTheme, 60, "start", 1);
    expect(ctx.createLinearGradient).toHaveBeenCalledWith(10, 0, 21, 0);
    // Second fillRect call is the glow band.
    expect(ctx.fillRect).toHaveBeenNthCalledWith(2, 10, 0, 11, 60);
  });

  it("draws an inward-glowing gradient at the end edge", () => {
    const ctx = makeCtx();
    const zoom = { samplesPerPixel: 10, offsetSample: 0 };
    renderSelection(ctx, { startSample: 100, endSample: 300 }, zoom, darkTheme, 60, "end", 1);
    expect(ctx.createLinearGradient).toHaveBeenCalledWith(30, 0, 19, 0);
    expect(ctx.fillRect).toHaveBeenNthCalledWith(2, 19, 0, 11, 60);
  });
});
