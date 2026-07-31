import { clamp } from "./math";
import type { SelectionEdge, SelectionRange } from "./types";

/** Pixel tolerance (CSS px) around a selection border that still counts as an edge-drag hit. */
export const EDGE_HIT_TOLERANCE_PX = 6;

export function normalizeSelection(range: SelectionRange): SelectionRange {
  return range.startSample <= range.endSample
    ? range
    : { startSample: range.endSample, endSample: range.startSample };
}

export function hitTestSelection(
  pixel: number,
  selection: SelectionRange | null,
  sampleToPixel: (sample: number) => number
): SelectionEdge {
  if (!selection) return null;
  const startPx = sampleToPixel(selection.startSample);
  const endPx = sampleToPixel(selection.endSample);
  if (Math.abs(pixel - startPx) <= EDGE_HIT_TOLERANCE_PX) return "start";
  if (Math.abs(pixel - endPx) <= EDGE_HIT_TOLERANCE_PX) return "end";
  if (pixel > startPx && pixel < endPx) return "body";
  return null;
}

export function resizeSelection(
  selection: SelectionRange,
  edge: "start" | "end",
  newSample: number,
  totalSamples: number
): SelectionRange {
  const clamped = clampSample(newSample, totalSamples);
  const next =
    edge === "start" ? { ...selection, startSample: clamped } : { ...selection, endSample: clamped };
  return normalizeSelection(next);
}

export function translateSelection(
  selection: SelectionRange,
  deltaSamples: number,
  totalSamples: number
): SelectionRange {
  const width = selection.endSample - selection.startSample;
  let start = selection.startSample + deltaSamples;
  let end = selection.endSample + deltaSamples;
  if (start < 0) {
    start = 0;
    end = width;
  }
  if (end > totalSamples) {
    end = totalSamples;
    start = totalSamples - width;
  }
  return { startSample: start, endSample: end };
}

export function clampSample(sample: number, totalSamples: number): number {
  return clamp(sample, 0, totalSamples);
}
