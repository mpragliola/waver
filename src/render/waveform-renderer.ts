import { computePeaks } from "../core/peaks";
import type { WaverTheme } from "../core/types";

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

  if (showZeroLine) {
    ctx.strokeStyle = theme.zeroLineColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, Math.round(midY) + 0.5);
    ctx.lineTo(width, Math.round(midY) + 0.5);
    ctx.stroke();
  }

  if (samples.length === 0 || width <= 0) return;

  const peaks = computePeaks(samples, startSample, endSample, width);
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
