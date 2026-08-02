import type { WaverTheme } from "../core/types";
import { buildColormapLUT } from "../core/colormap";

export interface SpectrogramRenderOptions {
  width: number;
  height: number;
  freqBins: number;
}

/** LUT cache keyed by the joined gradient-stops string so it's rebuilt only when the theme changes. */
let cachedLutKey: string | null = null;
let cachedLut: Uint8ClampedArray | null = null;

function getLut(theme: WaverTheme): Uint8ClampedArray {
  const key = theme.spectrogramColors.join("|");
  if (cachedLutKey !== key || !cachedLut) {
    cachedLut = buildColormapLUT(theme.spectrogramColors);
    cachedLutKey = key;
  }
  return cachedLut;
}

/**
 * Renders precomputed, pixel-decimated spectrogram columns (see `readVisibleSpectrogramColumns`)
 * as a colormapped image. `columns` is `freqBins * width` (row 0 = lowest frequency); pass `null`
 * while the background analysis is still pending so callers can show an empty/background frame.
 */
export function renderSpectrogram(
  ctx: CanvasRenderingContext2D,
  columns: Float32Array | null,
  theme: WaverTheme,
  options: SpectrogramRenderOptions
): void {
  const { width, height, freqBins } = options;

  ctx.fillStyle = theme.backgroundColor;
  ctx.fillRect(0, 0, width, height);

  if (columns === null && width > 0 && height > 0) {
    ctx.fillStyle = theme.rulerColor;
    ctx.font = `13px ${theme.fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Calculating spectrogram…", width / 2, height / 2);
  }

  if (!columns || width <= 0 || height <= 0 || freqBins <= 0) return;

  const lut = getLut(theme);
  const image = ctx.createImageData(width, freqBins);
  const pixels = image.data;

  for (let x = 0; x < width; x++) {
    for (let r = 0; r < freqBins; r++) {
      const value = columns[x * freqBins + r];
      const lutIdx = Math.max(0, Math.min(255, Math.round(value * 255)));
      // Flip vertically: row 0 (lowest frequency) draws at the bottom of the image.
      const destRow = freqBins - 1 - r;
      const destOffset = (destRow * width + x) * 4;
      const srcOffset = lutIdx * 4;
      pixels[destOffset] = lut[srcOffset];
      pixels[destOffset + 1] = lut[srcOffset + 1];
      pixels[destOffset + 2] = lut[srcOffset + 2];
      pixels[destOffset + 3] = lut[srcOffset + 3];
    }
  }

  // Draw the (small, one-pixel-per-column-per-bin) image scaled up to the full canvas size via
  // an offscreen bitmap-sized canvas, since putImageData can't scale directly.
  const off = new OffscreenCanvas(width, freqBins);
  const offCtx = off.getContext("2d");
  if (!offCtx) return;
  offCtx.putImageData(image, 0, 0);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(off, 0, 0, width, freqBins, 0, 0, width, height);
}
