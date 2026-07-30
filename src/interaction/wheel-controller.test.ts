import { describe, expect, it } from "vitest";
import { applyWheel } from "./wheel-controller";
import { fullZoom } from "../core/viewport";

const config = { totalSamples: 1000, pixelWidth: 100 };

describe("applyWheel", () => {
  it("zooms in on negative deltaY without modifiers", () => {
    const zoom = fullZoom(config);
    const next = applyWheel(zoom, { deltaY: -100, ctrlKey: false, shiftKey: false, pivotPixel: 50 }, config);
    expect(next.samplesPerPixel).toBeLessThan(zoom.samplesPerPixel);
  });

  it("zooms out on positive deltaY without modifiers", () => {
    const zoom = { samplesPerPixel: 5, offsetSample: 100 };
    const next = applyWheel(zoom, { deltaY: 100, ctrlKey: false, shiftKey: false, pivotPixel: 50 }, config);
    expect(next.samplesPerPixel).toBeGreaterThan(zoom.samplesPerPixel);
  });

  it("scrolls instead of zooming when ctrlKey is held", () => {
    const zoom = { samplesPerPixel: 1, offsetSample: 100 };
    const next = applyWheel(zoom, { deltaY: 50, ctrlKey: true, shiftKey: false, pivotPixel: 50 }, config);
    expect(next.samplesPerPixel).toBe(zoom.samplesPerPixel);
    expect(next.offsetSample).toBeGreaterThan(zoom.offsetSample);
  });

  it("scrolls faster with ctrl+shift than ctrl alone", () => {
    const zoom = { samplesPerPixel: 1, offsetSample: 0 };
    const normal = applyWheel(zoom, { deltaY: 10, ctrlKey: true, shiftKey: false, pivotPixel: 0 }, config);
    const fast = applyWheel(zoom, { deltaY: 10, ctrlKey: true, shiftKey: true, pivotPixel: 0 }, config);
    expect(fast.offsetSample).toBeGreaterThan(normal.offsetSample);
  });
});
