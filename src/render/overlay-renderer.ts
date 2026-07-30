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

export function renderSelection(
  ctx: CanvasRenderingContext2D,
  selection: SelectionRange,
  zoom: ZoomState,
  theme: WaverTheme,
  height: number
): void {
  const startX = sampleToPixel(selection.startSample, zoom);
  const endX = sampleToPixel(selection.endSample, zoom);
  ctx.fillStyle = theme.selectionColor;
  ctx.globalCompositeOperation = "overlay";
  ctx.fillRect(startX, 0, endX - startX, height);
  ctx.globalCompositeOperation = "source-over";
}
