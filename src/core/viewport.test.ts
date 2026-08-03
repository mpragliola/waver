import { describe, expect, it } from "vitest";
import {
  clampOffset,
  fullZoom,
  pixelToSample,
  recordZoom,
  sampleToPixel,
  scrollBy,
  visibleSampleRange,
  zoomAt,
} from "./viewport";
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

describe("recordZoom", () => {
  it("spans the whole recording in zoom-out mode", () => {
    expect(recordZoom("zoom-out", config, 200)).toEqual(fullZoom(config));
  });

  it("ignores the window width in zoom-out mode", () => {
    expect(recordZoom("zoom-out", config, 200)).toEqual(recordZoom("zoom-out", config, 5000));
  });

  it("spans the whole recording in scroll mode while it fits the window", () => {
    // 600 recorded samples, 800-sample window: nothing to scroll yet.
    const short = { totalSamples: 600, pixelWidth: 100 };
    expect(recordZoom("scroll", short, 800)).toEqual(fullZoom(short));
  });

  it("still spans the whole recording at exactly the window width", () => {
    const exact = { totalSamples: 800, pixelWidth: 100 };
    expect(recordZoom("scroll", exact, 800)).toEqual(fullZoom(exact));
  });

  it("locks resolution and tracks the head once the recording outgrows the window", () => {
    // 1000 recorded samples, 400-sample window across 100px.
    const next = recordZoom("scroll", config, 400);
    expect(next.samplesPerPixel).toBe(4);
    expect(next.offsetSample).toBe(600);
  });

  it("holds resolution steady as the recording grows past the window", () => {
    const a = recordZoom("scroll", { totalSamples: 1000, pixelWidth: 100 }, 400);
    const b = recordZoom("scroll", { totalSamples: 9000, pixelWidth: 100 }, 400);
    expect(b.samplesPerPixel).toBe(a.samplesPerPixel);
    expect(b.offsetSample).toBe(8600);
  });

  it("falls back to zoom-out for a non-positive window", () => {
    expect(recordZoom("scroll", config, 0)).toEqual(fullZoom(config));
    expect(recordZoom("scroll", config, -100)).toEqual(fullZoom(config));
  });

  it("falls back to zoom-out for a non-finite window", () => {
    expect(recordZoom("scroll", config, Number.NaN)).toEqual(fullZoom(config));
    expect(recordZoom("scroll", config, Number.POSITIVE_INFINITY)).toEqual(fullZoom(config));
  });

  it("returns a finite zoom state in flat mode", () => {
    const next = recordZoom("flat", config, 400);
    expect(Number.isFinite(next.samplesPerPixel)).toBe(true);
    expect(Number.isFinite(next.offsetSample)).toBe(true);
  });
});
