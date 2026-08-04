import { beforeEach, describe, expect, it, vi } from "vitest";
import { RecorderEngine } from "./recorder-engine";

class FakeAudioParam {
  value = 0;
}

class FakeProcessor {
  onaudioprocess: ((e: unknown) => void) | null = null;
  connect = vi.fn();
  disconnect = vi.fn();
}

class FakeGain {
  gain = new FakeAudioParam();
  connect = vi.fn();
  disconnect = vi.fn();
}

class FakeSourceNode {
  channelCount = 1;
  connect = vi.fn();
  disconnect = vi.fn();
}

class FakeSplitterNode {
  connect = vi.fn();
  disconnect = vi.fn();
}

class FakeAudioContext {
  sampleRate = 48000;
  destination = {};
  closed = false;
  createMediaStreamSource = vi.fn(() => new FakeSourceNode());
  createScriptProcessor = vi.fn(() => new FakeProcessor());
  createGain = vi.fn(() => new FakeGain());
  createChannelSplitter = vi.fn(() => new FakeSplitterNode());
  close = vi.fn(() => {
    this.closed = true;
    return Promise.resolve();
  });
}

class FakeTrack {
  stop = vi.fn();
}

class FakeMediaStream {
  private tracks: FakeTrack[];
  constructor(tracks: FakeTrack[]) {
    this.tracks = tracks;
  }
  getTracks() {
    return this.tracks;
  }
}

