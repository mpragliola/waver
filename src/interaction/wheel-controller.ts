import type { ViewportConfig } from "../core/viewport";
import { scrollBy, zoomAt } from "../core/viewport";
import type { ZoomState } from "../core/types";

const ZOOM_STEP = 1.15;
const SCROLL_PIXELS_PER_WHEEL_UNIT = 1;
const FAST_SCROLL_MULTIPLIER = 4;

export interface WheelInput {
  deltaY: number;
  ctrlKey: boolean;
  shiftKey: boolean;
  pivotPixel: number;
}

/**
 * Plain wheel zooms in/out around the pointer. Ctrl+wheel scrolls (pans) instead.
 * Ctrl+Shift+wheel scrolls at an accelerated rate.
 */
export function applyWheel(zoom: ZoomState, input: WheelInput, config: ViewportConfig): ZoomState {
  if (input.ctrlKey) {
    const multiplier = input.shiftKey ? FAST_SCROLL_MULTIPLIER : 1;
    const deltaSamples = input.deltaY * SCROLL_PIXELS_PER_WHEEL_UNIT * zoom.samplesPerPixel * multiplier;
    return scrollBy(zoom, deltaSamples, config);
  }

  const factor = input.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
  return zoomAt(zoom, input.pivotPixel, factor, config);
}
