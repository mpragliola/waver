export interface RecorderEngineEvents {
  onData?: (chunk: Float32Array) => void;
}

/**
 * Captures mono microphone audio via getUserMedia + ScriptProcessorNode, streaming raw Float32
 * chunks to the caller as they arrive. The caller owns accumulation/buffering; this class only
 * owns the mic stream and its AudioContext.
 *
 * Uses ScriptProcessorNode (deprecated but universally supported, no separate worklet module to
 * bundle/fetch) rather than AudioWorklet, since this runs synchronously on the main thread with
 * no extra network/module-loading step.
 */
export class RecorderEngine {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private silentGain: GainNode | null = null;
  private recording = false;
  private events: RecorderEngineEvents;

  constructor(events: RecorderEngineEvents = {}) {
    this.events = events;
  }

  get isRecording(): boolean {
    return this.recording;
  }

  getSampleRate(): number {
    return this.context?.sampleRate ?? 44100;
  }

  /** Valid after start(); remains open after stop() so the caller can reuse it for playback. */
  getContext(): AudioContext | null {
    return this.context;
  }

  async start(): Promise<void> {
    if (this.recording) return;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const context = new AudioContext();
    const sourceNode = context.createMediaStreamSource(stream);
    const processor = context.createScriptProcessor(4096, 1, 1);
    const silentGain = context.createGain();
    silentGain.gain.value = 0;

    processor.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      const chunk = new Float32Array(input.length);
      chunk.set(input);
      this.events.onData?.(chunk);
    };

    // ScriptProcessorNode only fires onaudioprocess while connected through to a destination;
    // route through a silent gain so the mic is never actually audible.
    sourceNode.connect(processor);
    processor.connect(silentGain);
    silentGain.connect(context.destination);

    this.stream = stream;
    this.context = context;
    this.sourceNode = sourceNode;
    this.processor = processor;
    this.silentGain = silentGain;
    this.recording = true;
  }

  /** Stops capture and releases the mic, but leaves the AudioContext open for reuse (e.g. playback). */
  stop(): void {
    if (!this.recording) return;
    this.recording = false;
    this.releaseCaptureNodes();
  }

  /** Stops capture and fully tears down, including closing the AudioContext. */
  cancel(): void {
    if (!this.context) return;
    this.recording = false;
    this.releaseCaptureNodes();
    this.context.close().catch(() => {});
    this.context = null;
  }

  private releaseCaptureNodes(): void {
    this.processor?.disconnect();
    this.sourceNode?.disconnect();
    this.silentGain?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.processor = null;
    this.sourceNode = null;
    this.silentGain = null;
    this.stream = null;
  }
}
