import { computePeaks } from "../core/peaks";
import type { WaverTheme, ZoomState } from "../core/types";
import { drawPeakPath } from "./canvas-utils";

export interface MinimapRenderOptions {
  width: number;
  height: number;
  totalSamples: number;
  zoom: ZoomState;
  mainPixelWidth: number;
}

/** Renders the always-100%-zoom minimap plus a translucent overlay marking the main viewport's visible range. */
export function renderMinimap(
  ctx: CanvasRenderingContext2D,
  samples: Float32Array,
  theme: WaverTheme,
  options: MinimapRenderOptions
): void {
  const { width, height, totalSamples, zoom, mainPixelWidth } = options;
  const midY = height / 2;

  ctx.fillStyle = theme.backgroundColor;
  ctx.fillRect(0, 0, width, height);

  if (samples.length > 0 && width > 0) {
    const peaks = computePeaks(samples, 0, samples.length, width);
    ctx.fillStyle = theme.waveformColor;
    drawPeakPath(ctx, peaks, width, midY);
  }

  if (totalSamples <= 0) return;
  const visibleStart = zoom.offsetSample;
  const visibleEnd = zoom.offsetSample + zoom.samplesPerPixel * mainPixelWidth;
  const overlayX = (visibleStart / totalSamples) * width;
  const overlayWidth = Math.max(1, ((visibleEnd - visibleStart) / totalSamples) * width);

  ctx.fillStyle = theme.minimapOverlayColor;
  ctx.fillRect(overlayX, 0, overlayWidth, height);
}
