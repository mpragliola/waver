import type { RulerTimeFormat, WaverTheme, ZoomState } from "../core/types";
import { pixelToSample, sampleToPixel } from "../core/viewport";

const BACKGROUND_COLOR = "rgba(128, 128, 128, 0.12)";
const TICK_HEIGHT_PX = 5;
const FONT_SIZE_PX = 10;
const MIN_LABEL_SPACING_PX = 70;

export interface RulerRenderOptions {
  width: number;
  height: number;
  sampleRate: number;
  totalSamples: number;
  format: RulerTimeFormat;
}

/** Renders a tick strip above the waveform: sample or time labels at a spacing that adapts to zoom. */
export function renderRuler(
  ctx: CanvasRenderingContext2D,
  zoom: ZoomState,
  theme: WaverTheme,
  options: RulerRenderOptions
): void {
  const { width, height, sampleRate, totalSamples, format } = options;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = BACKGROUND_COLOR;
  ctx.fillRect(0, 0, width, height);

  if (width <= 0 || totalSamples <= 0 || sampleRate <= 0) return;

  const start = pixelToSample(0, zoom);
  const end = pixelToSample(width, zoom);
  const targetSampleStep = MIN_LABEL_SPACING_PX * zoom.samplesPerPixel;

  ctx.strokeStyle = theme.rulerColor;
  ctx.fillStyle = theme.rulerColor;
  ctx.font = `${FONT_SIZE_PX}px ${theme.fontFamily}`;
  ctx.textBaseline = "top";
  ctx.lineWidth = 1;

  if (format === "samples") {
    const stepSamples = niceStep(targetSampleStep);
    drawTicks(ctx, zoom, start, end, stepSamples, height, (sample) => String(Math.round(sample)));
    return;
  }

  const totalDuration = totalSamples / sampleRate;
  const stepSeconds = niceStep(targetSampleStep / sampleRate);
  const decimals = stepSeconds < 1 ? Math.max(0, Math.ceil(-Math.log10(stepSeconds))) : 0;
  const stepSamples = stepSeconds * sampleRate;
  drawTicks(ctx, zoom, start, end, stepSamples, height, (sample) =>
    formatTime(sample / sampleRate, totalDuration, decimals)
  );
}

function drawTicks(
  ctx: CanvasRenderingContext2D,
  zoom: ZoomState,
  start: number,
  end: number,
  stepSamples: number,
  height: number,
  labelFor: (sample: number) => string
): void {
  if (!(stepSamples > 0)) return;
  const firstTick = Math.max(0, Math.floor(start / stepSamples) * stepSamples);
  for (let sample = firstTick; sample <= end; sample += stepSamples) {
    const x = sampleToPixel(sample, zoom);
    ctx.beginPath();
    ctx.moveTo(Math.round(x) + 0.5, height - TICK_HEIGHT_PX);
    ctx.lineTo(Math.round(x) + 0.5, height);
    ctx.stroke();
    ctx.fillText(labelFor(sample), x + 3, 1);
  }
}

/** Rounds `target` up to the nearest 1-2-5 * 10^n step ("nice numbers" tick-spacing algorithm). */
function niceStep(target: number): number {
  if (!(target > 0)) return 1;
  const exponent = Math.floor(Math.log10(target));
  const fraction = target / Math.pow(10, exponent);
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return niceFraction * Math.pow(10, exponent);
}

function formatTime(seconds: number, totalDuration: number, decimals: number): string {
  const clamped = Math.max(0, seconds);
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const secs = clamped % 60;

  if (totalDuration >= 3600) {
    return `${hours}:${pad2(minutes)}:${pad2(secs, decimals)}`;
  }
  if (totalDuration >= 60) {
    return `${minutes}:${pad2(secs, decimals)}`;
  }
  return decimals > 0 ? `${secs.toFixed(decimals)}s` : `${Math.round(secs)}s`;
}

function pad2(value: number, decimals = 0): string {
  const str = decimals > 0 ? value.toFixed(decimals) : String(Math.floor(value));
  const [intPart, fracPart] = str.split(".");
  const paddedInt = intPart.padStart(2, "0");
  return fracPart ? `${paddedInt}.${fracPart}` : paddedInt;
}
