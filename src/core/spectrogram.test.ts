import { describe, expect, it } from "vitest";
import { computeColumnRange, computeSpectrogramColumns, normalizeColumns, totalSpectrogramColumns } from "./spectrogram";

describe("computeSpectrogramColumns", () => {
  it("returns empty data for an empty sample buffer", () => {
    const result = computeSpectrogramColumns(new Float32Array(0), 44100, 8, 4, 4);
    expect(result.numColumns).toBe(0);
    expect(result.columns).toHaveLength(0);
  });

  it("computes the expected column count for a buffer longer than one window", () => {
    const samples = new Float32Array(20).map((_, i) => Math.sin(i));
    const result = computeSpectrogramColumns(samples, 44100, 8, 4, 4);
    // floor((20 - 8) / 4) + 1
    expect(result.numColumns).toBe(4);
    expect(result.columns).toHaveLength(4 * 4);
  });

  it("uses a single column when the buffer is shorter than the FFT window", () => {
    const samples = new Float32Array([0.1, 0.2, 0.3]);
    const result = computeSpectrogramColumns(samples, 44100, 8, 4, 4);
    expect(result.numColumns).toBe(1);
  });

  it("normalizes all output values into [0, 1]", () => {
    const samples = new Float32Array(64).map((_, i) => Math.sin((2 * Math.PI * 5 * i) / 64) * (i % 8 === 0 ? 0 : 1));
    const result = computeSpectrogramColumns(samples, 8000, 16, 8, 6);
    for (const v of result.columns) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    // at least one bin should hit the top of the normalized range
    expect(Math.max(...result.columns)).toBeCloseTo(1, 5);
  });

  it("carries through the requested fftSize/hop/freqBins in the result", () => {
    const samples = new Float32Array(64).fill(0.5);
    const result = computeSpectrogramColumns(samples, 44100, 32, 16, 10);
    expect(result.fftSize).toBe(32);
    expect(result.hop).toBe(16);
    expect(result.freqBins).toBe(10);
  });
});

describe("totalSpectrogramColumns", () => {
  it("returns 0 for an empty or invalid buffer", () => {
    expect(totalSpectrogramColumns(0, 8, 4)).toBe(0);
    expect(totalSpectrogramColumns(20, 0, 4)).toBe(0);
    expect(totalSpectrogramColumns(20, 8, 0)).toBe(0);
  });

  it("returns 1 column when shorter than the window", () => {
    expect(totalSpectrogramColumns(5, 8, 4)).toBe(1);
  });

  it("matches computeSpectrogramColumns' column count for a longer buffer", () => {
    expect(totalSpectrogramColumns(20, 8, 4)).toBe(4);
  });
});

describe("computeColumnRange", () => {
  it("returns raw (un-normalized) dB values, unlike computeSpectrogramColumns", () => {
    const samples = new Float32Array(64).map((_, i) => Math.sin((2 * Math.PI * 5 * i) / 64));
    const numColumns = totalSpectrogramColumns(samples.length, 16, 8);
    const raw = computeColumnRange(samples, 8000, 16, 8, 6, numColumns);
    // dB values, not clamped to [0, 1] — at least one should fall outside that range.
    expect(raw.some((v) => v < 0 || v > 1)).toBe(true);
  });

  it("zero-pads columns that read past the slice's end", () => {
    const samples = new Float32Array([1, 1, 1, 1]);
    const raw = computeColumnRange(samples, 8000, 8, 4, 2, 2);
    expect(raw).toHaveLength(4);
  });

  it("produces the same values as computeSpectrogramColumns before normalization", () => {
    const samples = new Float32Array(32).map((_, i) => Math.cos(i));
    const numColumns = totalSpectrogramColumns(samples.length, 8, 4);
    const raw = computeColumnRange(samples, 44100, 8, 4, 4, numColumns);
    const normalized = Float32Array.from(raw);
    normalizeColumns(normalized);
    const wrapped = computeSpectrogramColumns(samples, 44100, 8, 4, 4);
    for (let i = 0; i < normalized.length; i++) {
      expect(normalized[i]).toBeCloseTo(wrapped.columns[i], 5);
    }
  });
});

describe("normalizeColumns", () => {
  it("no-ops on an empty array", () => {
    const arr = new Float32Array(0);
    expect(() => normalizeColumns(arr)).not.toThrow();
  });

  it("maps the min to 0 and the max to 1", () => {
    const arr = new Float32Array([-40, -20, 0, 20]);
    normalizeColumns(arr);
    expect(arr[0]).toBeCloseTo(0);
    expect(arr[3]).toBeCloseTo(1);
  });

  it("maps a constant array to all zeros (no division by zero)", () => {
    const arr = new Float32Array([-10, -10, -10]);
    normalizeColumns(arr);
    expect(Array.from(arr)).toEqual([0, 0, 0]);
  });
});
