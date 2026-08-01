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
  /** Total widget height in CSS px, or `"auto"` to inherit from the host element's rendered height (CSS). */
  height: number | "auto";
  minimapHeightRatio: number;
  theme: Partial<WaverTheme>;
  showZeroLine: boolean;
  roundedCorners: boolean;
  showMinimap: boolean;
  showRuler: boolean;
  rulerTimeFormat: RulerTimeFormat;
  /** Height (CSS px) of the seek ruler strip. Fixed, not part of `height`'s ratio split. */
  rulerHeight: number;
}

export interface SelectionEventDetail {
  selection: SelectionRange | null;
  startSample: number | null;
  endSample: number | null;
  durationSample: number | null;
}

export type WaverEventMap = {
  "waver:cursorchange": { positionSample: number };
  /** Fires on every intermediate update, including each step of a drag. */
  "waver:selectionchange": SelectionEventDetail;
  /** Fires once a change settles: drag end, or any non-drag `setSelection` call that yields a non-null selection. */
  "waver:selectionchanged": SelectionEventDetail;
  /** Fires once a change settles to no selection (cleared / reset to full). */
  "waver:selectionreset": SelectionEventDetail;
  "waver:zoomchange": { zoom: ZoomState };
  "waver:play": { positionSample: number };
  "waver:stop": { positionSample: number };
  "waver:loop": { positionSample: number };
};
