import { AudioEngine } from "./audio/audio-engine";
import { ensureGoogleFont } from "./core/font-loader";
import { createPeaksCache } from "./core/peaks";
import { normalizeSelection } from "./core/selection";
import { darkTheme, resolveTheme } from "./core/theme";
import type { SelectionEventDetail, SelectionRange, WaverEventMap, WaverOptions, WaverTheme, ZoomState } from "./core/types";
import { clampOffset, fullZoom, visibleSampleRange, type ViewportConfig } from "./core/viewport";
import { PointerController } from "./interaction/pointer-controller";
import { applyWheel } from "./interaction/wheel-controller";
import { setupHiDPICanvas } from "./render/canvas-utils";
import { renderMinimap } from "./render/minimap-renderer";
import { renderCursor, renderHoverLine, renderSelection } from "./render/overlay-renderer";
import { renderRuler } from "./render/ruler-renderer";
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
  rulerHeight: 20,
};

/**
 * `<wave-r>` — a fast, dependency-free waveform display and interaction component.
 * Framework-agnostic custom element; see `waver/react` and `waver/vue` for thin wrappers.
 */
export class WaverElement extends HTMLElement {
  private shadow: ShadowRoot;
  private container: HTMLDivElement;
  private rulerCanvas: HTMLCanvasElement;
  private waveformCanvas: HTMLCanvasElement;
  private minimapCanvas: HTMLCanvasElement;
  private rulerCtx: CanvasRenderingContext2D | null = null;
  private waveformCtx: CanvasRenderingContext2D | null = null;
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
  private audioEngine: AudioEngine | null = null;
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

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: "open" });

    this.container = document.createElement("div");
    this.container.className = "waver-container";

    this.rulerCanvas = document.createElement("canvas");
    this.rulerCanvas.className = "waver-ruler";

    this.waveformCanvas = document.createElement("canvas");
    this.waveformCanvas.className = "waver-waveform";
    this.minimapCanvas = document.createElement("canvas");
    this.minimapCanvas.className = "waver-minimap";

    this.container.append(this.rulerCanvas, this.waveformCanvas, this.minimapCanvas);
    this.shadow.append(styleSheet(), this.container);

    this.pointerController = new PointerController({
      getZoom: () => this.zoom,
      getSelection: () => this.selection,
      getTotalSamples: () => this.samples.length,
      setSelection: (s, final) => this.setSelection(s, final),
      commitSelection: () => this.commitSelection(),
      setCursor: (sample) => this.seekTo(sample),
    });

    this.attachRulerListeners();
    this.attachWaveformListeners();
    this.attachMinimapListeners();
  }

  connectedCallback(): void {
    this.applyTheme(this.theme);
    this.resizeObserver = new ResizeObserver(() => this.render());
    this.resizeObserver.observe(this.container);
    this.render();
  }

  disconnectedCallback(): void {
    this.resizeObserver?.disconnect();
    this.audioEngine?.dispose();
    if (this.raf !== null) cancelAnimationFrame(this.raf);
  }

  // ---- Public API -------------------------------------------------------

  configure(options: Partial<WaverOptions>): void {
    this.opts = { ...this.opts, ...options };
    if (options.theme) this.applyTheme(resolveTheme(this.theme, options.theme));
    this.render();
  }

  loadSamples(samples: Float32Array, sampleRate: number): void {
    this.samples = samples;
    this.sampleRate = sampleRate;
    this.selection = null;
    this.cursorSample = 0;
    this.zoom = fullZoom(this.viewportConfig());
    this.render();
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

  play(): void {
    this.audioEngine?.play(this.cursorSample);
  }

  stop(): void {
    this.audioEngine?.stop();
  }

  togglePlayback(): void {
    this.audioEngine?.toggle(this.cursorSample);
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
    return this.opts.showMinimap ? this.resolveHeight() * this.opts.minimapHeightRatio : 0;
  }

  private applyTheme(theme: WaverTheme): void {
    this.theme = theme;
    if (theme.googleFont) ensureGoogleFont(theme.googleFont, this.ownerDocument ?? document);
    this.container.style.fontFamily = theme.fontFamily;
    this.container.style.backgroundColor = theme.backgroundColor;
    this.container.style.borderRadius = this.opts.roundedCorners ? `${theme.borderRadius}px` : "0";
  }

  private render(): void {
    if (this.raf !== null) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = null;
      this.renderNow();
    });
  }

  private renderNow(): void {
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

    if (this.opts.showRuler) {
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
    this.waveformCtx = setupHiDPICanvas(this.waveformCanvas, width, waveHeight);
    const range = visibleSampleRange(this.zoom, width);

    const hasWave = this.samples.length > 0;
    const waveformPeaks = hasWave ? this.getWaveformPeaks(this.samples, range.start, range.end, width) : null;

    renderWaveform(this.waveformCtx, waveformPeaks, this.theme, {
      width,
      height: waveHeight,
      showZeroLine: hasWave && this.opts.showZeroLine,
      samplesPerPixel: this.zoom.samplesPerPixel,
    });

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
        renderSelection(this.waveformCtx, this.selection, this.zoom, this.theme, waveHeight, this.accentEdge, this.accentAlpha);
      }
      renderCursor(this.waveformCtx, this.cursorSample, this.zoom, this.theme, waveHeight);
    }
    if (this.hoverPixel !== null) renderHoverLine(this.waveformCtx, this.hoverPixel, this.theme, waveHeight);

    if (this.opts.showMinimap) {
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

  private attachWaveformListeners(): void {
    const canvas = this.waveformCanvas;
    canvas.addEventListener("pointerdown", (e) => {
      canvas.setPointerCapture(e.pointerId);
      this.pointerController.handlePointerDown(this.pixelFromEvent(e));
      canvas.style.cursor = this.pointerController.getHoverCursor(this.pixelFromEvent(e));
    });
    canvas.addEventListener("pointermove", (e) => {
      const pixel = this.pixelFromEvent(e);
      this.pointerController.handlePointerMove(pixel);
      canvas.style.cursor = this.pointerController.getHoverCursor(pixel);
      this.hoverPixel = pixel;
      this.render();
    });
    canvas.addEventListener("pointerleave", () => {
      this.pointerController.clearHover();
      this.hoverPixel = null;
      this.render();
    });
    canvas.addEventListener("pointerup", (e) => {
      const pixel = this.pixelFromEvent(e);
      this.pointerController.handlePointerUp(pixel);
      canvas.style.cursor = this.pointerController.getHoverCursor(pixel);
      this.render();
    });
    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
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
  }

  private attachRulerListeners(): void {
    const el = this.rulerCanvas;
    const seekTo = (pixel: number) => {
      const sample = Math.round(this.zoom.offsetSample + pixel * this.zoom.samplesPerPixel);
      this.seekTo(Math.max(0, Math.min(sample, this.samples.length)));
    };

    let dragging = false;
    el.addEventListener("pointerdown", (e) => {
      dragging = true;
      el.setPointerCapture(e.pointerId);
      seekTo(this.pixelFromEvent(e, el));
    });
    el.addEventListener("pointermove", (e) => {
      const pixel = this.pixelFromEvent(e, el);
      this.hoverPixel = pixel;
      this.render();
      if (dragging) seekTo(pixel);
    });
    el.addEventListener("pointerleave", () => {
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
      dragging = true;
      canvas.setPointerCapture(e.pointerId);
      moveViewportTo(this.pixelFromEvent(e, canvas), true);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!dragging) return;
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
    .waver-container { display: flex; flex-direction: column; height: 100%; overflow: hidden; user-select: none; touch-action: none; }
    canvas { display: block; width: 100%; }
    .waver-ruler { flex: 0 0 auto; cursor: pointer; }
    .waver-waveform { cursor: crosshair; }
    .waver-minimap { cursor: pointer; }
  `;
  return style;
}

export function defineWaverElement(tagName = "wave-r"): void {
  if (!customElements.get(tagName)) {
    customElements.define(tagName, WaverElement);
  }
}
