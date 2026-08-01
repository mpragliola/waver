import { clampSample, hitTestSelection, normalizeSelection, resizeSelection, translateSelection } from "../core/selection";
import type { SelectionEdge, SelectionRange, ZoomState } from "../core/types";
import { pixelToSample, sampleToPixel } from "../core/viewport";

export interface PointerControllerCallbacks {
  getZoom: () => ZoomState;
  getSelection: () => SelectionRange | null;
  getTotalSamples: () => number;
  setSelection: (selection: SelectionRange | null, final?: boolean) => void;
  /** Emits the settled selection event for the drag/gesture that just ended. */
  commitSelection: () => void;
  setCursor: (sample: number) => void;
}

const DOUBLE_CLICK_MS = 350;

export type HoverCursor = "crosshair" | "ew-resize" | "grab" | "grabbing";

type DragMode = { kind: "resize"; edge: "start" | "end" } | { kind: "move"; grabOffsetSamples: number } | { kind: "create"; anchorSample: number };

/**
 * Drives waveform pointer gestures: click sets cursor, drag on empty space creates a
 * selection, drag on a selection border resizes it, drag on the selection body moves it
 * (clamped to the wave bounds), and double-click on a selection clears it.
 */
export class PointerController {
  private callbacks: PointerControllerCallbacks;
  private dragMode: DragMode | null = null;
  private lastClickTime = 0;
  private pointerDownX = 0;
  private didDrag = false;
  private hoverEdge: "start" | "end" | null = null;

  constructor(callbacks: PointerControllerCallbacks) {
    this.callbacks = callbacks;
  }

  handlePointerDown(pixel: number): void {
    this.pointerDownX = pixel;
    this.didDrag = false;
    const zoom = this.callbacks.getZoom();
    const selection = this.callbacks.getSelection();
    const total = this.callbacks.getTotalSamples();
    const toPixel = (s: number) => sampleToPixel(s, zoom);

    const now = Date.now();
    const isDoubleClick = now - this.lastClickTime < DOUBLE_CLICK_MS;
    this.lastClickTime = now;

    const edge: SelectionEdge = hitTestSelection(pixel, selection, toPixel);

    if (isDoubleClick && selection && edge) {
      this.callbacks.setSelection(null);
      this.dragMode = null;
      return;
    }

    if (edge === "start" || edge === "end") {
      this.dragMode = { kind: "resize", edge };
      return;
    }
    if (edge === "body" && selection) {
      const grabSample = pixelToSample(pixel, zoom);
      this.dragMode = { kind: "move", grabOffsetSamples: grabSample - selection.startSample };
      return;
    }

    const anchorSample = clampSample(pixelToSample(pixel, zoom), total);
    this.dragMode = { kind: "create", anchorSample };
  }

  handlePointerMove(pixel: number): void {
    if (!this.dragMode) {
      const zoom = this.callbacks.getZoom();
      const selection = this.callbacks.getSelection();
      const toPixel = (s: number) => sampleToPixel(s, zoom);
      const edge = hitTestSelection(pixel, selection, toPixel);
      this.hoverEdge = edge === "start" || edge === "end" ? edge : null;
      return;
    }
    if (Math.abs(pixel - this.pointerDownX) > 1) this.didDrag = true;

    const zoom = this.callbacks.getZoom();
    const total = this.callbacks.getTotalSamples();
    const sample = clampSample(pixelToSample(pixel, zoom), total);

    if (this.dragMode.kind === "create") {
      this.callbacks.setSelection(normalizeSelection({ startSample: this.dragMode.anchorSample, endSample: sample }), false);
      return;
    }

    if (this.dragMode.kind === "resize") {
      const selection = this.callbacks.getSelection();
      if (!selection) return;
      this.callbacks.setSelection(resizeSelection(selection, this.dragMode.edge, sample, total), false);
      return;
    }

    if (this.dragMode.kind === "move") {
      const selection = this.callbacks.getSelection();
      if (!selection) return;
      const targetStart = sample - this.dragMode.grabOffsetSamples;
      const delta = targetStart - selection.startSample;
      this.callbacks.setSelection(translateSelection(selection, delta, total), false);
    }
  }

  handlePointerUp(pixel: number): void {
    const zoom = this.callbacks.getZoom();
    const total = this.callbacks.getTotalSamples();

    if (!this.didDrag && this.dragMode !== null) {
      const sample = clampSample(pixelToSample(pixel, zoom), total);
      this.callbacks.setCursor(sample);
    } else if (this.didDrag && this.dragMode !== null) {
      this.callbacks.commitSelection();
    }

    this.dragMode = null;
    this.didDrag = false;
  }

  /** Clears hover state, e.g. when the pointer leaves the canvas. */
  clearHover(): void {
    this.hoverEdge = null;
  }

  /** Edge to accent in the renderer: the one being drag-resized, or hovered when idle. */
  getAccentEdge(): "start" | "end" | null {
    if (this.dragMode) return this.dragMode.kind === "resize" ? this.dragMode.edge : null;
    return this.hoverEdge;
  }

  /** Cursor to show for the given pixel, reflecting the gesture that would start there. */
  getHoverCursor(pixel: number): HoverCursor {
    if (this.dragMode?.kind === "move") return "grabbing";
    if (this.dragMode?.kind === "resize") return "ew-resize";

    const zoom = this.callbacks.getZoom();
    const selection = this.callbacks.getSelection();
    const toPixel = (s: number) => sampleToPixel(s, zoom);
    const edge = hitTestSelection(pixel, selection, toPixel);

    if (edge === "start" || edge === "end") return "ew-resize";
    if (edge === "body") return "grab";
    return "crosshair";
  }
}
