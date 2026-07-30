import { computePeaks } from "../core/peaks";
import type { WaverTheme, ZoomState } from "../core/types";

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
    ctx.beginPath();
    ctx.moveTo(0, midY - peaks[1] * midY);
    for (let x = 0; x < width; x++) {
      ctx.lineTo(x, midY - peaks[x * 2 + 1] * midY);
    }
    for (let x = width - 1; x >= 0; x--) {
      ctx.lineTo(x, midY - peaks[x * 2] * midY);
    }
    ctx.closePath();
    ctx.fill();
  }

  if (totalSamples <= 0) return;
  const visibleStart = zoom.offsetSample;
  const visibleEnd = zoom.offsetSample + zoom.samplesPerPixel * mainPixelWidth;
  const overlayX = (visibleStart / totalSamples) * width;
  const overlayWidth = Math.max(1, ((visibleEnd - visibleStart) / totalSamples) * width);

  ctx.fillStyle = theme.minimapOverlayColor;
  ctx.fillRect(overlayX, 0, overlayWidth, height);
}
