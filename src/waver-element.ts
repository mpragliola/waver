import { AudioEngine } from "./audio/audio-engine";
import { RecorderEngine } from "./audio/recorder-engine";
import { GrowableFloat32Buffer } from "./core/growable-buffer";
import { ensureGoogleFont } from "./core/font-loader";
import { closeIcon, micIcon, stopIcon, uploadIcon } from "./core/icons";
import { createPeaksCache } from "./core/peaks";
import { normalizeSelection } from "./core/selection";
import { SpectrogramCache, readVisibleSpectrogramColumns } from "./core/spectrogram-cache";
import { darkTheme, resolveTheme } from "./core/theme";
import type { SelectionEventDetail, SelectionRange, ViewMode, WaverEventMap, WaverOptions, WaverTheme, ZoomState } from "./core/types";
import { clampOffset, fullZoom, recordZoom, visibleSampleRange, type ViewportConfig } from "./core/viewport";
import { PointerController } from "./interaction/pointer-controller";
import { TouchGestureController, type TouchPoint } from "./interaction/touch-gesture-controller";
import { applyWheel } from "./interaction/wheel-controller";
import { setupHiDPICanvas } from "./render/canvas-utils";
import { renderMinimap } from "./render/minimap-renderer";
import { renderCursor, renderHoverLine, renderSelection } from "./render/overlay-renderer";
import { renderRuler } from "./render/ruler-renderer";
import { renderSpectrogram } from "./render/spectrogram-renderer";
import { renderWaveform } from "./render/waveform-renderer";

/** Duration of the selection-edge accent glow's fade-in. */
const ACCENT_FADE_MS = 150;

/** Duration of the eased animation applied to every setZoom() change (pan and/or zoom level). */
const ZOOM_ANIM_MS = 220;

/** Wheel events closer together than this (ms) are treated as one continuous gesture and skip easing. */
const WHEEL_GESTURE_GAP_MS = 120;

function easeOutCubic(t: number): number {
  const inv = 1 - t;
  return 1 - inv * inv * inv;
}

const DEFAULT_OPTIONS: WaverOptions = {
  height: 100,
  minimapHeightRatio: 0.2,
  theme: {},
  showZeroLine: false,
  roundedCorners: true,
  showMinimap: true,
  showRuler: true,
  rulerTimeFormat: "time",
  rulerHeight: 16,
  loadButton: "enabled",
  recordButton: "enabled",
  cancelButton: "enabled",
  channelIndex: 0,
  viewMode: "waveform",
  recordViewMode: "scroll",
  recordWindowSeconds: 2,
  spectrogramFftSize: 2048,
  spectrogramHop: 512,
  spectrogramFreqBins: 128,
};

/**
 * `<wave-r>` — a fast, dependency-free waveform display and interaction component.
 * Framework-agnostic custom element; see `waver/react` and `waver/vue` for thin wrappers.
 */
export class WaverElement extends HTMLElement {
  private shadow: ShadowRoot;
  private container: HTMLDivElement;
  private rulerCanvas: HTMLCanvasElement;
  private waveStack: HTMLDivElement;
  private waveformCanvas: HTMLCanvasElement;
  private overlayCanvas: HTMLCanvasElement;
  private minimapCanvas: HTMLCanvasElement;
  private rulerCtx: CanvasRenderingContext2D | null = null;
  private waveformCtx: CanvasRenderingContext2D | null = null;
  private overlayCtx: CanvasRenderingContext2D | null = null;
  private minimapCtx: CanvasRenderingContext2D | null = null;

  private samples: Float32Array = new Float32Array(0);
  private sampleRate = 44100;
  private zoom: ZoomState = { samplesPerPixel: 1, offsetSample: 0 };
  private selection: SelectionRange | null = null;
  private cursorSample = 0;
  private theme: WaverTheme = darkTheme;
  private opts: WaverOptions = { ...DEFAULT_OPTIONS };

  private resizeObserver: ResizeObserver | null = null;
  private pointerController: PointerController;
  private touchGestureController: TouchGestureController;
  private activeTouches: TouchPoint[] = [];
  /**
   * Touch-type pointerIds currently down, tracked via Pointer Events. `touchstart` (which drives
   * activeTouches/TouchGestureController) fires AFTER the 2nd finger's own `pointerdown` — so
   * gating on activeTouches would let that 2nd pointerdown start its own drag before the
   * touchstart handler ever runs. This set is updated synchronously inside the pointer handlers
   * themselves, closing that race.
   */
  private activeTouchPointerIds = new Set<number>();
  private audioEngine: AudioEngine | null = null;

  private emptyOverlay: HTMLDivElement;
  private loadButtonEl: HTMLButtonElement;
  private recordButtonEl: HTMLButtonElement;
  private cancelButtonEl: HTMLButtonElement;
  private recordingBar: HTMLDivElement;
  private recordingTimeEl: HTMLSpanElement;
  private fileInput: HTMLInputElement;
  private internalAudioContext: AudioContext | null = null;
  private recorderEngine: RecorderEngine | null = null;
  /** Set via `inputStream`; used by startRecording() (including the built-in Record button) when
   * called with no explicit stream argument. Lets a host app pick the input device ahead of time
   * without having to intercept every place recording can be triggered. */
  private presetInputStream: MediaStream | null = null;
  private recordingState: "idle" | "recording" = "idle";
  private recordingBuffer = new GrowableFloat32Buffer();
  private recordingStartedAt = 0;
  private recordingTimerHandle: number | null = null;

