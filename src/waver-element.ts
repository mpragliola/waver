import { AudioEngine } from "./audio/audio-engine";
import { ensureGoogleFont } from "./core/font-loader";
import { normalizeSelection } from "./core/selection";
import { darkTheme, resolveTheme } from "./core/theme";
import type { SelectionRange, WaverEventMap, WaverOptions, WaverTheme, ZoomState } from "./core/types";
import { clampOffset, fullZoom, pixelToSample, type ViewportConfig } from "./core/viewport";
import { PointerController } from "./interaction/pointer-controller";
import { applyWheel } from "./interaction/wheel-controller";
import { setupHiDPICanvas } from "./render/canvas-utils";
import { renderMinimap } from "./render/minimap-renderer";
import { renderCursor, renderSelection } from "./render/overlay-renderer";
import { renderWaveform } from "./render/waveform-renderer";

/** Height (CSS px) of the seek ruler strip above the waveform. Fixed, not part of `height`'s ratio split. */
const RULER_HEIGHT_PX = 16;

/** Duration of the selection-edge accent glow's fade-in. */
const ACCENT_FADE_MS = 150;

const DEFAULT_OPTIONS: WaverOptions = {
  height: 200,
  minimapHeightRatio: 0.2,
  theme: {},
  showZeroLine: false,
  roundedCorners: true,
  showMinimap: true,
};

/**
 * `<wave-r>` — a fast, dependency-free waveform display and interaction component.
 * Framework-agnostic custom element; see `waver/react` and `waver/vue` for thin wrappers.
 */
export class WaverElement extends HTMLElement {
  private shadow: ShadowRoot;
  private container: HTMLDivElement;
  private rulerEl: HTMLDivElement;
  private waveformCanvas: HTMLCanvasElement;
  private minimapCanvas: HTMLCanvasElement;
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
  private raf: number | null = null;

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: "open" });

    this.container = document.createElement("div");
    this.container.className = "waver-container";

    this.rulerEl = document.createElement("div");
    this.rulerEl.className = "waver-ruler";

    this.waveformCanvas = document.createElement("canvas");
    this.waveformCanvas.className = "waver-waveform";
    this.minimapCanvas = document.createElement("canvas");
    this.minimapCanvas.className = "waver-minimap";

    this.container.append(this.rulerEl, this.waveformCanvas, this.minimapCanvas);
    this.shadow.append(styleSheet(), this.container);

    this.pointerController = new PointerController({
      getZoom: () => this.zoom,
      getSelection: () => this.selection,
      getTotalSamples: () => this.samples.length,
      setSelection: (s) => this.setSelection(s),
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

  setZoom(zoom: Partial<ZoomState>): void {
    this.zoom = clampOffset({ ...this.zoom, ...zoom }, this.viewportConfig());
    this.emit("waver:zoomchange", { zoom: this.zoom });
    this.render();
  }

  zoomToFull(): void {
    this.zoom = fullZoom(this.viewportConfig());
    this.emit("waver:zoomchange", { zoom: this.zoom });
    this.render();
  }

  setSelection(selection: SelectionRange | null): void {
    this.selection = selection ? normalizeSelection(selection) : null;
    this.audioEngine?.setLoopRange(this.selection);
    this.emit("waver:selectionchange", { selection: this.selection });
    this.render();
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

  private mainPixelHeight(): number {
    const total = this.opts.height - RULER_HEIGHT_PX;
    return this.opts.showMinimap ? total * (1 - this.opts.minimapHeightRatio) : total;
  }

  private minimapPixelHeight(): number {
    return this.opts.showMinimap ? this.opts.height * this.opts.minimapHeightRatio : 0;
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

    const waveHeight = this.mainPixelHeight();
    this.waveformCtx = setupHiDPICanvas(this.waveformCanvas, width, waveHeight);
    const range = { start: this.zoom.offsetSample, end: this.zoom.offsetSample + this.zoom.samplesPerPixel * width };

    const hasWave = this.samples.length > 0;

    renderWaveform(this.waveformCtx, this.samples, this.theme, {
      width,
      height: waveHeight,
      startSample: range.start,
      endSample: range.end,
      showZeroLine: hasWave && this.opts.showZeroLine,
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

    if (this.opts.showMinimap) {
      const minimapHeight = this.minimapPixelHeight();
      this.minimapCanvas.style.display = "block";
      this.minimapCtx = setupHiDPICanvas(this.minimapCanvas, width, minimapHeight);
      renderMinimap(this.minimapCtx, this.samples, this.theme, {
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
      this.render();
    });
    canvas.addEventListener("pointerleave", () => {
      this.pointerController.clearHover();
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
        this.zoom = applyWheel(
          this.zoom,
          { deltaY: e.deltaY, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, pivotPixel: this.pixelFromEvent(e) },
          this.viewportConfig()
        );
        this.emit("waver:zoomchange", { zoom: this.zoom });
        this.render();
      },
      { passive: false }
    );
  }

  private attachRulerListeners(): void {
    const el = this.rulerEl;
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
      if (!dragging) return;
      seekTo(this.pixelFromEvent(e, el));
    });
    el.addEventListener("pointerup", () => {
      dragging = false;
    });
  }

  private attachMinimapListeners(): void {
    const canvas = this.minimapCanvas;
    const moveViewportTo = (pixel: number) => {
      const width = this.mainPixelWidth();
      const total = this.samples.length;
      if (width <= 0 || total <= 0) return;
      const centerSample = (pixel / width) * total;
      const visibleSamples = this.zoom.samplesPerPixel * width;
      this.setZoom({ offsetSample: centerSample - visibleSamples / 2 });
    };

    let dragging = false;
    canvas.addEventListener("pointerdown", (e) => {
      dragging = true;
      canvas.setPointerCapture(e.pointerId);
      moveViewportTo(this.pixelFromEvent(e, canvas));
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      moveViewportTo(this.pixelFromEvent(e, canvas));
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
    :host { display: block; width: 100%; }
    .waver-container { display: flex; flex-direction: column; overflow: hidden; user-select: none; touch-action: none; }
    canvas { display: block; width: 100%; }
    .waver-ruler { height: ${RULER_HEIGHT_PX}px; flex: 0 0 auto; cursor: pointer; background: rgba(128, 128, 128, 0.12); }
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

// Redundant pixelToSample import kept for downstream consumers building custom controllers.
export { pixelToSample };
