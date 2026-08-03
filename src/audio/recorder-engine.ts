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

  /** Channels the opened source actually has. Valid after start(); 1 before. */
  getInputChannelCount(): number {
    return this.inputChannelCount;
  }

  /** Valid after start(); remains open after stop() so the caller can reuse it for playback. */
  getContext(): AudioContext | null {
    return this.context;
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
      const chunk = new Float32Array(input.length);
      chunk.set(input);
      this.events.onData?.(chunk);
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
