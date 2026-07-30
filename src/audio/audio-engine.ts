export type PlaybackState = "idle" | "playing";

export interface AudioEngineEvents {
  onPlay?: (positionSample: number) => void;
  onStop?: (positionSample: number) => void;
  onLoop?: (positionSample: number) => void;
  onPositionChange?: (positionSample: number) => void;
}

/**
 * Thin wrapper around the native Web Audio API for playback of a decoded AudioBuffer.
 * Exposes `connectExternalNode` so a host app can splice its own processing (EQ, IR
 * convolution, etc.) into the signal chain between source and destination.
 */
export class AudioEngine {
  private context: AudioContext;
  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private externalNode: AudioNode | null = null;
  private state: PlaybackState = "idle";
  private startedAtContextTime = 0;
  private startedAtSample = 0;
  private loopRange: { startSample: number; endSample: number } | null = null;
  private rafHandle: number | null = null;
  private events: AudioEngineEvents;

  constructor(context: AudioContext, events: AudioEngineEvents = {}) {
    this.context = context;
    this.events = events;
  }

  loadBuffer(buffer: AudioBuffer): void {
    this.stop();
    this.buffer = buffer;
  }

  /** Inserts a user-supplied AudioNode between the source and destination. Pass null to remove it. */
  connectExternalNode(node: AudioNode | null): void {
    this.externalNode = node;
  }

  get playbackState(): PlaybackState {
    return this.state;
  }

  get sampleRate(): number {
    return this.buffer?.sampleRate ?? this.context.sampleRate;
  }

  setLoopRange(range: { startSample: number; endSample: number } | null): void {
    this.loopRange = range;
  }

  currentPositionSample(): number {
    if (this.state !== "playing") return this.startedAtSample;
    const elapsedSeconds = this.context.currentTime - this.startedAtContextTime;
    return this.startedAtSample + elapsedSeconds * this.sampleRate;
  }

  play(fromSample: number): void {
    if (!this.buffer) return;
    this.stopSourceOnly();

    const source = this.context.createBufferSource();
    source.buffer = this.buffer;

    const tail: AudioNode = this.externalNode ?? this.context.destination;
    if (this.externalNode) {
      this.externalNode.connect(this.context.destination);
    }
    source.connect(tail);

    const startSeconds = Math.max(0, fromSample / this.sampleRate);
    source.start(0, startSeconds);
    source.onended = () => this.handleSourceEnded();

    this.source = source;
    this.state = "playing";
    this.startedAtContextTime = this.context.currentTime;
    this.startedAtSample = fromSample;

    this.events.onPlay?.(fromSample);
    this.tick();
  }

  stop(): void {
    if (this.state !== "playing") return;
    const position = this.currentPositionSample();
    this.stopSourceOnly();
    this.startedAtSample = position;
    this.state = "idle";
    this.events.onStop?.(position);
  }

  toggle(fromSample: number): void {
    if (this.state === "playing") {
      this.stop();
    } else {
      this.play(fromSample);
    }
  }

  dispose(): void {
    this.stopSourceOnly();
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
  }

  private stopSourceOnly(): void {
    if (this.source) {
      this.source.onended = null;
      try {
        this.source.stop();
      } catch {
        // already stopped
      }
      this.source.disconnect();
      this.source = null;
    }
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
  }

  private handleSourceEnded(): void {
    if (this.state !== "playing") return;
    if (this.loopRange) {
      this.play(this.loopRange.startSample);
      this.events.onLoop?.(this.loopRange.startSample);
      return;
    }
    const position = this.currentPositionSample();
    this.state = "idle";
    this.startedAtSample = position;
    this.events.onStop?.(position);
  }

  private tick = (): void => {
    if (this.state !== "playing") return;
    const position = this.currentPositionSample();

    if (this.loopRange && position >= this.loopRange.endSample) {
      this.play(this.loopRange.startSample);
      this.events.onLoop?.(this.loopRange.startSample);
      return;
    }

    this.events.onPositionChange?.(position);
    this.rafHandle = requestAnimationFrame(this.tick);
  };
}
