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

/** Backs a canvas with device-pixel resolution while keeping its CSS box at the logical size, with smoothing enabled for anti-aliased strokes/fills. */
export function setupHiDPICanvas(canvas: HTMLCanvasElement, cssWidth: number, cssHeight: number): CanvasRenderingContext2D {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(cssWidth * dpr));
  canvas.height = Math.max(1, Math.round(cssHeight * dpr));
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return ctx;
}
