import { describe, expect, it } from "vitest";
import {
  extractChannelData,
  mixChannelsToMono,
  getChannelCount,
} from "./stereo";

describe("Stereo utility functions", () => {
  describe("getChannelCount", () => {
    it("returns the numberOfChannels from an AudioBuffer", () => {
      const buffer = {
        numberOfChannels: 2,
        sampleRate: 44100,
      } as unknown as AudioBuffer;
      expect(getChannelCount(buffer)).toBe(2);
    });

    it("handles mono (1 channel)", () => {
      const buffer = {
        numberOfChannels: 1,
        sampleRate: 44100,
      } as unknown as AudioBuffer;
      expect(getChannelCount(buffer)).toBe(1);
    });

    it("handles multichannel (5.1, etc.)", () => {
      const buffer = {
        numberOfChannels: 6,
        sampleRate: 44100,
      } as unknown as AudioBuffer;
      expect(getChannelCount(buffer)).toBe(6);
    });
  });

  describe("extractChannelData", () => {
    it("returns the requested channel data", () => {
      const left = new Float32Array([0.1, 0.2, 0.3]);
      const right = new Float32Array([0.4, 0.5, 0.6]);
      const buffer = {
        numberOfChannels: 2,
        sampleRate: 44100,
        getChannelData: (i: number) => (i === 0 ? left : right),
      } as unknown as AudioBuffer;

      expect(extractChannelData(buffer, 0)).toBe(left);
      expect(extractChannelData(buffer, 1)).toBe(right);
    });

    it("clamps to channel 0 if requested channel does not exist", () => {
      const left = new Float32Array([0.1, 0.2]);
      const buffer = {
        numberOfChannels: 1,
        sampleRate: 44100,
        getChannelData: (i: number) => (i === 0 ? left : new Float32Array()),
      } as unknown as AudioBuffer;

      expect(extractChannelData(buffer, 5)).toBe(left);
    });
  });

  describe("mixChannelsToMono", () => {
    it("sums all channels and normalizes (no clipping)", () => {
      const left = new Float32Array([0.25, 0.5, 0.75]);
      const right = new Float32Array([0.25, 0.25, 0.25]);
      const buffer = {
        numberOfChannels: 2,
        sampleRate: 44100,
        length: 3,
        getChannelData: (i: number) => (i === 0 ? left : right),
      } as unknown as AudioBuffer;

      const result = mixChannelsToMono(buffer);

      expect(result).toHaveLength(3);
      expect(result[0]).toBeCloseTo(0.25, 5); // (0.25 + 0.25) / 2
      expect(result[1]).toBeCloseTo(0.375, 5); // (0.5 + 0.25) / 2
      expect(result[2]).toBeCloseTo(0.5, 5); // (0.75 + 0.25) / 2
    });

    it("handles mono (single channel) by returning a copy", () => {
      const mono = new Float32Array([0.1, 0.2, 0.3]);
      const buffer = {
        numberOfChannels: 1,
        sampleRate: 44100,
        length: 3,
        getChannelData: () => mono,
      } as unknown as AudioBuffer;

      const result = mixChannelsToMono(buffer);

      expect(result).toEqual(mono);
      expect(result).not.toBe(mono); // must be a copy
    });

    it("sums 5.1 channels (6 total)", () => {
      const channels = [
        new Float32Array([0.1, 0.1]), // L
        new Float32Array([0.1, 0.1]), // R
        new Float32Array([0.1, 0.1]), // C
        new Float32Array([0.1, 0.1]), // LFE
        new Float32Array([0.1, 0.1]), // Ls
        new Float32Array([0.1, 0.1]), // Rs
      ];
      const buffer = {
        numberOfChannels: 6,
        sampleRate: 44100,
        length: 2,
        getChannelData: (i: number) => channels[i],
      } as unknown as AudioBuffer;

      const result = mixChannelsToMono(buffer);

      expect(result).toHaveLength(2);
      // All channels contribute equally: (0.1 * 6) / 6 = 0.1
      expect(result[0]).toBeCloseTo(0.1, 5);
      expect(result[1]).toBeCloseTo(0.1, 5);
    });

    it("preserves dynamic range without clipping", () => {
      // Simulate a stereo file where L and R peaks at different times
      const left = new Float32Array([0.99, 0.1]);
      const right = new Float32Array([0.1, 0.99]);
      const buffer = {
        numberOfChannels: 2,
        sampleRate: 44100,
        length: 2,
        getChannelData: (i: number) => (i === 0 ? left : right),
      } as unknown as AudioBuffer;

      const result = mixChannelsToMono(buffer);

      // Each sample: (0.99 + 0.1) / 2 = 0.545, not 1.0 (no clipping)
      expect(result[0]).toBeCloseTo(0.545, 5);
      expect(result[1]).toBeCloseTo(0.545, 5);
    });
  });
});
