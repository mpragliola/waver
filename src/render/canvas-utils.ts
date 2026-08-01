/**
 * Fills the min/max peak polygon (as produced by `computePeaks`) into the given 2D context.
 * Caller sets `fillStyle` beforehand. Shared by the waveform and minimap renderers.
 */
export function drawPeakPath(ctx: CanvasRenderingContext2D, peaks: Float32Array, width: number, midY: number): void {
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

/**
 * Deep-zoom fallback: once each pixel column maps to <=1 sample, min === max per column and the
 * min/max fill polygon in `drawPeakPath` collapses to zero height (a degenerate, near-invisible
 * hairline). Stroking a connected polyline through the per-column values instead keeps the
 * waveform visible at single-sample resolution. Caller sets `strokeStyle` beforehand.
 */
export function drawPeakLine(ctx: CanvasRenderingContext2D, peaks: Float32Array, width: number, midY: number): void {
  ctx.lineWidth = 0.8;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, midY - peaks[1] * midY);
  for (let x = 1; x < width; x++) {
    ctx.lineTo(x, midY - peaks[x * 2 + 1] * midY);
  }
  ctx.stroke();
}

/**
 * Backs a canvas with device-pixel resolution while keeping its CSS box at the logical size,
 * with smoothing enabled for anti-aliased strokes/fills. Setting `canvas.width`/`height` clears
 * and reallocates its backing bitmap even when assigned the same value, so this skips that (and
 * the context reconfiguration that must follow a real resize) whenever the pixel size hasn't
 * actually changed — important since this runs on every render, including per-animation-frame
 * redraws during playback/panning.
 */
export function setupHiDPICanvas(canvas: HTMLCanvasElement, cssWidth: number, cssHeight: number): CanvasRenderingContext2D {
  const dpr = window.devicePixelRatio || 1;
  const pixelWidth = Math.max(1, Math.round(cssWidth * dpr));
  const pixelHeight = Math.max(1, Math.round(cssHeight * dpr));

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");

  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
  }
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  return ctx;
}
