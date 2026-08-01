import type { WaverTheme } from "../core/types";
import { drawPeakLine, drawPeakPath } from "./canvas-utils";

/** Below this samplesPerPixel, min===max per column and the fill polygon degenerates; switch to a stroked line. */
const LINE_MODE_SAMPLES_PER_PIXEL = 1.5;

export interface WaveformRenderOptions {
  width: number;
  height: number;
  showZeroLine: boolean;
  samplesPerPixel: number;
}

/**
 * Renders decimated (or per-sample, at deep zoom) peaks as an aliased vertical-line waveform.
 * `peaks` is precomputed by the caller (see `createPeaksCache`) — pass `null` when there's no
 * loaded waveform to draw.
 */
export function renderWaveform(
  ctx: CanvasRenderingContext2D,
  peaks: Float32Array | null,
  theme: WaverTheme,
  options: WaveformRenderOptions
): void {
  const { width, height, showZeroLine, samplesPerPixel } = options;
  const midY = height / 2;

  ctx.fillStyle = theme.backgroundColor;
  ctx.fillRect(0, 0, width, height);

  if (!peaks || width <= 0) {
    if (showZeroLine) drawZeroLine(ctx, width, midY, theme.zeroLineColor);
    return;
  }

  if (samplesPerPixel <= LINE_MODE_SAMPLES_PER_PIXEL) {
    ctx.strokeStyle = theme.waveformColor;
    drawPeakLine(ctx, peaks, width, midY);
  } else {
    ctx.fillStyle = theme.waveformColor;
    drawPeakPath(ctx, peaks, width, midY);
  }

  if (showZeroLine) drawZeroLine(ctx, width, midY, theme.zeroLineColor);
}

function drawZeroLine(ctx: CanvasRenderingContext2D, width: number, midY: number, color: string): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, Math.round(midY) + 0.5);
  ctx.lineTo(width, Math.round(midY) + 0.5);
  ctx.stroke();
}