  private accentTarget: "start" | "end" | null = null;
  private accentEdge: "start" | "end" | null = null;
  private accentAlpha = 0;
  private accentAnimFromAlpha = 0;
  private accentAnimStart = 0;
  private zoomAnimActive = false;
  private zoomAnimFrom: ZoomState = { samplesPerPixel: 1, offsetSample: 0 };
  private zoomAnimTo: ZoomState = { samplesPerPixel: 1, offsetSample: 0 };
  private zoomAnimStart = 0;
  private lastWheelTime = 0;
  private hoverPixel: number | null = null;
  private raf: number | null = null;

  /** Memoized per canvas: the underlying scan is skipped unless samples/range/width actually changed. */
  private readonly getWaveformPeaks = createPeaksCache();
  private readonly getMinimapPeaks = createPeaksCache();
  private readonly spectrogramCache = new SpectrogramCache();

  /**
   * Identity of the last drawn waveform layer (background + peak path + zero line). Cursor,
   * selection, and the hover line live on `overlayCanvas` instead and repaint every frame, so the
   * (comparatively expensive) waveform layer only needs to repaint when one of these actually
   * changed — not on every cursor tick during playback or pointer move.
   */
  private lastWaveformPeaks: Float32Array | null = null;
  private lastWaveformShowZeroLine = false;
  private lastWaveformTheme: WaverTheme | null = null;
  private lastWaveformHeight = -1;

