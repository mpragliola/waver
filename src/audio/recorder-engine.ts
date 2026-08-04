export interface RecorderEngineEvents {
  onData?: (chunk: Float32Array) => void;
  onLevel?: (db: number) => void;
}

/** Converts a linear peak amplitude (0-1) to dBFS. Silence (0) maps to -Infinity rather than NaN. */
export function peakAmplitudeToDb(peak: number): number {
  return peak > 0 ? 20 * Math.log10(peak) : -Infinity;
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
  /** Only stop() the stream's tracks on teardown if we acquired it ourselves via getUserMedia; a
   * caller-supplied stream (WebRTC track, shared device stream, etc.) is theirs to manage. */
  private ownsStream = false;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private splitterNode: ChannelSplitterNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private silentGain: GainNode | null = null;
  private recording = false;
  private inputChannelCount = 1;
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

  /** Channels the opened source actually has. Valid after start()/startMonitoring(); 1 before. */
  getInputChannelCount(): number {
    return this.inputChannelCount;
  }

  /** Valid after start()/startMonitoring(); remains open after stop() so the caller can reuse it for playback. */
  getContext(): AudioContext | null {
    return this.context;
  }

  /** The currently-open MediaStream, or null if no graph is open. Lets a caller hand this stream
   * to a second RecorderEngine (e.g. monitoring -> recording handoff) without reopening the mic. */
  getStream(): MediaStream | null {
    return this.stream;
  }

  /**
   * Starts capture. Pass an existing `MediaStream` to record from it directly (a specific
   * device chosen by the host app, a WebRTC remote track, a screen-share audio track, etc.);
   * Waver has no business picking an input device itself. Omit it to fall back to the browser's
   * default mic via getUserMedia.
   *
   * `channelIndex` picks which channel of a multi-channel source to keep (0-based) — picked, not
   * summed, since summing a mic on one input with a silent other input costs 6 dB and can comb the
   * signal. Falls back to channel 0 if the source has fewer channels than requested.
   */
  async start(stream?: MediaStream, channelIndex = 0): Promise<void> {
    if (this.recording) return;
    await this.openGraph(stream, channelIndex, (chunk) => this.events.onData?.(chunk));
    this.recording = true;
  }

  /**
   * Opens the mic and reports live peak levels via `onLevel`, without invoking `onData` or
   * accumulating any samples. Shares the same node graph as `start()`; the caller is responsible
   * for treating this as a distinct (non-"recording") state, since `isRecording` stays false.
   */
  async startMonitoring(stream?: MediaStream, channelIndex = 0): Promise<void> {
    if (this.context) return; // already open (monitoring or recording)
    await this.openGraph(stream, channelIndex, undefined, (db) => this.events.onLevel?.(db));
  }

  private async openGraph(
    stream: MediaStream | undefined,
    channelIndex: number,
    onChunk: ((chunk: Float32Array) => void) | undefined,
    onLevel?: (db: number) => void
  ): Promise<void> {
    const mediaStream = stream ?? (await navigator.mediaDevices.getUserMedia({ audio: true }));
    const context = new AudioContext();
    const sourceNode = context.createMediaStreamSource(mediaStream);
    const processor = context.createScriptProcessor(4096, 1, 1);
    const silentGain = context.createGain();
    silentGain.gain.value = 0;

    this.inputChannelCount = sourceNode.channelCount;
    const activeChannel = channelIndex > 0 && channelIndex < this.inputChannelCount ? channelIndex : 0;

    let splitterNode: ChannelSplitterNode | null = null;
    if (activeChannel > 0) {
      splitterNode = context.createChannelSplitter(this.inputChannelCount);
      sourceNode.connect(splitterNode);
      splitterNode.connect(processor, activeChannel);
    } else {
      sourceNode.connect(processor);
    }

    processor.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      if (onChunk) {
        const chunk = new Float32Array(input.length);
        chunk.set(input);
        onChunk(chunk);
      }
      if (onLevel) {
        let peak = 0;
        for (let i = 0; i < input.length; i++) {
          const abs = Math.abs(input[i]);
          if (abs > peak) peak = abs;
        }
        onLevel(peakAmplitudeToDb(peak));
      }
    };

    // ScriptProcessorNode only fires onaudioprocess while connected through to a destination;
    // route through a silent gain so the mic is never actually audible.
    processor.connect(silentGain);
    silentGain.connect(context.destination);

    this.stream = mediaStream;
    this.ownsStream = stream === undefined;
    this.context = context;
    this.sourceNode = sourceNode;
    this.splitterNode = splitterNode;
    this.processor = processor;
    this.silentGain = silentGain;
  }

  /** Stops capture/monitoring and releases the mic, but leaves the AudioContext open for reuse (e.g. playback). */
  stop(): void {
    if (!this.context) return;
    this.recording = false;
    this.releaseCaptureNodes();
  }

  /** Stops capture/monitoring and fully tears down, including closing the AudioContext. */
  cancel(): void {
    if (!this.context) return;
    this.recording = false;
    this.releaseCaptureNodes();
    this.context.close().catch(() => {});
    this.context = null;
  }

  private releaseCaptureNodes(): void {
    this.processor?.disconnect();
    this.splitterNode?.disconnect();
    this.sourceNode?.disconnect();
    this.silentGain?.disconnect();
    if (this.ownsStream) this.stream?.getTracks().forEach((t) => t.stop());
    this.processor = null;
    this.splitterNode = null;
    this.sourceNode = null;
    this.silentGain = null;
    this.stream = null;
    this.ownsStream = false;
  }
}
