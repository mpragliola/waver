import { parseColorToRgb } from "./theme";

const LUT_SIZE = 256;

/**
 * Builds a 256-entry RGBA lookup table by interpolating evenly-spaced gradient `stops`
 * (hex or rgb(a) strings, low intensity -> high intensity). Falls back to opaque black/white
 * for unparseable stops so a bad theme value never throws mid-render.
 */
export function buildColormapLUT(stops: string[]): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(LUT_SIZE * 4);
  const colors = stops.length >= 2 ? stops : ["#000000", "#ffffff"];
  const parsed = colors.map((c) => parseColorToRgb(c) ?? { r: 0, g: 0, b: 0 });

  for (let i = 0; i < LUT_SIZE; i++) {
    const t = i / (LUT_SIZE - 1);
    const segment = t * (parsed.length - 1);
    const idx = Math.min(parsed.length - 2, Math.floor(segment));
    const localT = segment - idx;
    const a = parsed[idx];
    const b = parsed[idx + 1];

    lut[i * 4] = a.r + (b.r - a.r) * localT;
    lut[i * 4 + 1] = a.g + (b.g - a.g) * localT;
    lut[i * 4 + 2] = a.b + (b.b - a.b) * localT;
    lut[i * 4 + 3] = 255;
  }

  return lut;
}
