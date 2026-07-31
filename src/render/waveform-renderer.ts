import { computePeaks } from "../core/peaks";
import type { WaverTheme } from "../core/types";
import { drawPeakPath } from "./canvas-utils";

export interface WaveformRenderOptions {
  width: number;
  height: number;
  startSample: number;
  endSample: number;
  showZeroLine: boolean;
}

/** Renders decimated (or per-sample, at deep zoom) peaks as an aliased vertical-line waveform. */
export function renderWaveform(
  ctx: CanvasRenderingContext2D,
  samples: Float32Array,
  theme: WaverTheme,
  options: WaveformRenderOptions
): void {
  const { width, height, startSample, endSample, showZeroLine } = options;
  const midY = height / 2;

  ctx.fillStyle = theme.backgroundColor;
  ctx.fillRect(0, 0, width, height);

  if (samples.length === 0 || width <= 0) {
    if (showZeroLine) drawZeroLine(ctx, width, midY, theme.zeroLineColor);
    return;
  }

  const peaks = computePeaks(samples, startSample, endSample, width);
  ctx.fillStyle = theme.waveformColor;
  drawPeakPath(ctx, peaks, width, midY);

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
