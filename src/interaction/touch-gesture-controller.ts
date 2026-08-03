import type { ViewportConfig } from "../core/viewport";
import { scrollBy, zoomAt } from "../core/viewport";
import type { ZoomState } from "../core/types";

export interface TouchPoint {
  identifier: number;
  pixel: number;
}

export interface TouchGestureControllerCallbacks {
  getZoom: () => ZoomState;
  getViewportConfig: () => ViewportConfig;
}

function midpoint(a: TouchPoint, b: TouchPoint): number {
  return (a.pixel + b.pixel) / 2;
}

function distance(a: TouchPoint, b: TouchPoint): number {
  return Math.abs(a.pixel - b.pixel);
}

/**
 * Drives two-finger touch gestures on the waveform: swipe pans, pinch zooms (pivoting on
 * the pinch midpoint). Single-touch is left untouched here — it's handled by PointerController
 * via the existing pointer-event selection path. Only the horizontal (x) component of each
 * touch point is used, matching the 1D nature of the waveform viewport.
 */
export class TouchGestureController {
  private callbacks: TouchGestureControllerCallbacks;
  private lastMidpoint: number | null = null;
  private lastDistance: number | null = null;

  constructor(callbacks: TouchGestureControllerCallbacks) {
    this.callbacks = callbacks;
  }

  /** Call whenever the active touch set changes (start/end/cancel) with the currently active points. */
  setActiveTouches(points: TouchPoint[]): void {
    if (points.length < 2) {
      this.lastMidpoint = null;
      this.lastDistance = null;
      return;
    }
    const [a, b] = points;
    this.lastMidpoint = midpoint(a, b);
    this.lastDistance = distance(a, b);
  }

  /**
   * Call on touchmove with the current two active points. Returns the updated zoom state, or
   * null if a two-finger gesture isn't active (fewer than 2 touches tracked).
   */
  handleTouchMove(points: TouchPoint[]): ZoomState | null {
    if (points.length < 2 || this.lastMidpoint === null || this.lastDistance === null) return null;

    const [a, b] = points;
    const nextMidpoint = midpoint(a, b);
    const nextDistance = distance(a, b);
    const config = this.callbacks.getViewportConfig();

    let zoom = this.callbacks.getZoom();

    if (nextDistance !== this.lastDistance && this.lastDistance > 0) {
      const factor = nextDistance / this.lastDistance;
      zoom = zoomAt(zoom, nextMidpoint, factor, config);
    }

    const panDelta = this.lastMidpoint - nextMidpoint;
    if (panDelta !== 0) {
      zoom = scrollBy(zoom, panDelta * zoom.samplesPerPixel, config);
    }

    this.lastMidpoint = nextMidpoint;
    this.lastDistance = nextDistance;
    return zoom;
  }
}
