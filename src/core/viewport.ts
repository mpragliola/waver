import { clamp } from "./math";
import { fullZoomSamplesPerPixel, MIN_SAMPLES_PER_PIXEL } from "./peaks";
import type { RecordViewMode, ZoomState } from "./types";

export interface ViewportConfig {
  totalSamples: number;
  pixelWidth: number;
}

export function fullZoom(config: ViewportConfig): ZoomState {
  const samplesPerPixel = fullZoomSamplesPerPixel(config.totalSamples, config.pixelWidth);
  return { samplesPerPixel: Math.max(samplesPerPixel, MIN_SAMPLES_PER_PIXEL), offsetSample: 0 };
}

/**
 * Viewport for the current record head, per record view mode.
 *
 * `"scroll"` behaves like `"zoom-out"` until the recording outgrows `windowSamples`, then locks
 * resolution at "one window fills the width" and slides the offset to keep the head at the right
 * edge. Locking on a sample count derived from a duration (rather than on a samplesPerPixel
 * constant) keeps the displayed resolution independent of container width.
 *
 * `"flat"` draws no waveform, so its viewport is unobservable; it returns the `"zoom-out"` state to
 * keep this function total and the ruler consistent.
 */
export function recordZoom(
  mode: RecordViewMode,
  config: ViewportConfig,
  windowSamples: number
): ZoomState {
  const windowUsable = Number.isFinite(windowSamples) && windowSamples > 0;
  if (mode !== "scroll" || !windowUsable || config.totalSamples <= windowSamples) {
    return fullZoom(config);
  }
  return {
    samplesPerPixel: Math.max(windowSamples / config.pixelWidth, MIN_SAMPLES_PER_PIXEL),
    offsetSample: config.totalSamples - windowSamples,
  };
}

export function visibleSampleRange(zoom: ZoomState, pixelWidth: number): { start: number; end: number } {
  return {
    start: zoom.offsetSample,
    end: zoom.offsetSample + zoom.samplesPerPixel * pixelWidth,
  };
}

export function pixelToSample(pixel: number, zoom: ZoomState): number {
  return zoom.offsetSample + pixel * zoom.samplesPerPixel;
}

export function sampleToPixel(sample: number, zoom: ZoomState): number {
  return (sample - zoom.offsetSample) / zoom.samplesPerPixel;
}

/**
 * Zooms in/out by `factor` (>1 zooms in, <1 zooms out), keeping the sample under `pivotPixel` stationary.
 */
export function zoomAt(
  zoom: ZoomState,
  pivotPixel: number,
  factor: number,
  config: ViewportConfig
): ZoomState {
  const pivotSample = pixelToSample(pivotPixel, zoom);
  const maxSamplesPerPixel = fullZoom(config).samplesPerPixel;
  const nextSpp = clamp(zoom.samplesPerPixel / factor, MIN_SAMPLES_PER_PIXEL, maxSamplesPerPixel);
  const nextOffset = pivotSample - pivotPixel * nextSpp;
  return clampOffset({ samplesPerPixel: nextSpp, offsetSample: nextOffset }, config);
}

export function scrollBy(zoom: ZoomState, deltaSamples: number, config: ViewportConfig): ZoomState {
  return clampOffset({ ...zoom, offsetSample: zoom.offsetSample + deltaSamples }, config);
}

export function clampOffset(zoom: ZoomState, config: ViewportConfig): ZoomState {
  const visibleSamples = zoom.samplesPerPixel * config.pixelWidth;
  const maxOffset = Math.max(0, config.totalSamples - visibleSamples);
  return { ...zoom, offsetSample: clamp(zoom.offsetSample, 0, maxOffset) };
}
