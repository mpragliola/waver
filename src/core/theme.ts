import type { WaverTheme } from "./types";

export const lightTheme: WaverTheme = {
  waveformColor: "#2B6CB0",
  backgroundColor: "#FFFFFF",
  cursorColor: "#1A202C",
  selectionColor: "rgba(43, 108, 176, 0.45)",
  minimapOverlayColor: "rgba(0, 0, 0, 0.15)",
  zeroLineColor: "rgba(226, 232, 240, 0.25)",
  rulerColor: "rgba(26, 32, 44, 0.55)",
  fontFamily: "'Google Sans', 'Segoe UI', sans-serif",
  googleFont: { family: "Google Sans", weights: [400, 500, 600] },
  roundedCorners: true,
  borderRadius: 6,
};

export const darkTheme: WaverTheme = {
  waveformColor: "#63B3ED",
  backgroundColor: "#1A202C",
  cursorColor: "#F7FAFC",
  selectionColor: "rgba(99, 179, 237, 0.45)",
  minimapOverlayColor: "rgba(255, 255, 255, 0.15)",
  zeroLineColor: "rgba(45, 55, 72, 0.25)",
  rulerColor: "rgba(247, 250, 252, 0.55)",
  fontFamily: "'Google Sans', 'Segoe UI', sans-serif",
  googleFont: { family: "Google Sans", weights: [400, 500, 600] },
  roundedCorners: true,
  borderRadius: 6,
};

/** Derives a translucent selection color from a solid waveform color when the caller does not override it. */
export function deriveSelectionColor(waveformColor: string, alpha = 0.45): string {
  return withAlpha(waveformColor, alpha, "rgba(43, 108, 176, ALPHA)");
}

/** Re-expresses any hex or rgb(a) color string at the given alpha; falls back to `fallback` (with ALPHA substituted) if unparseable. */
export function withAlpha(color: string, alpha: number, fallback = "rgba(0, 0, 0, ALPHA)"): string {
  const rgb = parseColorToRgb(color);
  if (!rgb) return fallback.replace("ALPHA", String(alpha));
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

/** Parsed-color cache: `withAlpha` is called every animation frame (e.g. the selection accent glow) with the same theme color repeatedly, so avoid re-running the regex parse each time. */
const rgbCache = new Map<string, { r: number; g: number; b: number } | null>();

function parseColorToRgb(color: string): { r: number; g: number; b: number } | null {
  const cached = rgbCache.get(color);
  if (cached !== undefined) return cached;

  const result = parseColorToRgbUncached(color);
  rgbCache.set(color, result);
  return result;
}

function parseColorToRgbUncached(color: string): { r: number; g: number; b: number } | null {
  const hexMatch = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3) {
      hex = hex
        .split("")
        .map((c) => c + c)
        .join("");
    }
    const num = parseInt(hex, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }
  const rgbMatch = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(color.trim());
  if (rgbMatch) {
    return { r: Number(rgbMatch[1]), g: Number(rgbMatch[2]), b: Number(rgbMatch[3]) };
  }
  return null;
}

export function resolveTheme(base: WaverTheme, overrides: Partial<WaverTheme> = {}): WaverTheme {
  const merged: WaverTheme = { ...base, ...overrides };
  if (!overrides.selectionColor && overrides.waveformColor) {
    merged.selectionColor = deriveSelectionColor(overrides.waveformColor);
  }
  return merged;
}