  /** Same skip-redraw idea as the waveform layer above, applied to the spectrogram layer. */
  private lastSpectrogramColumns: Float32Array | null = null;
  private lastSpectrogramTheme: WaverTheme | null = null;
  private lastSpectrogramHeight = -1;

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: "open" });

    this.container = document.createElement("div");
    this.container.className = "waver-container";

    this.rulerCanvas = document.createElement("canvas");
    this.rulerCanvas.className = "waver-ruler";

    this.waveformCanvas = document.createElement("canvas");
    this.waveformCanvas.className = "waver-waveform";
    this.overlayCanvas = document.createElement("canvas");
    this.overlayCanvas.className = "waver-overlay";
    this.minimapCanvas = document.createElement("canvas");
    this.minimapCanvas.className = "waver-minimap";

    this.waveStack = document.createElement("div");
    this.waveStack.className = "waver-wave-stack";
    this.waveStack.append(this.waveformCanvas, this.overlayCanvas);

    this.emptyOverlay = document.createElement("div");
    this.emptyOverlay.className = "waver-empty-overlay";
    this.loadButtonEl = document.createElement("button");
    this.loadButtonEl.type = "button";
    this.loadButtonEl.className = "waver-action-btn";
    this.loadButtonEl.innerHTML = `${uploadIcon}<span>Load File</span>`;
    this.recordButtonEl = document.createElement("button");
    this.recordButtonEl.type = "button";
    this.recordButtonEl.className = "waver-action-btn waver-action-btn--record";
    this.recordButtonEl.innerHTML = `${micIcon}<span>Record</span>`;
    this.emptyOverlay.append(this.loadButtonEl, this.recordButtonEl);

    this.cancelButtonEl = document.createElement("button");
    this.cancelButtonEl.type = "button";
    this.cancelButtonEl.className = "waver-cancel-btn";
    this.cancelButtonEl.innerHTML = closeIcon;
    this.cancelButtonEl.setAttribute("aria-label", "Cancel");

    this.recordingBar = document.createElement("div");
    this.recordingBar.className = "waver-recording-bar";
    this.recordingTimeEl = document.createElement("span");
    this.recordingTimeEl.className = "waver-recording-time";
    this.recordingTimeEl.textContent = "0:00";
    const stopButton = document.createElement("button");
    stopButton.type = "button";
    stopButton.className = "waver-action-btn waver-action-btn--stop";
    stopButton.innerHTML = `${stopIcon}<span>Stop</span>`;
    const recordingDot = document.createElement("span");
    recordingDot.className = "waver-recording-dot";
    const recordingReadout = document.createElement("div");
    recordingReadout.className = "waver-recording-readout";
    recordingReadout.append(recordingDot, this.recordingTimeEl);
    this.recordingBar.append(recordingReadout, stopButton);

    this.fileInput = document.createElement("input");
    this.fileInput.type = "file";
    this.fileInput.accept = "audio/*";
    this.fileInput.className = "waver-file-input";

    this.container.append(
      this.rulerCanvas,
      this.waveStack,
      this.minimapCanvas,
      this.emptyOverlay,
      this.cancelButtonEl,
      this.recordingBar,
      this.fileInput
    );
    this.shadow.append(styleSheet(), this.container);

    this.loadButtonEl.addEventListener("click", () => {
      if (this.opts.loadButton !== "enabled") return;
      this.fileInput.click();
    });
    this.recordButtonEl.addEventListener("click", () => {
      if (this.opts.recordButton !== "enabled") return;
      void this.startRecording();
    });
    stopButton.addEventListener("click", () => this.stopRecording());
    this.cancelButtonEl.addEventListener("click", () => {
      if (this.opts.cancelButton !== "enabled") return;
      this.openCancelConfirm();
    });
    this.fileInput.addEventListener("change", () => void this.handleFileInputChange());

    this.pointerController = new PointerController({
      getZoom: () => this.zoom,
      getSelection: () => this.selection,
      getTotalSamples: () => this.samples.length,
      setSelection: (s, final) => this.setSelection(s, final),
      commitSelection: () => this.commitSelection(),
      setCursor: (sample) => this.seekTo(sample),
    });

    this.touchGestureController = new TouchGestureController({
      getZoom: () => this.zoom,
      getViewportConfig: () => this.viewportConfig(),
    });

    this.attachRulerListeners();
    this.attachWaveformListeners();
    this.attachMinimapListeners();
  }

  connectedCallback(): void {
    this.applyTheme(this.theme);
    this.resizeObserver = new ResizeObserver(() => this.render());
    this.resizeObserver.observe(this.container);
    this.updateOverlay();
    this.render();
  }

  disconnectedCallback(): void {
    this.resizeObserver?.disconnect();
    this.audioEngine?.dispose();
    this.recorderEngine?.cancel();
    this.stopRecordingTimerDisplay();
    this.spectrogramCache.dispose();
    if (this.raf !== null) cancelAnimationFrame(this.raf);
  }

  // ---- Public API -------------------------------------------------------

  configure(options: Partial<WaverOptions>): void {
    const viewModeChanged = options.viewMode !== undefined && options.viewMode !== this.opts.viewMode;
    this.opts = { ...this.opts, ...options };
    if (options.theme) this.applyTheme(resolveTheme(this.theme, options.theme));
    if (viewModeChanged) this.emit("waver:viewmodechange", { viewMode: this.opts.viewMode });
    this.updateOverlay();
    this.render();
  }

  loadSamples(samples: Float32Array, sampleRate: number): void {
    this.samples = samples;
    this.sampleRate = sampleRate;
    this.selection = null;
    this.cursorSample = 0;
    this.zoom = fullZoom(this.viewportConfig());
    this.updateOverlay();
    this.render();
  }

  /** Erases any loaded/recorded audio and returns to the empty-button state, cancelling an in-progress recording if any. */
  reset(): void {
    if (this.recordingState === "recording") {
      this.recorderEngine?.cancel();
      this.recorderEngine = null;
      this.recordingState = "idle";
      this.stopRecordingTimerDisplay();
    }
    if (this.raf !== null) {
      cancelAnimationFrame(this.raf);
      this.raf = null;
    }
    this.zoomAnimActive = false;
    this.recordingBuffer.reset();
    this.audioEngine?.dispose();
    this.audioEngine = null;
    this.spectrogramCache.dispose();
    this.samples = new Float32Array(0);
    this.sampleRate = 44100;
    this.selection = null;
    this.cursorSample = 0;
    this.zoom = fullZoom(this.viewportConfig());
    this.updateOverlay();
    this.emit("waver:reset", {});
    this.render();
  }

  private openCancelConfirm(): void {
    // implemented in Task 3
  }

  loadAudioBuffer(buffer: AudioBuffer, context: AudioContext): void {
    const mono = buffer.numberOfChannels > 0 ? buffer.getChannelData(0) : new Float32Array(0);
    this.loadSamples(mono, buffer.sampleRate);
    this.audioEngine = new AudioEngine(context, {
      onPlay: (pos) => this.emit("waver:play", { positionSample: pos }),
      onStop: (pos) => this.emit("waver:stop", { positionSample: pos }),
      onLoop: (pos) => this.emit("waver:loop", { positionSample: pos }),
      onPositionChange: (pos) => this.setCursorPosition(pos, false),
    });
    this.audioEngine.loadBuffer(buffer);
  }

  connectExternalAudioNode(node: AudioNode | null): void {
    this.audioEngine?.connectExternalNode(node);
  }

  /**
   * Sets (or clears) the stream startRecording() uses when called with no explicit argument,
   * including via the built-in Record button — Waver never picks an input device on its own, so
   * a host app that wants to let the user choose a device sets this ahead of time.
   */
  setInputStream(stream: MediaStream | null): void {
    this.presetInputStream = stream;
  }

  getInputStream(): MediaStream | null {
    return this.presetInputStream;
  }

  setChannelIndex(index: number): void {
    this.opts.channelIndex = index;
  }

  getChannelIndex(): number {
    return this.opts.channelIndex;
  }

  play(): void {
    this.audioEngine?.play(this.cursorSample);
  }

  stop(): void {
    this.audioEngine?.stop();
  }

  togglePlayback(): void {
    this.audioEngine?.toggle(this.cursorSample);
  }

  hasAudio(): boolean {
    return this.samples.length > 0;
  }

  isRecording(): boolean {
    return this.recordingState === "recording";
  }

  /**
   * Starts capture. Pass a `MediaStream` to record from it directly (a specific device the host
   * app already picked, a WebRTC remote track, a screen-share audio track, etc.) — Waver has no
   * business choosing an input device itself. Omit it to use `inputStream` if one was set via
   * `setInputStream()`, or fall back to the default mic via getUserMedia otherwise. The built-in
   * Record button always calls startRecording() with no argument, so setInputStream() is also how
   * a host app controls what that button records from.
   */
  async startRecording(stream?: MediaStream, channelIndex?: number): Promise<void> {
    if (this.recordingState === "recording") return;

    const engine = new RecorderEngine({ onData: (chunk) => this.appendRecordedChunk(chunk) });
    try {
      await engine.start(stream ?? this.presetInputStream ?? undefined, channelIndex ?? this.opts.channelIndex);
    } catch (err) {
      this.emit("waver:recorderror", { error: err as Error });
      return;
    }

    this.recorderEngine = engine;
    this.recordingBuffer.reset();
    this.samples = new Float32Array(0);
    this.sampleRate = engine.getSampleRate();
    this.selection = null;
    this.cursorSample = 0;
    this.recordingState = "recording";
    this.recordingStartedAt = performance.now();
    this.startRecordingTimerDisplay();
    this.updateOverlay();
    this.emit("waver:recordstart", {});
    this.render();
  }

  /** Stops an in-progress recording and loads the captured audio, same as if it had been picked via Load File. */
  stopRecording(): void {
    if (this.recordingState !== "recording" || !this.recorderEngine) return;

    const engine = this.recorderEngine;
    const context = engine.getContext();
    const sampleRate = engine.getSampleRate();
    engine.stop();
    this.recorderEngine = null;
    this.recordingState = "idle";
    this.stopRecordingTimerDisplay();

    const captured = this.recordingBuffer.view();
    if (context && captured.length > 0) {
      const buffer = context.createBuffer(1, captured.length, sampleRate);
      buffer.copyToChannel(new Float32Array(captured), 0);
      // loadAudioBuffer -> loadSamples always resets to fullZoom(), independent of recordViewMode:
      // the record-mode viewport is intentionally a capture-only affordance, not carried into playback.
      this.loadAudioBuffer(buffer, context);
    } else {
      this.updateOverlay();
      this.render();
    }
    this.emit("waver:recordstop", { positionSample: this.samples.length });
  }

  private appendRecordedChunk(chunk: Float32Array): void {
    this.recordingBuffer.push(chunk);
    this.samples = this.recordingBuffer.view();
    this.zoom = recordZoom(
      this.opts.recordViewMode,
      this.viewportConfig(),
      this.opts.recordWindowSeconds * this.sampleRate
    );
    this.render();
  }

  private startRecordingTimerDisplay(): void {
    this.updateRecordingTimeLabel();
    this.recordingTimerHandle = window.setInterval(() => this.updateRecordingTimeLabel(), 500);
  }

  private stopRecordingTimerDisplay(): void {
    if (this.recordingTimerHandle !== null) {
      clearInterval(this.recordingTimerHandle);
      this.recordingTimerHandle = null;
    }
  }

  private updateRecordingTimeLabel(): void {
    const elapsedSec = Math.max(0, Math.floor((performance.now() - this.recordingStartedAt) / 1000));
    const mm = Math.floor(elapsedSec / 60);
    const ss = elapsedSec % 60;
    this.recordingTimeEl.textContent = `${mm}:${ss.toString().padStart(2, "0")}`;
  }

  private async handleFileInputChange(): Promise<void> {
    const file = this.fileInput.files?.[0];
    this.fileInput.value = "";
    if (!file) return;

    try {
      const context = this.ensureInternalAudioContext();
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await context.decodeAudioData(arrayBuffer);
      this.loadAudioBuffer(audioBuffer, context);
    } catch (err) {
      this.emit("waver:loaderror", { error: err as Error });
    }
  }

  private ensureInternalAudioContext(): AudioContext {
    if (!this.internalAudioContext || this.internalAudioContext.state === "closed") {
      this.internalAudioContext = new AudioContext();
    }
    return this.internalAudioContext;
  }

  private updateOverlay(): void {
    const showButtons = !this.hasAudio() && this.recordingState !== "recording";
    const loadVisible = showButtons && this.opts.loadButton !== "hidden";
    const recordVisible = showButtons && this.opts.recordButton !== "hidden";
    this.loadButtonEl.style.display = loadVisible ? "" : "none";
    this.recordButtonEl.style.display = recordVisible ? "" : "none";
    this.loadButtonEl.disabled = this.opts.loadButton === "disabled";
    this.recordButtonEl.disabled = this.opts.recordButton === "disabled";
    this.emptyOverlay.style.display = loadVisible || recordVisible ? "flex" : "none";
    this.recordingBar.style.display = this.recordingState === "recording" ? "flex" : "none";

    const cancelVisible = this.hasAudio() && this.recordingState !== "recording" && this.opts.cancelButton !== "hidden";
    this.cancelButtonEl.style.display = cancelVisible ? "" : "none";
    this.cancelButtonEl.disabled = this.opts.cancelButton === "disabled";
  }

  /** Sets the viewport. Eases to the target over ZOOM_ANIM_MS unless `animate` is false (e.g. active drags). */
  setZoom(zoom: Partial<ZoomState>, animate = true): void {
    const target = clampOffset({ ...this.zoom, ...zoom }, this.viewportConfig());
    if (!animate) {
      this.zoomAnimActive = false;
      this.zoom = target;
      this.emit("waver:zoomchange", { zoom: this.zoom });
      this.render();
      return;
    }
    this.zoomAnimFrom = this.zoom;
    this.zoomAnimTo = target;
    this.zoomAnimStart = performance.now();
    this.zoomAnimActive = true;
    this.render();
  }

  zoomToFull(): void {
    this.setZoom(fullZoom(this.viewportConfig()));
  }

  setSelection(selection: SelectionRange | null, final = true): void {
    this.selection = selection ? normalizeSelection(selection) : null;
    this.audioEngine?.setLoopRange(this.selection);
    this.emit("waver:selectionchange", this.selectionDetail());
    if (final) this.commitSelection();
    this.render();
  }

  /** Emits the settled `selectionchanged`/`selectionreset` event for the current selection, without altering it. */
  private commitSelection(): void {
    const detail = this.selectionDetail();
    this.emit(this.selection === null ? "waver:selectionreset" : "waver:selectionchanged", detail);
  }

  private selectionDetail(): SelectionEventDetail {
    return {
      selection: this.selection,
      startSample: this.selection?.startSample ?? null,
      endSample: this.selection?.endSample ?? null,
      durationSample: this.selection ? this.selection.endSample - this.selection.startSample : null,
    };
  }

  setCursorPosition(sample: number, emitEvent = true): void {
    this.cursorSample = Math.max(0, Math.min(sample, this.samples.length));
    if (emitEvent) this.emit("waver:cursorchange", { positionSample: this.cursorSample });
    this.render();
  }

  /** Moves the cursor, restarting playback from the new position if already playing (a seek). */
  private seekTo(sample: number): void {
    this.setCursorPosition(sample);
    if (this.audioEngine?.playbackState === "playing") {
      this.audioEngine.play(this.cursorSample);
    }
  }

  getSelection(): SelectionRange | null {
    return this.selection;
  }

  getCursorPosition(): number {
    return this.cursorSample;
  }

  getZoom(): ZoomState {
    return this.zoom;
  }

  getSampleRate(): number {
    return this.sampleRate;
  }

  /** Current sample buffer — whatever's loaded (file, prior recording) or, mid-recording, what
   * has been captured so far. Empty array if nothing is loaded. */
  getSamples(): Float32Array {
    return this.samples;
  }

  getViewMode(): ViewMode {
    return this.opts.viewMode;
  }

  /** Switches the main view between waveform and spectrogram; the minimap always stays on waveform. */
  setViewMode(mode: ViewMode): void {
    if (this.opts.viewMode === mode) return;
    this.opts = { ...this.opts, viewMode: mode };
    this.emit("waver:viewmodechange", { viewMode: mode });
    this.render();
  }

  // ---- Internals ----------------------------------------------------------

  private viewportConfig(): ViewportConfig {
    return { totalSamples: this.samples.length, pixelWidth: this.mainPixelWidth() };
  }

  private mainPixelWidth(): number {
    return this.container.clientWidth || this.clientWidth || 0;
  }

  private rulerPixelHeight(): number {
    return this.opts.showRuler ? this.opts.rulerHeight : 0;
  }

  private resolveHeight(): number {
    return this.opts.height === "auto" ? this.container.clientHeight || this.clientHeight || 0 : this.opts.height;
  }

  private mainPixelHeight(): number {
    const total = this.resolveHeight() - this.rulerPixelHeight();
    return this.opts.showMinimap ? total * (1 - this.opts.minimapHeightRatio) : total;
  }

  private minimapPixelHeight(): number {
    const total = this.resolveHeight() - this.rulerPixelHeight();
    return this.opts.showMinimap ? total * this.opts.minimapHeightRatio : 0;
  }

  private applyTheme(theme: WaverTheme): void {
    this.theme = theme;
    if (theme.googleFont) ensureGoogleFont(theme.googleFont, this.ownerDocument ?? document);
    this.container.style.fontFamily = theme.fontFamily;
    this.container.style.backgroundColor = theme.backgroundColor;
    this.container.style.borderRadius = this.opts.roundedCorners ? `${theme.borderRadius}px` : "0";
    this.emptyOverlay.style.color = theme.rulerColor;
  }

  private render(): void {
    if (this.raf !== null) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = null;
      this.renderNow();
    });
  }

  private renderNow(): void {
    // The container's own box height must not depend on its children's (display:none-able) boxes —
    // otherwise the blank/empty state, which hides ruler+waveform+minimap entirely, collapses to
    // 0px and the overlay (inset: 0 on a 0-height parent) becomes invisible too.
    if (this.opts.height !== "auto") {
      this.container.style.height = `${this.opts.height}px`;
    }

    const width = this.mainPixelWidth();
    if (width <= 0) return;

    if (this.zoomAnimActive) {
      const t = Math.min(1, (performance.now() - this.zoomAnimStart) / ZOOM_ANIM_MS);
      const e = easeOutCubic(t);
      this.zoom = {
        offsetSample: this.zoomAnimFrom.offsetSample + (this.zoomAnimTo.offsetSample - this.zoomAnimFrom.offsetSample) * e,
        samplesPerPixel:
          this.zoomAnimFrom.samplesPerPixel + (this.zoomAnimTo.samplesPerPixel - this.zoomAnimFrom.samplesPerPixel) * e,
      };
      this.emit("waver:zoomchange", { zoom: this.zoom });
      if (t < 1) this.render();
      else this.zoomAnimActive = false;
    }

    // `"flat"` capture hides the whole waveform area — ruler, minimap and all — not just the wave,
    // matching the empty state. A ruler over a blank canvas would advertise a viewport that flat
    // deliberately doesn't have.
    const flatCapture = this.recordingState === "recording" && this.opts.recordViewMode === "flat";
    const showChrome = (this.samples.length > 0 || this.recordingState === "recording") && !flatCapture;
    this.waveStack.style.display = showChrome ? "block" : "none";

    if (this.opts.showRuler && showChrome) {
      this.rulerCanvas.style.display = "block";
      const rulerHeight = this.opts.rulerHeight;
      this.rulerCtx = setupHiDPICanvas(this.rulerCanvas, width, rulerHeight);
      renderRuler(this.rulerCtx, this.zoom, this.theme, {
        width,
        height: rulerHeight,
        sampleRate: this.sampleRate,
        totalSamples: this.samples.length,
        format: this.opts.rulerTimeFormat,
      });
      if (this.hoverPixel !== null) renderHoverLine(this.rulerCtx, this.hoverPixel, this.theme, rulerHeight);
    } else {
      this.rulerCanvas.style.display = "none";
    }

    const waveHeight = this.mainPixelHeight();
    this.waveStack.style.height = `${waveHeight}px`;
    this.waveformCtx = setupHiDPICanvas(this.waveformCanvas, width, waveHeight);
    this.overlayCtx = setupHiDPICanvas(this.overlayCanvas, width, waveHeight);
    const range = visibleSampleRange(this.zoom, width);

    // Samples keep accumulating during `"flat"` capture, they just aren't drawn until
    // stopRecording() loads them and reveals the whole recording at full zoom.
    const hasWave = this.samples.length > 0 && !flatCapture;

    if (this.opts.viewMode === "spectrogram") {
      const spectrogramData = hasWave
        ? this.spectrogramCache.request(
            this.samples,
            this.sampleRate,
            this.opts.spectrogramFftSize,
            this.opts.spectrogramHop,
            this.opts.spectrogramFreqBins,
            () => {
              this.emit("waver:spectrogramready", {});
              this.render();
            }
          )
        : null;
      const spectrogramColumns = spectrogramData
        ? readVisibleSpectrogramColumns(spectrogramData, range.start, range.end, width)
        : null;

      // Unlike the waveform layer, a `null` columns array (still-pending analysis) must always
      // redraw — it's cheap (background + a status label) and is the only way the "Calculating…"
      // message actually appears the moment the view switches into spectrogram mode.
      const spectrogramLayerUnchanged =
        spectrogramColumns !== null &&
        spectrogramColumns === this.lastSpectrogramColumns &&
        this.theme === this.lastSpectrogramTheme &&
        waveHeight === this.lastSpectrogramHeight;

      if (!spectrogramLayerUnchanged) {
        renderSpectrogram(this.waveformCtx, spectrogramColumns, this.theme, {
          width,
          height: waveHeight,
          freqBins: this.opts.spectrogramFreqBins,
        });
        this.lastSpectrogramColumns = spectrogramColumns;
        this.lastSpectrogramTheme = this.theme;
        this.lastSpectrogramHeight = waveHeight;
      }
      this.lastWaveformPeaks = null; // force a repaint if we switch back to waveform mode
    } else {
      const waveformPeaks = hasWave ? this.getWaveformPeaks(this.samples, range.start, range.end, width) : null;
      const showZeroLine = hasWave && this.opts.showZeroLine;

      // Cursor/selection/hover live on the overlay canvas and repaint every frame regardless (see
      // below), so this — the actually expensive layer — only redraws when its own inputs changed,
      // not on every cursor tick during playback or pointer move.
      const waveformLayerUnchanged =
        waveformPeaks === this.lastWaveformPeaks &&
        showZeroLine === this.lastWaveformShowZeroLine &&
        this.theme === this.lastWaveformTheme &&
        waveHeight === this.lastWaveformHeight;

      if (!waveformLayerUnchanged) {
        renderWaveform(this.waveformCtx, waveformPeaks, this.theme, {
          width,
          height: waveHeight,
          showZeroLine,
          samplesPerPixel: this.zoom.samplesPerPixel,
        });
        this.lastWaveformPeaks = waveformPeaks;
        this.lastWaveformShowZeroLine = showZeroLine;
        this.lastWaveformTheme = this.theme;
        this.lastWaveformHeight = waveHeight;
      }
      this.lastSpectrogramColumns = null; // force a repaint if we switch to spectrogram mode
    }

    this.overlayCtx.clearRect(0, 0, width, waveHeight);
    if (hasWave) {
      if (this.selection) {
        const target = this.pointerController.getAccentEdge();
        if (target !== this.accentTarget) {
          this.accentTarget = target;
          this.accentAnimFromAlpha = this.accentAlpha;
          this.accentAnimStart = performance.now();
          if (target) this.accentEdge = target;
        }
        const t = Math.min(1, (performance.now() - this.accentAnimStart) / ACCENT_FADE_MS);
        this.accentAlpha = target
          ? this.accentAnimFromAlpha + (1 - this.accentAnimFromAlpha) * t
          : this.accentAnimFromAlpha * (1 - t);
        if (t < 1) this.render();
        else if (!target) this.accentEdge = null;
        renderSelection(this.overlayCtx, this.selection, this.zoom, this.theme, waveHeight, this.accentEdge, this.accentAlpha);
      }
      renderCursor(this.overlayCtx, this.cursorSample, this.zoom, this.theme, waveHeight);
    }
    if (this.hoverPixel !== null) renderHoverLine(this.overlayCtx, this.hoverPixel, this.theme, waveHeight);

    if (this.opts.showMinimap && showChrome) {
      const minimapHeight = this.minimapPixelHeight();
      this.minimapCanvas.style.display = "block";
      this.minimapCtx = setupHiDPICanvas(this.minimapCanvas, width, minimapHeight);
      const minimapPeaks = hasWave ? this.getMinimapPeaks(this.samples, 0, this.samples.length, width) : null;
      renderMinimap(this.minimapCtx, minimapPeaks, this.theme, {
        width,
        height: minimapHeight,
        totalSamples: this.samples.length,
        zoom: this.zoom,
        mainPixelWidth: width,
      });
    } else {
      this.minimapCanvas.style.display = "none";
    }
  }

  /**
   * Auto-follow in `"scroll"`/`"zoom-out"` record modes overwrites `this.zoom` on every captured
   * chunk, so any manual zoom/scroll/seek during recording would be fought and undone within
   * milliseconds. Interaction is locked outright rather than adding a "user broke follow" state.
   */
  private interactionLocked(): boolean {
    return this.recordingState === "recording";
  }

  private isMultiTouchActive(): boolean {
    return this.activeTouchPointerIds.size >= 2;
  }

  private attachWaveformListeners(): void {
    const canvas = this.waveformCanvas;
    canvas.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "touch") {
        this.activeTouchPointerIds.add(e.pointerId);
        if (this.activeTouchPointerIds.size >= 2) {
          // This pointerdown is the 2nd+ touch: hand off to pinch/pan, abandoning any
          // single-finger drag the 1st touch had started (touchstart fires after this, so the
          // handoff can't wait for it).
          if (this.activeTouchPointerIds.size === 2) this.pointerController.cancelDrag();
          this.render();
          return;
        }
      }
      if (this.interactionLocked()) return;
      canvas.setPointerCapture(e.pointerId);
      this.pointerController.handlePointerDown(this.pixelFromEvent(e));
      canvas.style.cursor = this.pointerController.getHoverCursor(this.pixelFromEvent(e));
    });
    canvas.addEventListener("pointermove", (e) => {
      if (this.interactionLocked() || this.isMultiTouchActive()) return;
      const pixel = this.pixelFromEvent(e);
      this.pointerController.handlePointerMove(pixel);
      canvas.style.cursor = this.pointerController.getHoverCursor(pixel);
      this.hoverPixel = pixel;
      this.render();
    });
    canvas.addEventListener("pointerleave", () => {
      if (this.interactionLocked() || this.isMultiTouchActive()) return;
      this.pointerController.clearHover();
      this.hoverPixel = null;
      this.render();
    });
    const releaseTouchPointer = (e: PointerEvent) => {
      if (e.pointerType === "touch") this.activeTouchPointerIds.delete(e.pointerId);
    };
    canvas.addEventListener("pointerup", (e) => {
      const wasMultiTouch = this.isMultiTouchActive();
      releaseTouchPointer(e);
      if (this.interactionLocked() || wasMultiTouch) return;
      const pixel = this.pixelFromEvent(e);
      this.pointerController.handlePointerUp(pixel);
      canvas.style.cursor = this.pointerController.getHoverCursor(pixel);
      this.render();
    });
    canvas.addEventListener("pointercancel", releaseTouchPointer);
    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        if (this.interactionLocked()) return;
        const next = applyWheel(
          this.zoom,
          { deltaY: e.deltaY, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, pivotPixel: this.pixelFromEvent(e) },
          this.viewportConfig()
        );
        const now = performance.now();
        const isGesture = now - this.lastWheelTime < WHEEL_GESTURE_GAP_MS;
        this.lastWheelTime = now;
        this.setZoom(next, !isGesture);
      },
      { passive: false }
    );

    const syncActiveTouches = (e: TouchEvent) => {
      const rect = canvas.getBoundingClientRect();
      this.activeTouches = Array.from(e.touches).map((t) => ({ identifier: t.identifier, pixel: t.clientX - rect.left }));
      this.touchGestureController.setActiveTouches(this.activeTouches);
    };
    canvas.addEventListener(
      "touchstart",
      (e) => {
        if (this.interactionLocked()) return;
        // The handoff away from single-finger selection (cancelDrag) happens synchronously in the
        // pointerdown handler above, since it fires before this touchstart does for the 2nd finger.
        if (e.touches.length >= 2) e.preventDefault();
        syncActiveTouches(e);
      },
      { passive: false }
    );
    canvas.addEventListener(
      "touchmove",
      (e) => {
        if (this.interactionLocked() || e.touches.length < 2) return;
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const points: TouchPoint[] = Array.from(e.touches).map((t) => ({ identifier: t.identifier, pixel: t.clientX - rect.left }));
        const next = this.touchGestureController.handleTouchMove(points);
        if (next) this.setZoom(next, false);
      },
      { passive: false }
    );
    canvas.addEventListener("touchend", syncActiveTouches);
    canvas.addEventListener("touchcancel", syncActiveTouches);
  }

  private attachRulerListeners(): void {
    const el = this.rulerCanvas;
    const seekTo = (pixel: number) => {
      const sample = Math.round(this.zoom.offsetSample + pixel * this.zoom.samplesPerPixel);
      this.seekTo(Math.max(0, Math.min(sample, this.samples.length)));
    };

    let dragging = false;
    el.addEventListener("pointerdown", (e) => {
      if (this.interactionLocked()) return;
      dragging = true;
      el.setPointerCapture(e.pointerId);
      seekTo(this.pixelFromEvent(e, el));
    });
    el.addEventListener("pointermove", (e) => {
      if (this.interactionLocked()) return;
      const pixel = this.pixelFromEvent(e, el);
      this.hoverPixel = pixel;
      this.render();
      if (dragging) seekTo(pixel);
    });
    el.addEventListener("pointerleave", () => {
      if (this.interactionLocked()) return;
      this.hoverPixel = null;
      this.render();
    });
    el.addEventListener("pointerup", () => {
      dragging = false;
    });
  }

  private attachMinimapListeners(): void {
    const canvas = this.minimapCanvas;
    const moveViewportTo = (pixel: number, animate: boolean) => {
      const width = this.mainPixelWidth();
      const total = this.samples.length;
      if (width <= 0 || total <= 0) return;
      const centerSample = (pixel / width) * total;
      const visibleSamples = this.zoom.samplesPerPixel * width;
      this.setZoom({ offsetSample: centerSample - visibleSamples / 2 }, animate);
    };

    let dragging = false;
    canvas.addEventListener("pointerdown", (e) => {
      if (this.interactionLocked()) return;
      dragging = true;
      canvas.setPointerCapture(e.pointerId);
      moveViewportTo(this.pixelFromEvent(e, canvas), true);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!dragging || this.interactionLocked()) return;
      moveViewportTo(this.pixelFromEvent(e, canvas), false);
    });
    canvas.addEventListener("pointerup", () => {
      dragging = false;
    });
  }

  private pixelFromEvent(e: PointerEvent | WheelEvent, target: HTMLElement = this.waveformCanvas): number {
    const rect = target.getBoundingClientRect();
    return e.clientX - rect.left;
  }

  private emit<K extends keyof WaverEventMap>(type: K, detail: WaverEventMap[K]): void {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}

