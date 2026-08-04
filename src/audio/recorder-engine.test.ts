import { beforeEach, describe, expect, it, vi } from "vitest";
import { peakAmplitudeToDb, RecorderEngine } from "./recorder-engine";

describe("peakAmplitudeToDb", () => {
  it("returns 0 for a full-scale peak", () => {
    expect(peakAmplitudeToDb(1)).toBeCloseTo(0, 5);
  });

  it("returns -Infinity for silence", () => {
    expect(peakAmplitudeToDb(0)).toBe(-Infinity);
  });

  it("returns -6.02dB for a half-scale peak", () => {
    expect(peakAmplitudeToDb(0.5)).toBeCloseTo(-6.02, 1);
  });
});

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

describe("RecorderEngine", () => {
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

  it("starts idle", () => {
    const engine = new RecorderEngine();
    expect(engine.isRecording).toBe(false);
  });

  it("requests mic access and wires nodes through a silent gain on start()", async () => {
    const engine = new RecorderEngine();
    await engine.start();

    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(engine.isRecording).toBe(true);

    const ctx = contexts[0];
    const source = ctx.createMediaStreamSource.mock.results[0].value as FakeSourceNode;
    const processor = ctx.createScriptProcessor.mock.results[0].value as FakeProcessor;
    const gain = ctx.createGain.mock.results[0].value as FakeGain;

    expect(gain.gain.value).toBe(0);
    expect(source.connect).toHaveBeenCalledWith(processor);
    expect(processor.connect).toHaveBeenCalledWith(gain);
    expect(gain.connect).toHaveBeenCalledWith(ctx.destination);
  });

  it("forwards captured chunks to onData", async () => {
    const onData = vi.fn();
    const engine = new RecorderEngine({ onData });
    await engine.start();

    const ctx = contexts[0];
    const processor = ctx.createScriptProcessor.mock.results[0].value as FakeProcessor;
    const inputData = new Float32Array([0.1, 0.2, 0.3]);
    processor.onaudioprocess?.({ inputBuffer: { getChannelData: () => inputData } });

    expect(onData).toHaveBeenCalledTimes(1);
    const chunk = onData.mock.calls[0][0] as Float32Array;
    expect(chunk).toEqual(inputData);
    // Must be a copy, not a view onto the (reused) input buffer.
    expect(chunk).not.toBe(inputData);
  });

  it("is a no-op to start() a second time while already recording", async () => {
    const engine = new RecorderEngine();
    await engine.start();
    await engine.start();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it("is a no-op to start() while already monitoring, without leaking the open graph", async () => {
    const engine = new RecorderEngine();
    await engine.startMonitoring();
    const ctx = contexts[0];
    const openStream = engine.getStream();

    await engine.start();

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(contexts).toHaveLength(1);
    expect(engine.getContext()).toBe(ctx);
    expect(engine.getStream()).toBe(openStream);
    expect(engine.isRecording).toBe(false); // start() no-opped, so it never flipped to recording
  });

  it("is a no-op to startMonitoring() while already recording", async () => {
    const engine = new RecorderEngine();
    await engine.start();
    const ctx = contexts[0];
    const openStream = engine.getStream();

    await engine.startMonitoring();

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(contexts).toHaveLength(1);
    expect(engine.getContext()).toBe(ctx);
    expect(engine.getStream()).toBe(openStream);
    expect(engine.isRecording).toBe(true); // still recording, startMonitoring() no-opped
  });

  it("reports sample rate from the active context, defaulting to 44100 before start()", async () => {
    const engine = new RecorderEngine();
    expect(engine.getSampleRate()).toBe(44100);
    await engine.start();
    expect(engine.getSampleRate()).toBe(48000);
  });

  it("stop() releases capture nodes and stops mic tracks but leaves the context open", async () => {
    const engine = new RecorderEngine();
    await engine.start();
    const ctx = contexts[0];
    const source = ctx.createMediaStreamSource.mock.results[0].value as FakeSourceNode;
    const processor = ctx.createScriptProcessor.mock.results[0].value as FakeProcessor;
    const gain = ctx.createGain.mock.results[0].value as FakeGain;

    engine.stop();

    expect(engine.isRecording).toBe(false);
    expect(processor.disconnect).toHaveBeenCalled();
    expect(source.disconnect).toHaveBeenCalled();
    expect(gain.disconnect).toHaveBeenCalled();
    tracks.forEach((t) => expect(t.stop).toHaveBeenCalled());
    expect(ctx.close).not.toHaveBeenCalled();
    expect(engine.getContext()).toBe(ctx);
  });

  it("stop() is a no-op when not recording", () => {
    const engine = new RecorderEngine();
    expect(() => engine.stop()).not.toThrow();
  });

  it("cancel() releases nodes and closes the context", async () => {
    const engine = new RecorderEngine();
    await engine.start();
    const ctx = contexts[0];

    engine.cancel();

    expect(engine.isRecording).toBe(false);
    expect(ctx.close).toHaveBeenCalled();
    expect(engine.getContext()).toBeNull();
  });

  it("cancel() is a no-op before start()", () => {
    const engine = new RecorderEngine();
    expect(() => engine.cancel()).not.toThrow();
  });

  it("allows starting a new recording after stop()", async () => {
    const engine = new RecorderEngine();
    await engine.start();
    engine.stop();
    await engine.start();

    expect(engine.isRecording).toBe(true);
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(contexts).toHaveLength(2);
  });

  it("allows restarting monitoring after stop()", async () => {
    const engine = new RecorderEngine();
    await engine.startMonitoring();
    engine.stop();
    await engine.startMonitoring();

    expect(engine.getStream()).not.toBeNull();
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(contexts).toHaveLength(2);
  });

  describe("with a caller-supplied MediaStream", () => {
    it("records from the given stream instead of acquiring one via getUserMedia", async () => {
      const externalTracks = [new FakeTrack()];
      const externalStream = new FakeMediaStream(externalTracks) as unknown as MediaStream;
      const engine = new RecorderEngine();

      await engine.start(externalStream);

      expect(getUserMedia).not.toHaveBeenCalled();
      expect(engine.isRecording).toBe(true);
      const ctx = contexts[0];
      expect(ctx.createMediaStreamSource).toHaveBeenCalledWith(externalStream);
    });

    it("does not stop tracks on a caller-supplied stream when stop() is called", async () => {
      const externalTracks = [new FakeTrack()];
      const externalStream = new FakeMediaStream(externalTracks) as unknown as MediaStream;
      const engine = new RecorderEngine();
      await engine.start(externalStream);

      engine.stop();

      externalTracks.forEach((t) => expect(t.stop).not.toHaveBeenCalled());
    });

    it("does not stop tracks on a caller-supplied stream when cancel() is called", async () => {
      const externalTracks = [new FakeTrack()];
      const externalStream = new FakeMediaStream(externalTracks) as unknown as MediaStream;
      const engine = new RecorderEngine();
      await engine.start(externalStream);

      engine.cancel();

      externalTracks.forEach((t) => expect(t.stop).not.toHaveBeenCalled());
    });
  });

  describe("channel selection", () => {
    it("connects the source directly (no splitter) when channelIndex is 0", async () => {
      const engine = new RecorderEngine();
      await engine.start(undefined, 0);

      const ctx = contexts[0];
      const source = ctx.createMediaStreamSource.mock.results[0].value as FakeSourceNode;
      const processor = ctx.createScriptProcessor.mock.results[0].value as FakeProcessor;
      expect(ctx.createChannelSplitter).not.toHaveBeenCalled();
      expect(source.connect).toHaveBeenCalledWith(processor);
    });

    it("splits and connects only the requested channel when channelIndex > 0 and the source has enough channels", async () => {
      const engine = new RecorderEngine();
      const externalTracks = [new FakeTrack(), new FakeTrack()];
      const externalStream = new FakeMediaStream(externalTracks) as unknown as MediaStream;

      // Simulate a 2-channel source: patch the next createMediaStreamSource call's result.
      const twoChannelSource = new FakeSourceNode();
      twoChannelSource.channelCount = 2;
      const ctx = new FakeAudioContext();
      ctx.createMediaStreamSource = vi.fn(() => twoChannelSource);
      vi.stubGlobal(
        "AudioContext",
        vi.fn(function () {
          return ctx;
        })
      );

      await engine.start(externalStream, 1);

      const splitter = ctx.createChannelSplitter.mock.results[0].value as FakeSplitterNode;
      const processor = ctx.createScriptProcessor.mock.results[0].value as FakeProcessor;
      expect(ctx.createChannelSplitter).toHaveBeenCalledWith(2);
      expect(twoChannelSource.connect).toHaveBeenCalledWith(splitter);
      expect(splitter.connect).toHaveBeenCalledWith(processor, 1);
      expect(engine.getInputChannelCount()).toBe(2);
    });

    it("falls back to channel 0 when the requested channel is beyond what the source has", async () => {
      const engine = new RecorderEngine();
      await engine.start(undefined, 5); // default fake source is 1-channel

      const ctx = contexts[0];
      const source = ctx.createMediaStreamSource.mock.results[0].value as FakeSourceNode;
      const processor = ctx.createScriptProcessor.mock.results[0].value as FakeProcessor;
      expect(ctx.createChannelSplitter).not.toHaveBeenCalled();
      expect(source.connect).toHaveBeenCalledWith(processor);
    });

    it("getInputChannelCount() reports 1 before start()", () => {
      const engine = new RecorderEngine();
      expect(engine.getInputChannelCount()).toBe(1);
    });
  });

  describe("startMonitoring()", () => {
    it("opens a mic graph and fires onLevel instead of onData", async () => {
      const onData = vi.fn();
      const onLevel = vi.fn();
      const engine = new RecorderEngine({ onData, onLevel });

      await engine.startMonitoring();

      expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
      expect(engine.isRecording).toBe(false); // monitoring is not "recording"

      const ctx = contexts[0];
      const processor = ctx.createScriptProcessor.mock.results[0].value as FakeProcessor;
      const inputData = new Float32Array([0.1, -0.5, 0.3]);
      processor.onaudioprocess?.({ inputBuffer: { getChannelData: () => inputData } });

      expect(onData).not.toHaveBeenCalled();
      expect(onLevel).toHaveBeenCalledTimes(1);
      const db = onLevel.mock.calls[0][0] as number;
      expect(db).toBeCloseTo(20 * Math.log10(0.5), 5); // peak of the chunk is |-0.5|
    });

    it("wires the same silent-gain routing as start()", async () => {
      const engine = new RecorderEngine();
      await engine.startMonitoring();

      const ctx = contexts[0];
      const source = ctx.createMediaStreamSource.mock.results[0].value as FakeSourceNode;
      const processor = ctx.createScriptProcessor.mock.results[0].value as FakeProcessor;
      const gain = ctx.createGain.mock.results[0].value as FakeGain;

      expect(gain.gain.value).toBe(0);
      expect(source.connect).toHaveBeenCalledWith(processor);
      expect(processor.connect).toHaveBeenCalledWith(gain);
      expect(gain.connect).toHaveBeenCalledWith(ctx.destination);
    });

    it("stop() tears down monitoring nodes and stops owned mic tracks", async () => {
      const engine = new RecorderEngine();
      await engine.startMonitoring();
      const ctx = contexts[0];
      const processor = ctx.createScriptProcessor.mock.results[0].value as FakeProcessor;

      engine.stop();

      expect(processor.disconnect).toHaveBeenCalled();
      tracks.forEach((t) => expect(t.stop).toHaveBeenCalled());
    });

    it("getStream() returns the open stream while monitoring, null otherwise", async () => {
      const engine = new RecorderEngine();
      expect(engine.getStream()).toBeNull();
      await engine.startMonitoring();
      expect(engine.getStream()).toBe(stream);
      engine.stop();
      expect(engine.getStream()).toBeNull();
    });

    it("respects channelIndex the same way start() does", async () => {
      const engine = new RecorderEngine();
      const externalTracks = [new FakeTrack(), new FakeTrack()];
      const externalStream = new FakeMediaStream(externalTracks) as unknown as MediaStream;
      const twoChannelSource = new FakeSourceNode();
      twoChannelSource.channelCount = 2;
      const ctx = new FakeAudioContext();
      ctx.createMediaStreamSource = vi.fn(() => twoChannelSource);
      vi.stubGlobal("AudioContext", vi.fn(function () { return ctx; }));

      await engine.startMonitoring(externalStream, 1);

      const splitter = ctx.createChannelSplitter.mock.results[0].value as FakeSplitterNode;
      expect(splitter.connect).toHaveBeenCalledWith(ctx.createScriptProcessor.mock.results[0].value, 1);
    });

    it("releaseNodesOnly() disconnects nodes without stopping tracks, even for a self-acquired stream", async () => {
      const engine = new RecorderEngine();
      await engine.startMonitoring(); // no explicit stream -> acquired via getUserMedia -> ownsStream is true
      const ctx = contexts[0];
      const processor = ctx.createScriptProcessor.mock.results[0].value as FakeProcessor;

      engine.releaseNodesOnly();

      expect(processor.disconnect).toHaveBeenCalled();
      tracks.forEach((t) => expect(t.stop).not.toHaveBeenCalled());
      expect(engine.getStream()).toBeNull();
    });
  });
});
