export interface RecorderEngineEvents {
  onData?: (chunk: Float32Array) => void;
  onLevel?: (db: number) => void;
}

/** Converts a linear peak amplitude (0-1) to dBFS. Silence (0) maps to -Infinity rather than NaN. */
export function peakAmplitudeToDb(peak: number): number {
  return peak > 0 ? 20 * Math.log10(peak) : -Infinity;
}

/**
 * Captures audio via getUserMedia + ScriptProcessorNode, streaming raw Float32
 * chunks to the caller as they arrive. The caller owns accumulation/buffering; this class only
 * owns the mic stream and its AudioContext.
 *
 * Supports both mono (single channel selection via channelIndex number) and stereo (all channels
 * via channelIndex null/undefined) recording.
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
  private recordingChannelCount = 1;
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

  /** Channels being recorded/monitored (1 in mono mode, N in stereo mode). */
  getRecordingChannelCount(): number {
    return this.recordingChannelCount;
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
   * `channelIndex`: pass a number (0, 1, ...) to record a single channel (backward-compat mode);
   * pass null/undefined to record all channels in stereo/multichannel mode.
   * Single-channel mode picks (not sums) to avoid comb-filtering. Falls back to channel 0 if out
   * of range.
   */
  async start(stream?: MediaStream, channelIndex: number | null = 0): Promise<void> {
    if (this.processor) return; // a capture/monitoring graph is already open
    await this.openGraph(stream, channelIndex, (chunk) => this.events.onData?.(chunk));
    this.recording = true;
  }

  /**
   * Opens the mic and reports live peak levels via `onLevel`, without invoking `onData` or
   * accumulating any samples. Shares the same node graph as `start()`; the caller is responsible
   * for treating this as a distinct (non-"recording") state, since `isRecording` stays false.
   */
  async startMonitoring(stream?: MediaStream, channelIndex: number | null = 0): Promise<void> {
    if (this.processor) return; // a capture/monitoring graph is already open
    await this.openGraph(stream, channelIndex, undefined, (db) => this.events.onLevel?.(db));
  }

  private async openGraph(
    stream: MediaStream | undefined,
    channelIndex: number | null,
    onChunk: ((chunk: Float32Array) => void) | undefined,
    onLevel?: (db: number) => void
  ): Promise<void> {
    const mediaStream = stream ?? (await navigator.mediaDevices.getUserMedia({ audio: true }));
    const context = new AudioContext();
    const sourceNode = context.createMediaStreamSource(mediaStream);

    this.inputChannelCount = sourceNode.channelCount;
    const stereoMode = channelIndex === null || channelIndex === undefined;
    const recordChannels = stereoMode ? this.inputChannelCount : 1;
    this.recordingChannelCount = recordChannels;

    const processor = context.createScriptProcessor(4096, recordChannels, 1);
    const silentGain = context.createGain();
    silentGain.gain.value = 0;

    let splitterNode: ChannelSplitterNode | null = null;
    if (stereoMode && this.inputChannelCount > 1) {
      // Stereo mode: split all channels and connect each to processor
      splitterNode = context.createChannelSplitter(this.inputChannelCount);
      sourceNode.connect(splitterNode);
      for (let i = 0; i < this.inputChannelCount; i++) {
        splitterNode.connect(processor, i);
      }
    } else if (!stereoMode) {
      // Single-channel mode: use channel selection
      const activeChannel =
        typeof channelIndex === "number" && channelIndex > 0 && channelIndex < this.inputChannelCount
          ? channelIndex
          : 0;
      if (activeChannel > 0) {
        splitterNode = context.createChannelSplitter(this.inputChannelCount);
        sourceNode.connect(splitterNode);
        splitterNode.connect(processor, activeChannel);
      } else {
        sourceNode.connect(processor);
      }
    } else {
      sourceNode.connect(processor);
    }

    processor.onaudioprocess = (e) => {
      if (stereoMode && this.inputChannelCount > 1) {
        // Interleave stereo data: L0, R0, L1, R1, ...
        const interleaved = new Float32Array(e.inputBuffer.length * this.inputChannelCount);
        for (let i = 0; i < e.inputBuffer.length; i++) {
          for (let ch = 0; ch < this.inputChannelCount; ch++) {
            interleaved[i * this.inputChannelCount + ch] = e.inputBuffer.getChannelData(ch)[i];
          }
        }
        if (onChunk) {
          onChunk(interleaved);
        }
        if (onLevel) {
          let peak = 0;
          for (let i = 0; i < interleaved.length; i++) {
            const abs = Math.abs(interleaved[i]);
            if (abs > peak) peak = abs;
          }
          onLevel(peakAmplitudeToDb(peak));
        }
      } else {
        // Single-channel mode (backward compat)
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

  /** Releases this engine's processing nodes WITHOUT stopping the stream's tracks, even if this
   * engine acquired the stream itself. For handing an open stream off to a different RecorderEngine
   * instance (e.g. monitoring -> recording) without an audible drop or a second permission prompt. */
  releaseNodesOnly(): void {
    if (!this.context) return;
    this.recording = false;
    this.processor?.disconnect();
    this.splitterNode?.disconnect();
    this.sourceNode?.disconnect();
    this.silentGain?.disconnect();
    this.context.close().catch(() => {});
    this.context = null;
    this.processor = null;
    this.splitterNode = null;
    this.sourceNode = null;
    this.silentGain = null;
    this.stream = null;
    this.ownsStream = false;
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
