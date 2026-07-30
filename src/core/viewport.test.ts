import { describe, expect, it } from "vitest";
import { clampOffset, fullZoom, pixelToSample, sampleToPixel, scrollBy, visibleSampleRange, zoomAt } from "./viewport";
import { MIN_SAMPLES_PER_PIXEL } from "./peaks";

const config = { totalSamples: 1000, pixelWidth: 100 };

describe("fullZoom", () => {
  it("fits total samples to pixel width", () => {
    expect(fullZoom(config)).toEqual({ samplesPerPixel: 10, offsetSample: 0 });
  });

  it("floors samplesPerPixel at the deepest-zoom minimum", () => {
    const tiny = fullZoom({ totalSamples: 1, pixelWidth: 1000 });
    expect(tiny.samplesPerPixel).toBe(MIN_SAMPLES_PER_PIXEL);
  });
});

describe("pixel/sample conversion", () => {
  const zoom = { samplesPerPixel: 10, offsetSample: 50 };
  it("converts pixel to sample", () => {
    expect(pixelToSample(5, zoom)).toBe(100);
  });
  it("converts sample to pixel", () => {
    expect(sampleToPixel(100, zoom)).toBe(5);
  });
});

describe("visibleSampleRange", () => {
  it("computes start/end from zoom and pixel width", () => {
    const zoom = { samplesPerPixel: 10, offsetSample: 20 };
    expect(visibleSampleRange(zoom, 50)).toEqual({ start: 20, end: 520 });
  });
});

describe("zoomAt", () => {
  it("zooms in while keeping the pivot sample stationary", () => {
    const zoom = { samplesPerPixel: 10, offsetSample: 0 };
    const next = zoomAt(zoom, 50, 2, config); // zoom in 2x at pixel 50 (sample 500)
    expect(next.samplesPerPixel).toBeCloseTo(5);
    expect(pixelToSample(50, next)).toBeCloseTo(500);
  });

  it("does not zoom out past full-fit resolution", () => {
    const zoom = fullZoom(config);
    const next = zoomAt(zoom, 0, 0.1, config);
    expect(next.samplesPerPixel).toBeLessThanOrEqual(fullZoom(config).samplesPerPixel);
  });

  it("does not zoom in past single-sample resolution", () => {
    const zoom = { samplesPerPixel: MIN_SAMPLES_PER_PIXEL, offsetSample: 0 };
    const next = zoomAt(zoom, 0, 100, config);
    expect(next.samplesPerPixel).toBe(MIN_SAMPLES_PER_PIXEL);
  });
});

describe("scrollBy / clampOffset", () => {
  it("scrolls forward within bounds", () => {
    const zoom = { samplesPerPixel: 1, offsetSample: 0 };
    const next = scrollBy(zoom, 100, config);
    expect(next.offsetSample).toBe(100);
  });

  it("clamps offset so the viewport never scrolls past the end", () => {
    const zoom = { samplesPerPixel: 10, offsetSample: 0 }; // visible = 1000 samples = entire buffer
    const next = scrollBy(zoom, 500, config);
    expect(next.offsetSample).toBe(0);
  });

  it("clamps offset to zero on negative scroll", () => {
    const zoom = { samplesPerPixel: 1, offsetSample: 10 };
    const next = scrollBy(zoom, -100, config);
    expect(next.offsetSample).toBe(0);
  });

  it("clampOffset is a no-op for an already-valid zoom state", () => {
    const zoom = { samplesPerPixel: 1, offsetSample: 10 };
    expect(clampOffset(zoom, config)).toEqual(zoom);
  });
});
