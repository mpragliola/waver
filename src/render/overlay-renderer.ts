import { withAlpha } from "../core/theme";
import type { SelectionRange, WaverTheme, ZoomState } from "../core/types";
import { sampleToPixel } from "../core/viewport";

const CURSOR_WIDTH_PX = 2;
const CURSOR_ALPHA = 0.75;

export function renderCursor(
  ctx: CanvasRenderingContext2D,
  cursorSample: number,
  zoom: ZoomState,
  theme: WaverTheme,
  height: number
): void {
  const x = sampleToPixel(cursorSample, zoom);
  ctx.globalAlpha = CURSOR_ALPHA;
  ctx.fillStyle = theme.cursorColor;
  ctx.fillRect(x - CURSOR_WIDTH_PX / 2, 0, CURSOR_WIDTH_PX, height);
  ctx.globalAlpha = 1;
}

const HOVER_LINE_WIDTH_PX = 1;
const HOVER_LINE_ALPHA = 0.25;

/** Faint vertical line tracking pointer hover, drawn on top of the ruler/waveform canvas. */
export function renderHoverLine(ctx: CanvasRenderingContext2D, pixel: number, theme: WaverTheme, height: number): void {
  ctx.globalAlpha = HOVER_LINE_ALPHA;
  ctx.fillStyle = theme.cursorColor;
  ctx.fillRect(pixel - HOVER_LINE_WIDTH_PX / 2, 0, HOVER_LINE_WIDTH_PX, height);
  ctx.globalAlpha = 1;
}

const EDGE_GLOW_WIDTH_PX = 11;
const EDGE_GLOW_PEAK_ALPHA = 0.35;

export function renderSelection(
  ctx: CanvasRenderingContext2D,
  selection: SelectionRange,
  zoom: ZoomState,
  theme: WaverTheme,
  height: number,
  accentEdge: "start" | "end" | null = null,
  accentFade = 1
): void {
  const startX = sampleToPixel(selection.startSample, zoom);
  const endX = sampleToPixel(selection.endSample, zoom);
  ctx.fillStyle = theme.selectionColor;
  ctx.globalCompositeOperation = "screen";
  ctx.fillRect(startX, 0, endX - startX, height);

  if (accentEdge && accentFade > 0) {
    const edgeX = accentEdge === "start" ? startX : endX;
    const inward = accentEdge === "start" ? 1 : -1;
    const glow = ctx.createLinearGradient(edgeX, 0, edgeX + EDGE_GLOW_WIDTH_PX * inward, 0);
    glow.addColorStop(0, withAlpha(theme.selectionColor, EDGE_GLOW_PEAK_ALPHA * accentFade));
    glow.addColorStop(1, withAlpha(theme.selectionColor, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(Math.min(edgeX, edgeX + EDGE_GLOW_WIDTH_PX * inward), 0, EDGE_GLOW_WIDTH_PX, height);
  }

  ctx.globalCompositeOperation = "source-over";
}
