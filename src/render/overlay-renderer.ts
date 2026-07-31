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

const EDGE_GLOW_WIDTH_PX = 28;

export function renderSelection(
  ctx: CanvasRenderingContext2D,
  selection: SelectionRange,
  zoom: ZoomState,
  theme: WaverTheme,
  height: number,
  draggedEdge: "start" | "end" | null = null
): void {
  const startX = sampleToPixel(selection.startSample, zoom);
  const endX = sampleToPixel(selection.endSample, zoom);
  ctx.fillStyle = theme.selectionColor;
  ctx.globalCompositeOperation = "screen";
  ctx.fillRect(startX, 0, endX - startX, height);

  if (draggedEdge) {
    const edgeX = draggedEdge === "start" ? startX : endX;
    const towardSelection = draggedEdge === "start" ? 1 : -1;
    const glow = ctx.createLinearGradient(edgeX - EDGE_GLOW_WIDTH_PX * towardSelection, 0, edgeX + EDGE_GLOW_WIDTH_PX * towardSelection, 0);
    glow.addColorStop(0, withAlpha(theme.selectionColor, 0));
    glow.addColorStop(0.5, withAlpha(theme.selectionColor, 0.9));
    glow.addColorStop(1, withAlpha(theme.selectionColor, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(edgeX - EDGE_GLOW_WIDTH_PX, 0, EDGE_GLOW_WIDTH_PX * 2, height);
  }

  ctx.globalCompositeOperation = "source-over";
}
