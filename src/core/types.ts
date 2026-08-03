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
  /** Gradient stops (hex or rgb(a)), low intensity -> high intensity, used to colormap the spectrogram view. */
  spectrogramColors: string[];
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

export type ViewMode = "waveform" | "spectrogram";

/** Visibility/interactivity of a built-in overlay control: rendered and clickable, rendered greyed out, or not rendered at all. */
export type ControlState = "enabled" | "disabled" | "hidden";

/**
 * Viewport behavior while recording.
 * `"flat"` — draw no waveform at all. `"zoom-out"` — always span 0 → record head, compressing as it grows.
 * `"scroll"` — span 0 → head until the recording outgrows `recordWindowSeconds`, then slide a fixed-width window.
 */
export type RecordViewMode = "flat" | "zoom-out" | "scroll";

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
  /** State of the built-in "Load File" button shown while no audio is loaded. */
  loadButton: ControlState;
  /**
   * State of the built-in "Record" button shown while no audio is loaded.
   * Use `"disabled"` when several Waver instances share one mic and only one may record at a time.
   */
  recordButton: ControlState;
  /** State of the built-in "Cancel" (X) button shown top-right once audio is loaded. Confirms before discarding via reset(). */
  cancelButton: ControlState;
  /**
   * Which channel of a multi-channel recording source to keep, 0-based. Used by
   * startRecording() (including the built-in Record button) when called with no explicit
   * channelIndex argument. Falls back to channel 0 if the source has fewer channels.
   */
  channelIndex: number;
  /** Main view: waveform or spectrogram. Minimap always stays on waveform regardless of this. */
  viewMode: ViewMode;
  /**
   * Viewport behavior while recording. Applies only during capture: the moment `stopRecording()`
   * loads the captured audio, the viewport always resets to a full zoomed-out view of the whole
   * clip regardless of this setting.
   */
  recordViewMode: RecordViewMode;
  /** Width (seconds) of the visible window in `"scroll"` record mode. Ignored by the other record modes. */
  recordWindowSeconds: number;
  /** STFT window size in samples, must be a power of two. Larger = finer frequency resolution, coarser time resolution. */
  spectrogramFftSize: number;
  /** STFT hop size in samples (step between windows). Smaller = finer time resolution, more compute. */
  spectrogramHop: number;
  /** Number of log-scaled frequency rows the spectrogram is bucketed down to for display. */
  spectrogramFreqBins: number;
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
  /** Fires when the built-in Record button starts a mic capture. */
  "waver:recordstart": Record<string, never>;
  /** Fires when recording stops, whether or not a file load follows. */
  "waver:recordstop": { positionSample: number };
  /** Fires when starting or running the built-in mic recording fails (e.g. permission denied). */
  "waver:recorderror": { error: Error };
  /** Fires when decoding a file picked via the built-in Load File button fails. */
  "waver:loaderror": { error: Error };
  "waver:viewmodechange": { viewMode: ViewMode };
  /** Fires once the background spectrogram analysis for the current buffer/resolution resolves. */
  "waver:spectrogramready": Record<string, never>;
  /** Fires when reset() erases loaded/recorded audio and returns to the empty-button state. */
  "waver:reset": Record<string, never>;
};
