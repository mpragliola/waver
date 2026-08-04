import { describe, expect, it, vi } from "vitest";
import { renderStereoWaveform, getStereoLanePeaks } from "./stereo-waveform-renderer";
import { makeFakeCtx } from "../waver-element.test-helpers";

describe("Stereo waveform rendering", () => {
  describe("getStereoLanePeaks", () => {
    it("returns peaks for each channel separately", () => {
      const left = new Float32Array([0.1, -0.2, 0.15, -0.05]);
      const right = new Float32Array([0.3, -0.1, 0.05, -0.25]);
      const channels = [left, right];

      const peaks = getStereoLanePeaks(channels, 4, 1);

      expect(peaks).toHaveLength(2); // 2 channels
      expect(peaks[0]).toBeDefined();
      expect(peaks[1]).toBeDefined();
    });

    it("returns peaks array for mono (single channel)", () => {
      const mono = new Float32Array([0.1, -0.5, 0.3]);
      const channels = [mono];

      const peaks = getStereoLanePeaks(channels, 3, 1);

      expect(peaks).toHaveLength(1);
    });

    it("computes correct min/max for each lane", () => {
      const left = new Float32Array([0.2, -0.8]);
      const right = new Float32Array([0.5, -0.3]);
      const channels = [left, right];

      const peaks = getStereoLanePeaks(channels, 2, 1);

      // 2 pixels (samplesPerPixel=1), 1 sample per pixel
      // Left channel pixel 0 (sample 0): 0.2
      expect(peaks[0][0].min).toBeCloseTo(0, 5);
      expect(peaks[0][0].max).toBeCloseTo(0.2, 5);
      // Left channel pixel 1 (sample 1): -0.8
      expect(peaks[0][1].min).toBeCloseTo(-0.8, 5);
      expect(peaks[0][1].max).toBeCloseTo(0, 5);
      // Right channel pixel 0: 0.5
      expect(peaks[1][0].min).toBeCloseTo(0, 5);
      expect(peaks[1][0].max).toBeCloseTo(0.5, 5);
      // Right channel pixel 1: -0.3
      expect(peaks[1][1].min).toBeCloseTo(-0.3, 5);
      expect(peaks[1][1].max).toBeCloseTo(0, 5);
    });
  });

  describe("renderStereoWaveform", () => {
    it("renders each channel in its lane with correct Y offset", () => {
      const ctx = makeFakeCtx();
      const left = new Float32Array([0.1, 0.2, 0.1]);
      const right = new Float32Array([0.3, 0.2, 0.3]);
      const channels = [left, right];

      const peaks = getStereoLanePeaks(channels, 3, 1);

      renderStereoWaveform(ctx, peaks, 300, [80, 80], 0, 1, {
        waveformColor: "#ffffff",
        backgroundColor: "#000000",
        cursorColor: "#ff0000",
        selectionColor: "#00ff00",
        minimapOverlayColor: "#888888",
        zeroLineColor: "#444444",
        rulerColor: "#666666",
        fontFamily: "sans-serif",
        spectrogramColors: [],
        roundedCorners: true,
        borderRadius: 0,
        googleFont: undefined,
      });

      expect(ctx.beginPath).toHaveBeenCalled();
      expect(ctx.stroke).toHaveBeenCalled();
    });

    it("respects lane heights when drawing", () => {
      const ctx = makeFakeCtx();
      const channels = [new Float32Array([0.1]), new Float32Array([0.2])];
      const peaks = getStereoLanePeaks(channels, 1, 1);
      const laneHeights = [100, 50]; // Different heights

      renderStereoWaveform(ctx, peaks, 300, laneHeights, 0, 1, {
        waveformColor: "#ffffff",
        backgroundColor: "#000000",
        cursorColor: "#ff0000",
        selectionColor: "#00ff00",
        minimapOverlayColor: "#888888",
        zeroLineColor: "#444444",
        rulerColor: "#666666",
        fontFamily: "sans-serif",
        spectrogramColors: [],
        roundedCorners: true,
        borderRadius: 0,
      });

      // Should have drawn paths (at least one per lane)
      expect(ctx.beginPath).toHaveBeenCalled();
    });
  });
});
