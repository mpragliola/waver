import { beforeEach, describe, expect, it, vi } from "vitest";
import { AudioEngine } from "./audio-engine";

class FakeAudioParam {
  value = 1;
}

class FakeBufferSource {
  buffer: FakeAudioBuffer | null = null;
  onended: (() => void) | null = null;
  playbackRate = new FakeAudioParam();
  private started = false;
  connect = vi.fn();
  disconnect = vi.fn();
  start(_when: number, _offset: number) {
    this.started = true;
  }
  stop() {
    if (this.started) this.onended?.();
  }
}

class FakeAudioBuffer {
  sampleRate: number;
  duration: number;
  numberOfChannels = 1;
  constructor(sampleRate: number, duration: number) {
    this.sampleRate = sampleRate;
    this.duration = duration;
  }
}

class FakeAudioContext {
  currentTime = 0;
  destination = {};
  createBufferSource() {
    return new FakeBufferSource();
  }
}

describe("AudioEngine", () => {
  let ctx: FakeAudioContext;
  let engine: AudioEngine;
  let buffer: FakeAudioBuffer;

  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    ctx = new FakeAudioContext();
    buffer = new FakeAudioBuffer(1000, 10); // 1000 samples/sec
    engine = new AudioEngine(ctx as unknown as AudioContext);
    engine.loadBuffer(buffer as unknown as AudioBuffer);
  });

  it("starts idle", () => {
    expect(engine.playbackState).toBe("idle");
  });

  it("transitions to playing on play()", () => {
    engine.play(0);
    expect(engine.playbackState).toBe("playing");
  });

  it("reports advancing position while playing", () => {
    engine.play(0);
    ctx.currentTime = 2; // 2 seconds elapsed at 1000 samples/sec
    expect(engine.currentPositionSample()).toBeCloseTo(2000);
  });

  it("stops and freezes the position", () => {
    engine.play(0);
    ctx.currentTime = 1;
    engine.stop();
    expect(engine.playbackState).toBe("idle");
    expect(engine.currentPositionSample()).toBeCloseTo(1000);
  });

  it("toggle() flips between playing and idle", () => {
    engine.toggle(0);
    expect(engine.playbackState).toBe("playing");
    engine.toggle(0);
    expect(engine.playbackState).toBe("idle");
  });

  it("routes through an external node when connected", () => {
    const externalNode = { connect: vi.fn() };
    engine.connectExternalNode(externalNode as unknown as AudioNode);
    engine.play(0);
    expect(externalNode.connect).toHaveBeenCalledWith(ctx.destination);
  });

  it("fires onPlay/onStop callbacks", () => {
    const onPlay = vi.fn();
    const onStop = vi.fn();
    const e2 = new AudioEngine(ctx as unknown as AudioContext, { onPlay, onStop });
    e2.loadBuffer(buffer as unknown as AudioBuffer);
    e2.play(0);
    expect(onPlay).toHaveBeenCalledWith(0);
    e2.stop();
    expect(onStop).toHaveBeenCalled();
  });
});