function styleSheet(): HTMLStyleElement {
  const style = document.createElement("style");
  style.textContent = `
    :host { display: block; width: 100%; height: 100%; }
    .waver-container { position: relative; display: flex; flex-direction: column; height: 100%; overflow: hidden; user-select: none; touch-action: none; }
    canvas { display: block; width: 100%; }
    .waver-ruler { flex: 0 0 auto; cursor: pointer; }
    .waver-wave-stack { position: relative; }
    .waver-wave-stack canvas { position: absolute; top: 0; left: 0; }
    .waver-waveform { cursor: crosshair; }
    .waver-overlay { pointer-events: none; }
    .waver-minimap { cursor: pointer; }

    .waver-file-input { display: none; }

    .waver-empty-overlay {
      position: absolute; inset: 0; z-index: 5; display: none;
      align-items: center; justify-content: center; gap: 12px;
    }
    .waver-action-btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 8px 16px; border-radius: 999px; border: 2px solid currentColor;
      background: transparent; color: inherit; font: inherit; font-size: 13px; line-height: 1;
      cursor: pointer; transition: background-color 120ms ease, transform 120ms ease;
    }
    .waver-action-btn:hover:not(:disabled) { background: rgba(127, 127, 127, 0.15); }
    .waver-action-btn:active:not(:disabled) { transform: scale(0.96); }
    .waver-action-btn--record { color: #E53E3E; border-color: #E53E3E; }
    .waver-action-btn:disabled { opacity: 0.4; cursor: not-allowed; }

    .waver-cancel-btn {
      position: absolute; top: 8px; right: 8px; z-index: 6;
      display: inline-flex; align-items: center; justify-content: center;
      width: 28px; height: 28px; padding: 0; border-radius: 50%; border: none;
      background: transparent; color: inherit; opacity: 0.5; cursor: pointer;
      transition: opacity 120ms ease, background-color 120ms ease, transform 120ms ease;
    }
    .waver-cancel-btn:hover:not(:disabled) { opacity: 1; background: rgba(127, 127, 127, 0.15); }
    .waver-cancel-btn:active:not(:disabled) { transform: scale(0.96); }
    .waver-cancel-btn:disabled { opacity: 0.25; cursor: not-allowed; }

    .waver-recording-bar {
      position: absolute; inset: 0; z-index: 5; display: none;
      flex-direction: column; align-items: center; justify-content: center; gap: 16px;
      color: #fff; text-shadow: 0 1px 3px rgba(0, 0, 0, 0.55);
      background: radial-gradient(ellipse 45% 60% at 50% 50%, rgba(0, 0, 0, 0.55), transparent 100%);
    }
    .waver-recording-readout { display: flex; align-items: center; gap: 12px; }
    .waver-recording-bar .waver-action-btn {
      padding: 12px 28px; font-size: 15px; border-radius: 999px;
      background: rgba(0, 0, 0, 0.55); color: #fff; border-color: rgba(255, 255, 255, 0.7);
    }
    .waver-recording-bar .waver-action-btn:hover { background: rgba(229, 62, 62, 0.85); border-color: #E53E3E; }
    .waver-recording-bar .waver-action-btn svg { width: 18px; height: 18px; }
    .waver-recording-time {
      font-variant-numeric: tabular-nums; font-size: 44px; font-weight: 600; line-height: 1;
    }
    .waver-recording-dot {
      width: 16px; height: 16px; border-radius: 50%; background: #E53E3E; flex: 0 0 auto;
      animation: waver-recording-pulse 1s ease-in-out infinite;
    }
    @keyframes waver-recording-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
  `;
  return style;
}

export function defineWaverElement(tagName = "wave-r"): void {
  if (!customElements.get(tagName)) {
    customElements.define(tagName, WaverElement);
  }
}
