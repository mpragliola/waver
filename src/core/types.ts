export interface GoogleFontSpec {
  /** Google Fonts family name, e.g. "Inter". */
  family: string;
  weights?: number[];
}

export interface WaverTheme {
  waveformColor: string;
  backgroundColor: string;
  cursorColor: string;
  selectionColor: string;
  minimapOverlayColor: string;
  zeroLineColor: string;
  rulerColor: string;
  fontFamily: string;
  /** When set, the component injects a Google Fonts stylesheet link for this family (deduped, loaded once). */
  googleFont?: GoogleFontSpec;
  roundedCorners: boolean;
  borderRadius: number;
}

export interface PeakPair {
  min: number;
  max: number;
}

export interface ZoomState {
  /** Samples represented by one CSS pixel of the main waveform. Always >= minimum (single-sample) resolution. */
  samplesPerPixel: number;
  /** First sample visible at the left edge of the main waveform viewport. */
  offsetSample: number;
}

export interface SelectionRange {
  startSample: number;
  endSample: number;
}

export type SelectionEdge = "start" | "end" | "body" | null;

/** `"time"` — hh:mm:ss / mm:ss / ss(.ms) depending on wave duration. `"samples"` — raw sample index. */
export type RulerTimeFormat = "time" | "samples";

export interface WaverOptions {
  height: number;
  minimapHeightRatio: number;
  theme: Partial<WaverTheme>;
  showZeroLine: boolean;
  roundedCorners: boolean;
  showMinimap: boolean;
  showRuler: boolean;
  rulerTimeFormat: RulerTimeFormat;
}

export type WaverEventMap = {
  "waver:cursorchange": { positionSample: number };
  "waver:selectionchange": { selection: SelectionRange | null };
  "waver:zoomchange": { zoom: ZoomState };
  "waver:play": { positionSample: number };
  "waver:stop": { positionSample: number };
  "waver:loop": { positionSample: number };
};