describe("RecorderEngine stereo recording", () => {
  let getUserMedia: ReturnType<typeof vi.fn>;
  let contexts: FakeAudioContext[];
  let stream: FakeMediaStream;
  let tracks: FakeTrack[];

  beforeEach(() => {
    contexts = [];
    tracks = [new FakeTrack(), new FakeTrack()];
    stream = new FakeMediaStream(tracks);
    getUserMedia = vi.fn(async () => stream as unknown as MediaStream);
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    vi.stubGlobal(
      "AudioContext",
      vi.fn(function () {
        const ctx = new FakeAudioContext();
        contexts.push(ctx);
        return ctx;
      })
    );
  });

  describe("stereo recording support", () => {
    it("captures both L and R channels when channelIndex is null (new stereo mode)", async () => {
      const chunks: Float32Array[] = [];
      const engine = new RecorderEngine({
        onData: (chunk) => chunks.push(chunk),
      });

      const externalTracks = [new FakeTrack()];
      const externalStream = new FakeMediaStream(externalTracks) as unknown as MediaStream;
      const twoChannelSource = new FakeSourceNode();
      twoChannelSource.channelCount = 2;
      const ctx = new FakeAudioContext();
      ctx.createMediaStreamSource = vi.fn(() => twoChannelSource);
      vi.stubGlobal("AudioContext", vi.fn(function () { return ctx; }));

      // Pass null to indicate "capture all channels"
      await engine.start(externalStream, null as any);

      expect(engine.isRecording).toBe(true);
      expect(engine.getInputChannelCount()).toBe(2);

      // Should have created a splitter to capture both channels
      expect(ctx.createChannelSplitter).toHaveBeenCalledWith(2);
      // Should have created a 2-channel processor (stereo recording)
      expect(ctx.createScriptProcessor).toHaveBeenCalledWith(4096, 2, 1);
    });

    it("creates a 2-channel ScriptProcessor when recording stereo from a 2-channel input", async () => {
      const engine = new RecorderEngine();
      const externalTracks = [new FakeTrack()];
      const externalStream = new FakeMediaStream(externalTracks) as unknown as MediaStream;
      const twoChannelSource = new FakeSourceNode();
      twoChannelSource.channelCount = 2;
      const ctx = new FakeAudioContext();
      ctx.createMediaStreamSource = vi.fn(() => twoChannelSource);
      vi.stubGlobal("AudioContext", vi.fn(function () { return ctx; }));

      await engine.start(externalStream, null as any);

      const calls = ctx.createScriptProcessor.mock.calls;
      expect(calls[0]).toEqual([4096, 2, 1]); // 2-in, 1-out
    });

    it("routes both splitter channels into the stereo processor", async () => {
      const engine = new RecorderEngine();
      const externalTracks = [new FakeTrack()];
      const externalStream = new FakeMediaStream(externalTracks) as unknown as MediaStream;
      const twoChannelSource = new FakeSourceNode();
      twoChannelSource.channelCount = 2;
      const ctx = new FakeAudioContext();
      ctx.createMediaStreamSource = vi.fn(() => twoChannelSource);
      vi.stubGlobal("AudioContext", vi.fn(function () { return ctx; }));

      await engine.start(externalStream, null as any);

      const splitter = ctx.createChannelSplitter.mock.results[0].value as FakeSplitterNode;
      const processor = ctx.createScriptProcessor.mock.results[0].value as FakeProcessor;

      // Both channels should connect to the processor
      expect(splitter.connect).toHaveBeenCalledWith(processor, 0);
      expect(splitter.connect).toHaveBeenCalledWith(processor, 1);
    });

    it("interleaves stereo data from both channels in onData callback", async () => {
      const chunks: Float32Array[] = [];
      const engine = new RecorderEngine({
        onData: (chunk) => chunks.push(chunk),
      });

      const externalTracks = [new FakeTrack()];
      const externalStream = new FakeMediaStream(externalTracks) as unknown as MediaStream;
      const twoChannelSource = new FakeSourceNode();
      twoChannelSource.channelCount = 2;
      const ctx = new FakeAudioContext();
      ctx.createMediaStreamSource = vi.fn(() => twoChannelSource);
      vi.stubGlobal("AudioContext", vi.fn(function () { return ctx; }));

      await engine.start(externalStream, null as any);

      const processor = ctx.createScriptProcessor.mock.results[0].value as FakeProcessor;
      const leftData = new Float32Array([0.1, 0.2]);
      const rightData = new Float32Array([0.3, 0.4]);

      // Simulate audio process event with stereo input
      processor.onaudioprocess?.({
        inputBuffer: {
          length: 2,
          getChannelData: (i: number) => (i === 0 ? leftData : rightData),
        },
      });

      expect(chunks).toHaveLength(1);
      const chunk = chunks[0];
      // Should be interleaved: L0, R0, L1, R1
      expect(chunk).toEqual(new Float32Array([0.1, 0.3, 0.2, 0.4]));
    });

    it("is backward compatible: number-based channelIndex still extracts single channel", async () => {
      const chunks: Float32Array[] = [];
      const engine = new RecorderEngine({
        onData: (chunk) => chunks.push(chunk),
      });

      const externalTracks = [new FakeTrack()];
      const externalStream = new FakeMediaStream(externalTracks) as unknown as MediaStream;
      const twoChannelSource = new FakeSourceNode();
      twoChannelSource.channelCount = 2;
      const ctx = new FakeAudioContext();
      ctx.createMediaStreamSource = vi.fn(() => twoChannelSource);
      vi.stubGlobal("AudioContext", vi.fn(function () { return ctx; }));

      // Explicit channelIndex = 1 should use old behavior (single channel mode)
      await engine.start(externalStream, 1);

      const processor = ctx.createScriptProcessor.mock.results[0].value as FakeProcessor;
      const inputData = new Float32Array([0.2, 0.4]);

      processor.onaudioprocess?.({
        inputBuffer: { getChannelData: () => inputData },
      });

      // Should be mono (just the right channel), not interleaved
      expect(chunks[0]).toEqual(inputData);
    });

    it("supports stereo startMonitoring() with null channelIndex", async () => {
      const levels: number[] = [];
      const engine = new RecorderEngine({
        onLevel: (db) => levels.push(db),
      });

      const externalTracks = [new FakeTrack()];
      const externalStream = new FakeMediaStream(externalTracks) as unknown as MediaStream;
      const twoChannelSource = new FakeSourceNode();
      twoChannelSource.channelCount = 2;
      const ctx = new FakeAudioContext();
      ctx.createMediaStreamSource = vi.fn(() => twoChannelSource);
      vi.stubGlobal("AudioContext", vi.fn(function () { return ctx; }));

      await engine.startMonitoring(externalStream, null as any);

      expect(engine.getInputChannelCount()).toBe(2);
      expect(ctx.createScriptProcessor).toHaveBeenCalledWith(4096, 2, 1);
    });

    it("calculates peak level across all channels in stereo mode", async () => {
      const levels: number[] = [];
      const engine = new RecorderEngine({
        onLevel: (db) => levels.push(db),
      });

      const externalTracks = [new FakeTrack()];
      const externalStream = new FakeMediaStream(externalTracks) as unknown as MediaStream;
      const twoChannelSource = new FakeSourceNode();
      twoChannelSource.channelCount = 2;
      const ctx = new FakeAudioContext();
      ctx.createMediaStreamSource = vi.fn(() => twoChannelSource);
      vi.stubGlobal("AudioContext", vi.fn(function () { return ctx; }));

      await engine.startMonitoring(externalStream, null as any);

      const processor = ctx.createScriptProcessor.mock.results[0].value as FakeProcessor;
      const leftData = new Float32Array([0.3, 0.1]);
      const rightData = new Float32Array([0.2, 0.9]); // right channel has the peak

      processor.onaudioprocess?.({
        inputBuffer: {
          length: 2,
          getChannelData: (i: number) => (i === 0 ? leftData : rightData),
        },
      });

      expect(levels).toHaveLength(1);
      // Peak is 0.9 from right channel
      expect(levels[0]).toBeCloseTo(20 * Math.log10(0.9), 5);
    });
  });
});
