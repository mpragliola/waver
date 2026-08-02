import { describe, expect, it } from "vitest";
import { createTwiddleTables, fft, hannWindow, nextPowerOfTwo } from "./fft";

describe("fft", () => {
  it("throws on mismatched array lengths", () => {
    expect(() => fft(new Float32Array(4), new Float32Array(2), createTwiddleTables(4))).toThrow();
  });

  it("throws on non-power-of-two length", () => {
    expect(() => fft(new Float32Array(3), new Float32Array(3), createTwiddleTables(3))).toThrow();
  });

  it("no-ops on empty input", () => {
    expect(() => fft(new Float32Array(0), new Float32Array(0), createTwiddleTables(0))).not.toThrow();
  });

  it("transforms a DC signal into energy entirely in bin 0", () => {
    const n = 8;
    const real = new Float32Array(n).fill(1);
    const imag = new Float32Array(n);
    fft(real, imag, createTwiddleTables(n));
    expect(real[0]).toBeCloseTo(n);
    for (let i = 1; i < n; i++) {
      expect(Math.hypot(real[i], imag[i])).toBeCloseTo(0, 5);
    }
  });

  it("transforms an impulse into flat magnitude across all bins", () => {
    const n = 8;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    real[0] = 1;
    fft(real, imag, createTwiddleTables(n));
    for (let i = 0; i < n; i++) {
      expect(Math.hypot(real[i], imag[i])).toBeCloseTo(1, 5);
    }
  });

  it("places a pure sine wave's energy at its matching bin", () => {
    const n = 16;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    const targetBin = 3;
    for (let i = 0; i < n; i++) {
      real[i] = Math.sin((2 * Math.PI * targetBin * i) / n);
    }
    fft(real, imag, createTwiddleTables(n));
    const magnitudes = Array.from({ length: n }, (_, i) => Math.hypot(real[i], imag[i]));
    const peakBin = magnitudes.indexOf(Math.max(...magnitudes));
    expect(peakBin === targetBin || peakBin === n - targetBin).toBe(true);
  });
});

describe("createTwiddleTables", () => {
  it("returns n/2 cos/sin entries matching the direct formula", () => {
    const n = 8;
    const { cos, sin } = createTwiddleTables(n);
    expect(cos).toHaveLength(n / 2);
    expect(sin).toHaveLength(n / 2);
    for (let k = 0; k < n / 2; k++) {
      const angle = (-2 * Math.PI * k) / n;
      expect(cos[k]).toBeCloseTo(Math.cos(angle));
      expect(sin[k]).toBeCloseTo(Math.sin(angle));
    }
  });

  it("does not throw for n = 0", () => {
    expect(() => createTwiddleTables(0)).not.toThrow();
  });
});

describe("hannWindow", () => {
  it("starts and ends near zero, peaks near the middle", () => {
    const window = hannWindow(8);
    expect(window[0]).toBeCloseTo(0);
    expect(window[7]).toBeCloseTo(0);
    expect(window[3]).toBeGreaterThan(0.9);
  });

  it("fills a single-sample window with 1", () => {
    expect(Array.from(hannWindow(1))).toEqual([1]);
  });
});

describe("nextPowerOfTwo", () => {
  it("returns the same value when already a power of two", () => {
    expect(nextPowerOfTwo(1024)).toBe(1024);
  });

  it("rounds up to the next power of two", () => {
    expect(nextPowerOfTwo(1025)).toBe(2048);
    expect(nextPowerOfTwo(1)).toBe(1);
  });
});
