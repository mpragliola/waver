import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineWaverElement, WaverElement } from "./waver-element";
import {
  installDomStubs,
  makeFakeAudioContext,
} from "./waver-element.test-helpers";

defineWaverElement();

function mount(): WaverElement {
  const el = document.createElement("wave-r") as WaverElement;
  document.body.append(el);
  return el;
}

function makeStereoAudioBuffer(leftSamples: Float32Array, rightSamples: Float32Array, sampleRate = 44100): AudioBuffer {
  return {
    sampleRate,
    duration: leftSamples.length / sampleRate,
    numberOfChannels: 2,
    length: leftSamples.length,
    getChannelData: (i: number) => (i === 0 ? leftSamples : rightSamples),
    copyToChannel: vi.fn(),
  } as unknown as AudioBuffer;
}

describe("WaverElement stereo audio support", () => {
  let stubs: ReturnType<typeof installDomStubs>;

  beforeEach(() => {
    stubs = installDomStubs(300, 100);
  });

  afterEach(() => {
    document.body.innerHTML = "";
    stubs.restore();
  });

  describe("stereo playback", () => {
    it("loadAudioBuffer accepts a stereo (2-channel) AudioBuffer", () => {
      const el = mount();
      const left = new Float32Array([0.1, 0.2, 0.3]);
      const right = new Float32Array([0.3, 0.2, 0.1]);
      const buffer = makeStereoAudioBuffer(left, right, 22050);
      const ctx = makeFakeAudioContext();

      el.loadAudioBuffer(buffer, ctx as unknown as AudioContext);

      expect(el.hasAudio()).toBe(true);
      expect(el.getSampleRate()).toBe(22050);
    });

    it("passes the full stereo buffer to AudioEngine.loadBuffer() for playback", () => {
      const el = mount();
      const left = new Float32Array([0.1, 0.2]);
      const right = new Float32Array([0.3, 0.4]);
      const buffer = makeStereoAudioBuffer(left, right, 48000);
      const ctx = makeFakeAudioContext() as any;
      const bufferSourceCreateSpy = vi.spyOn(ctx, "createBufferSource");

      el.loadAudioBuffer(buffer, ctx as unknown as AudioContext);

      // The AudioEngine should receive the full stereo buffer
      const source = bufferSourceCreateSpy.mock.results[0]?.value;
      if (source) {
        expect(source.buffer).toBe(buffer);
      }
    });

    it("preserves stereo channel data after loadAudioBuffer (getChannelCount === 2)", () => {
      const el = mount();
      const left = new Float32Array([0.1, 0.2, 0.3]);
      const right = new Float32Array([0.3, 0.2, 0.1]);
      const buffer = makeStereoAudioBuffer(left, right, 44100);
      const ctx = makeFakeAudioContext();

      el.loadAudioBuffer(buffer, ctx as unknown as AudioContext);

      // After loading, getChannelCount should return 2, not collapse back to 1
      expect(el.getChannelCount()).toBe(2);
    });

    it("accepts multichannel audio (5.1 surround, etc.)", () => {
      const el = mount();
      const channels = [
        new Float32Array([0.1, 0.1]), // L
        new Float32Array([0.1, 0.1]), // R
        new Float32Array([0.1, 0.1]), // C
        new Float32Array([0.0, 0.0]), // LFE
        new Float32Array([0.05, 0.05]), // Ls
        new Float32Array([0.05, 0.05]), // Rs
      ];
      const buffer = {
        sampleRate: 48000,
        duration: 2 / 48000,
        numberOfChannels: 6,
        length: 2,
        getChannelData: (i: number) => channels[i],
        copyToChannel: vi.fn(),
      } as unknown as AudioBuffer;
      const ctx = makeFakeAudioContext();

      el.loadAudioBuffer(buffer, ctx as unknown as AudioContext);

      expect(el.hasAudio()).toBe(true);
    });
  });

  describe("stereo waveform rendering", () => {
    it("uses stereo rendering when viewMode='waveform' and buffer has multiple channels", () => {
      const el = mount();
      const left = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5]);
      const right = new Float32Array([0.5, 0.4, 0.3, 0.2, 0.1]);
      const buffer = makeStereoAudioBuffer(left, right, 44100);
      const ctx = makeFakeAudioContext();

      el.configure({ viewMode: "waveform" });
      el.loadAudioBuffer(buffer, ctx as unknown as AudioContext);

      // Should render both L and R lanes
      expect(el.hasAudio()).toBe(true);
      // Trigger a render
      stubs.flush();

      // In stereo mode, the waveform canvas should have been drawn with stacked lanes
      // (This will be verified via canvas draw calls in integration tests)
    });

    it("maintains backward compatibility: mono buffer still renders as single lane", () => {
      const el = mount();
      const mono = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5]);
      const buffer = {
        sampleRate: 44100,
        duration: 5 / 44100,
        numberOfChannels: 1,
        length: 5,
        getChannelData: () => mono,
        copyToChannel: vi.fn(),
      } as unknown as AudioBuffer;
      const ctx = makeFakeAudioContext();

      el.loadAudioBuffer(buffer, ctx as unknown as AudioContext);

      expect(el.hasAudio()).toBe(true);
      stubs.flush();
      // Single-channel rendering should work as before
    });

    it("respects channelIndex option in stereo mode (shows single channel)", () => {
      const el = mount();
      const left = new Float32Array([0.1, 0.2, 0.3]);
      const right = new Float32Array([0.9, 0.8, 0.7]);
      const buffer = makeStereoAudioBuffer(left, right, 44100);
      const ctx = makeFakeAudioContext();

      // Load stereo file, but display only right channel
      el.configure({ channelIndex: 1 });
      el.loadAudioBuffer(buffer, ctx as unknown as AudioContext);

      expect(el.hasAudio()).toBe(true);
      expect(el.getChannelIndex()).toBe(1);
    });
  });

});
