import { describe, expect, it } from "vitest";
import { computeStereoLaneHeights, StereoRenderConfig } from "./stereo-renderer";

describe("Stereo rendering utilities", () => {
  describe("computeStereoLaneHeights", () => {
    it("distributes total height equally between L/R channels", () => {
      const config: StereoRenderConfig = {
        totalHeight: 200,
        numChannels: 2,
        gapBetweenLanes: 0,
        minimapHeightRatio: 0.2,
      };

      const result = computeStereoLaneHeights(config);

      expect(result.waveformHeight).toBe(160); // 200 * (1 - 0.2)
      expect(result.minimapHeight).toBe(40); // 200 * 0.2
      expect(result.laneHeights).toHaveLength(2);
      expect(result.laneHeights[0]).toBe(80); // 160 / 2
      expect(result.laneHeights[1]).toBe(80); // 160 / 2
    });

    it("accounts for gaps between lanes", () => {
      const config: StereoRenderConfig = {
        totalHeight: 200,
        numChannels: 2,
        gapBetweenLanes: 10,
        minimapHeightRatio: 0.1,
      };

      const result = computeStereoLaneHeights(config);

      const waveformHeight = 200 * 0.9; // 180
      const totalGapHeight = 10 * 1; // 1 gap between 2 lanes
      const availableForLanes = waveformHeight - totalGapHeight; // 170
      const laneHeight = availableForLanes / 2; // 85

      expect(result.waveformHeight).toBe(180);
      expect(result.laneHeights[0]).toBe(laneHeight);
      expect(result.laneHeights[1]).toBe(laneHeight);
    });

    it("handles single-channel (mono) configuration", () => {
      const config: StereoRenderConfig = {
        totalHeight: 150,
        numChannels: 1,
        gapBetweenLanes: 0,
        minimapHeightRatio: 0.2,
      };

      const result = computeStereoLaneHeights(config);

      expect(result.waveformHeight).toBe(120); // 150 * 0.8
      expect(result.laneHeights).toHaveLength(1);
      expect(result.laneHeights[0]).toBe(120);
    });

    it("handles 5.1 surround configuration", () => {
      const config: StereoRenderConfig = {
        totalHeight: 600,
        numChannels: 6, // 5.1
        gapBetweenLanes: 5,
        minimapHeightRatio: 0.2,
      };

      const result = computeStereoLaneHeights(config);

      const waveformHeight = 600 * 0.8; // 480
      const totalGapHeight = 5 * 5; // 5 gaps between 6 lanes
      const availableForLanes = waveformHeight - totalGapHeight; // 455
      const laneHeight = availableForLanes / 6; // ~75.83

      expect(result.waveformHeight).toBe(480);
      expect(result.laneHeights).toHaveLength(6);
      result.laneHeights.forEach((h) => {
        expect(h).toBeCloseTo(laneHeight, 1);
      });
      // All lanes heights should sum to available space (with floating point tolerance)
      const totalLaneHeight = result.laneHeights.reduce((a, b) => a + b, 0);
      expect(totalLaneHeight).toBeCloseTo(availableForLanes, 5);
    });

    it("ensures total height never goes negative with extreme minimap ratios", () => {
      const config: StereoRenderConfig = {
        totalHeight: 100,
        numChannels: 2,
        gapBetweenLanes: 0,
        minimapHeightRatio: 0.99, // Almost everything is minimap
      };

      const result = computeStereoLaneHeights(config);

      expect(result.waveformHeight).toBeGreaterThan(0);
      expect(result.laneHeights[0]).toBeGreaterThan(0);
      expect(result.laneHeights[1]).toBeGreaterThan(0);
    });
  });
});
