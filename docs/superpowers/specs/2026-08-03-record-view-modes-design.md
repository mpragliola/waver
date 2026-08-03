# Record Visualization Modes

## Problem

While recording, Waver has exactly one viewport behavior: `appendRecordedChunk()`
resets the viewport to `fullZoom()` on every incoming chunk, so the view always
spans sample 0 to the record head and progressively zooms out as the recording
grows. For long recordings this compresses the waveform to the point of being
useless, and there is no way for an embedder to opt out of drawing the live
waveform at all.

## Goals

Give embedders three explicit record-time viewport behaviors, selectable through
the existing options bag:

- `flat` — draw no waveform at all while recording.
- `zoom-out` — always span 0 → record head (today's behavior).
- `scroll` — hold a fixed time window and slide it once the recording outgrows it.

## Non-Goals

- Manual zoom/scroll during recording. Interaction stays locked (see
  *Interaction*), so there is no "user broke follow / jump back to head" state
  to design.
- Changing playback-time viewport behavior. These modes apply only while
  `recordingState === "recording"`.
- Spectrogram-specific record behavior. The modes drive the viewport; whichever
  `viewMode` is active renders through that viewport as it does today.

## API

New type in `src/core/types.ts`, alongside the existing `ViewMode`:

```ts
export type RecordViewMode = "flat" | "zoom-out" | "scroll";
```

Two new fields on `WaverOptions`:

```ts
/** Viewport behavior while recording: draw nothing, span 0 → head, or slide a fixed window. */
recordViewMode: RecordViewMode;
/** Width (seconds) of the visible window in `"scroll"` record mode. Ignored by the other modes. */
recordWindowSeconds: number;
```

Defaults in `DEFAULT_OPTIONS` (`src/waver-element.ts`):

- `recordViewMode: "scroll"`
- `recordWindowSeconds: 10`

**This changes existing behavior**: today's implicit `zoom-out` is no longer the
default. Embedders who want it must set `recordViewMode: "zoom-out"`.

Both fields are plumbed exactly like the existing `viewMode` option — through
`setOptions()`, the React wrapper (`src/react/Waver.tsx`) and the Vue wrapper
(`src/vue/Waver.ts`). No dedicated setter method; that would be inconsistent
with every other option.

Changing either option mid-recording takes effect on the next captured chunk,
because the next `appendRecordedChunk()` simply computes the viewport under the
new mode. This falls out of the design rather than being special-cased.

## Behavior

### `flat`

The main canvas draws background and chrome only — no waveform, no record head.
Samples are still captured into `recordingBuffer` throughout; `stopRecording()`
loads them and renders the complete waveform exactly as the other modes do. The
recording overlay (pulsing dot, elapsed timer, Stop button) is unaffected —
it is a DOM layer above the canvas and is independent of record view mode.

### `zoom-out`

Current behavior, preserved verbatim: each chunk sets the viewport to
`fullZoom(viewportConfig())`, spanning sample 0 → record head. Its samples-per-
pixel grows without bound as the recording lengthens.
`recordWindowSeconds` is ignored.

### `scroll`

Let `windowSamples = recordWindowSeconds * sampleRate` and `total =
recordingBuffer.length`.

- While `total <= windowSamples`, the mode behaves identically to `zoom-out`:
  the view spans 0 → head and zooms out as the recording grows. This is the
  "before a certain time has passed" phase.
- Once `total > windowSamples`, samples-per-pixel locks at
  `windowSamples / pixelWidth` and the offset tracks the head:
  `offsetSample = total - windowSamples`. The window slides; the wave no longer
  compresses.

Locking on a time window rather than a samples-per-pixel constant keeps the
displayed resolution independent of container width — a 10-second window shows
10 seconds whether the widget is 300px or 1200px wide.

Edge cases: a non-positive or non-finite `recordWindowSeconds` falls back to
`zoom-out` behavior rather than producing a degenerate viewport.

## Interaction

While `recordingState === "recording"`, the wheel handler and the waveform,
minimap, and ruler pointer handlers return early without mutating the viewport,
selection, or cursor. Rationale: the auto-follow in scroll and zoom-out
overwrites `this.zoom` on every chunk, so any user gesture would be fought and
undone within milliseconds. Locking avoids that conflict outright and needs no
follow-state flag.

This is consistent with what already ships: the recording overlay covers the
canvas during recording, so most interaction is visually blocked regardless.

## Implementation Notes

The viewport decision belongs in one place. `appendRecordedChunk()` currently
hardcodes `this.zoom = fullZoom(this.viewportConfig())`; it instead calls a new
pure helper in `src/core/viewport.ts`:

```ts
export function recordZoom(
  mode: RecordViewMode,
  config: ViewportConfig,
  windowSamples: number
): ZoomState;
```

`recordZoom` returns the `fullZoom` result for `zoom-out`, the sliding-window
state for `scroll`, and (for `flat`) whatever is cheapest — the waveform layer
is skipped by the renderer, so its value is unobservable; returning `fullZoom`
keeps the function total and the ruler consistent.

Keeping the math in `viewport.ts` as a pure function means it is unit-testable
without a DOM, matching how `fullZoom`, `zoomAt`, and `scrollBy` are already
tested in `src/core/viewport.test.ts`.

The render path gates the waveform layer on record mode: in `render()`, the
existing `hasWave` condition additionally requires that we are not recording in
`flat` mode.

## Testing

Unit tests in `src/core/viewport.test.ts` for `recordZoom`:

- `zoom-out` matches `fullZoom` for the same config.
- `scroll` below the window threshold matches `fullZoom` (offset 0, growing spp).
- `scroll` above the threshold holds `samplesPerPixel === windowSamples /
  pixelWidth` and sets `offsetSample === total - windowSamples`.
- `scroll` at exactly the threshold takes the pre-lock branch (boundary is
  `total > windowSamples`).
- Non-positive / non-finite `windowSamples` falls back to `zoom-out`.
- `flat` returns a valid, finite `ZoomState`.

The repo has no element-level (DOM) tests today — `WaverElement` is untested and
this spec does not introduce a harness for it. Element-level behavior (waveform
suppressed in `flat`, interaction locked during recording) is therefore verified
manually in the demo page, which gains a record-mode selector.
