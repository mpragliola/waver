import type { WaverTheme, ZoomState } from "../core/types";
import { drawPeakPath } from "./canvas-utils";

const MINIMAP_WAVEFORM_COLOR = "#808080";

export interface MinimapRenderOptions {
  width: number;
  height: number;
  totalSamples: number;
  zoom: ZoomState;
  mainPixelWidth: number;
}

/**
 * Renders the always-100%-zoom minimap plus a translucent overlay marking the main viewport's
 * visible range. `peaks` is precomputed by the caller (see `createPeaksCache`) — pass `null`
 * when there's no loaded waveform to draw.
 */
export function renderMinimap(
  ctx: CanvasRenderingContext2D,
  peaks: Float32Array | null,
  theme: WaverTheme,
  options: MinimapRenderOptions
): void {
  const { width, height, totalSamples, zoom, mainPixelWidth } = options;
  const midY = height / 2;

  ctx.fillStyle = theme.backgroundColor;
  ctx.fillRect(0, 0, width, height);

  if (peaks && width > 0) {
    ctx.fillStyle = MINIMAP_WAVEFORM_COLOR;
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
