import { describe, expect, it } from "vitest";
import { computePeaks, fullZoomSamplesPerPixel } from "./peaks";

describe("computePeaks", () => {
  it("returns an empty array for zero output width", () => {
    const samples = new Float32Array([0.1, -0.2, 0.3]);
    expect(computePeaks(samples, 0, 3, 0)).toHaveLength(0);
  });

  it("returns zeros for empty sample buffer", () => {
    const result = computePeaks(new Float32Array(0), 0, 0, 4);
    expect(Array.from(result)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it("computes min/max per bucket when samples outnumber pixels", () => {
    // 8 samples decimated to 2 pixels -> 4 samples/bucket
    const samples = new Float32Array([0, 0.5, -0.5, 0.2, 1, -1, 0.1, -0.1]);
    const result = computePeaks(samples, 0, 8, 2);
    expect(result[0]).toBeCloseTo(-0.5); // bucket 0 min
    expect(result[1]).toBeCloseTo(0.5); // bucket 0 max
    expect(result[2]).toBeCloseTo(-1); // bucket 1 min
    expect(result[3]).toBeCloseTo(1); // bucket 1 max
  });

  it("maps one sample per pixel at deep zoom (min === max)", () => {
    const samples = new Float32Array([0.25, -0.75]);
    const result = computePeaks(samples, 0, 2, 2);
    expect(result[0]).toBeCloseTo(0.25);
    expect(result[1]).toBeCloseTo(0.25);
    expect(result[2]).toBeCloseTo(-0.75);
    expect(result[3]).toBeCloseTo(-0.75);
  });

  it("clamps a start/end range outside the sample buffer bounds", () => {
    const samples = new Float32Array([0.1, 0.2, 0.3]);
    const result = computePeaks(samples, -5, 100, 3);
    expect(result.length).toBe(6);
    expect(result[0]).toBeCloseTo(0.1);
    expect(result[5]).toBeCloseTo(0.3);
  });

  it("returns zeros when the requested range is inverted/empty", () => {
    const samples = new Float32Array([0.1, 0.2, 0.3]);
    const result = computePeaks(samples, 2, 1, 2);
    expect(Array.from(result)).toEqual([0, 0, 0, 0]);
  });
});

describe("fullZoomSamplesPerPixel", () => {
  it("divides total samples by pixel width", () => {
    expect(fullZoomSamplesPerPixel(1000, 100)).toBe(10);
  });

  it("falls back to total samples when pixel width is zero", () => {
    expect(fullZoomSamplesPerPixel(1000, 0)).toBe(1000);
  });
});
