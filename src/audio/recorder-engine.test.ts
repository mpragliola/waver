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
});
