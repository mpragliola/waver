# Waver API Reference

Full API reference for the `waver` package. See [`../README.md`](../README.md) for installation and a
quickstart, and [`./manual.md`](./manual.md) for a guided usage walkthrough with screenshots.

## Exports

### `waver` (main entry point)

| Export | Kind | Source |
|---|---|---|
| `WaverElement` | class | `waver-element.ts` |
| `defineWaverElement(tagName = "wave-r")` | function | `waver-element.ts` |
| `darkTheme` | `WaverTheme` const | `core/theme.ts` |
| `lightTheme` | `WaverTheme` const | `core/theme.ts` |
| `resolveTheme(base, overrides?)` | function | `core/theme.ts` |
| `deriveSelectionColor(waveformColor, alpha?)` | function | `core/theme.ts` |
| `computePeaks(samples, startSample, endSample, outputWidth)` | function | `core/peaks.ts` |
| `fullZoomSamplesPerPixel(totalSamples, pixelWidth)` | function | `core/peaks.ts` |
| `MIN_SAMPLES_PER_PIXEL` | `number` const (`1`) | `core/peaks.ts` |
| `pixelToSample(pixel, zoom)` | function | `core/viewport.ts` |
| `sampleToPixel(sample, zoom)` | function | `core/viewport.ts` |
| All types in `core/types.ts` | types | re-exported via `export *` |

Importing this entry point also registers `HTMLElementTagNameMap["wave-r"]` for TypeScript, and
declares (but does not auto-register) the `<wave-r>` custom element — call `defineWaverElement()`
to register it (the React/Vue wrappers do this for you automatically on import).

### `waver/react`

| Export | Kind |
|---|---|
| `Waver` | `forwardRef` component |
| `WaverHandle` | type (ref surface) |
| `WaverProps` | type |

Importing `waver/react` calls `defineWaverElement()` as a side effect.

### `waver/vue`

| Export | Kind |
|---|---|
| `Waver` | Vue 3 `defineComponent` |

Importing `waver/vue` calls `defineWaverElement()` as a side effect. No separate prop/emit types are
exported; use `InstanceType<typeof Waver>` or the tables below.

---

## WaverOptions

Passed to `configure()` (core) or as props (React/Vue). All fields are optional at the call site
(`Partial<WaverOptions>`); defaults below are what `WaverElement` uses internally before any
`configure()` call.

| Option | Type | Default | Description |
|---|---|---|---|
| `height` | `number \| "auto"` | `100` | Total widget height in CSS px, or `"auto"` to inherit the host element's rendered height (CSS). |
| `minimapHeightRatio` | `number` | `0.2` | Fraction of the (non-ruler) height given to the minimap strip. |
| `theme` | `Partial<WaverTheme>` | `{}` | Theme overrides, merged over the active base theme (dark by default) via `resolveTheme`. |
| `showZeroLine` | `boolean` | `false` | Draw a horizontal zero-amplitude line through the waveform. |
| `roundedCorners` | `boolean` | `true` | Round the widget's outer corners using the theme's `borderRadius`. |
| `showMinimap` | `boolean` | `true` | Show the minimap strip below the main waveform. |
| `showRuler` | `boolean` | `true` | Show the seek ruler strip above the main waveform. |
| `rulerTimeFormat` | `RulerTimeFormat` (`"time" \| "samples"`) | `"time"` | `"time"` renders hh:mm:ss / mm:ss / ss(.ms) depending on wave duration; `"samples"` renders the raw sample index. |
| `rulerHeight` | `number` | `16` | Height (CSS px) of the ruler strip. Fixed — not part of `height`'s minimap/waveform ratio split. |
| `loadButton` | `ControlState` (`"enabled" \| "disabled" \| "hidden"`) | `"enabled"` | State of the built-in "Load File" button shown while no audio is loaded. |
| `recordButton` | `ControlState` | `"enabled"` | State of the built-in "Record" button shown while no audio is loaded. Set `"disabled"` when several Waver instances share one mic and only one may record at a time. |
| `cancelButton` | `ControlState` | `"enabled"` | State of the built-in "Cancel" (X) button shown top-right once audio is loaded. Confirms before discarding via `reset()`. |
| `channelIndex` | `number` | `0` | Which channel of a multi-channel recording source to keep, 0-based. Used by `startRecording()` (including the built-in Record button) when called with no explicit `channelIndex` argument. Falls back to channel 0 if the source has fewer channels. |
| `hideButtonLabels` | `boolean` | `false` | When true, the built-in "Load File" / "Record" buttons hide their text label, showing only the icon (a static `aria-label` is kept regardless). |
| `viewMode` | `ViewMode` (`"waveform" \| "spectrogram"`) | `"waveform"` | Main view. The minimap always stays on waveform regardless of this. |
| `recordViewMode` | `RecordViewMode` (`"flat" \| "zoom-out" \| "scroll"`) | `"scroll"` | Viewport behavior while recording only. `"flat"` draws no waveform at all (chrome hidden entirely). `"zoom-out"` always spans 0 → record head, compressing as it grows. `"scroll"` spans 0 → head until the recording outgrows `recordWindowSeconds`, then slides a fixed-width window. The moment `stopRecording()` loads the captured audio, the viewport always resets to a full zoomed-out view regardless of this setting. |
| `recordWindowSeconds` | `number` | `2` | Width (seconds) of the visible window in `"scroll"` record mode. Ignored by the other record modes. |
| `spectrogramFftSize` | `number` | `2048` | STFT window size in samples, must be a power of two. Larger = finer frequency resolution, coarser time resolution. |
| `spectrogramHop` | `number` | `512` | STFT hop size in samples (step between windows). Smaller = finer time resolution, more compute. |
| `spectrogramFreqBins` | `number` | `128` | Number of log-scaled frequency rows the spectrogram is bucketed down to for display. |

---

## WaverTheme

Set (partially) via the `theme` option / prop; merged over `darkTheme` (the element's built-in
default) using `resolveTheme`.

| Field | Type | Description |
|---|---|---|
| `waveformColor` | `string` | Waveform peak fill/stroke color. |
| `backgroundColor` | `string` | Widget background color. |
| `cursorColor` | `string` | Playback cursor line color. |
| `selectionColor` | `string` | Selection overlay fill color. If omitted while `waveformColor` is overridden, it is auto-derived (see `resolveTheme` below). |
| `minimapOverlayColor` | `string` | Color of the viewport-position overlay drawn on the minimap. |
| `zeroLineColor` | `string` | Color of the zero-amplitude line (only drawn when `showZeroLine` is true). |
| `rulerColor` | `string` | Ruler text/tick color; also used for the empty-state button icon/text color. |
| `fontFamily` | `string` | CSS `font-family` applied to the widget container. |
| `googleFont` | `GoogleFontSpec \| undefined` | When set, the component injects a Google Fonts `<link>` for this family (deduped, loaded once). Shape: `{ family: string; weights?: number[] }`. |
| `roundedCorners` | `boolean` | Theme-level rounded-corners flag (distinct from the `WaverOptions.roundedCorners` option — see note below). |
| `borderRadius` | `number` | Corner radius (px) applied when rounded corners are enabled. |
| `spectrogramColors` | `string[]` | Gradient stops (hex or `rgb()`/`rgba()`), low intensity → high intensity, used to colormap the spectrogram view. Requires at least 2 stops to interpolate meaningfully. |

**Note:** `WaverTheme.roundedCorners` and `WaverOptions.roundedCorners` are two separate fields with
the same name in different objects. At render time the element uses `this.opts.roundedCorners` (the
top-level option) to decide *whether* to apply `theme.borderRadius`; the theme's own
`roundedCorners` field is not read by `WaverElement` itself — set the top-level option to control
this behavior.

### Built-in themes

```ts
import { lightTheme, darkTheme } from "waver";
```

`darkTheme` is the element's internal default (used before any `configure({ theme })` call).

| Field | `lightTheme` | `darkTheme` |
|---|---|---|
| `waveformColor` | `#2B6CB0` | `#63B3ED` |
| `backgroundColor` | `#FFFFFF` | `#1A202C` |
| `cursorColor` | `#1A202C` | `#F7FAFC` |
| `selectionColor` | `rgba(43, 108, 176, 0.45)` | `rgba(99, 179, 237, 0.45)` |
| `minimapOverlayColor` | `rgba(0, 0, 0, 0.15)` | `rgba(255, 255, 255, 0.15)` |
| `zeroLineColor` | `rgba(226, 232, 240, 0.25)` | `rgba(45, 55, 72, 0.25)` |
| `rulerColor` | `rgba(26, 32, 44, 0.55)` | `rgba(247, 250, 252, 0.55)` |
| `fontFamily` | `'Google Sans', 'Segoe UI', sans-serif` | (same) |
| `googleFont` | `{ family: "Google Sans", weights: [400, 500, 600] }` | (same) |
| `roundedCorners` | `true` | `true` |
| `borderRadius` | `6` | `6` |
| `spectrogramColors` | `["#FFFFFF", "#2B6CB0", "#1A202C"]` | `["#1A202C", "#63B3ED", "#F7FAFC"]` |

### Theme helper functions

```ts
function resolveTheme(base: WaverTheme, overrides?: Partial<WaverTheme>): WaverTheme
```
Merges `overrides` over `base`. If `overrides.selectionColor` is not set but
`overrides.waveformColor` is, the returned theme's `selectionColor` is auto-derived from the new
`waveformColor` via `deriveSelectionColor` (at alpha `0.45`) — so overriding just the waveform color
still yields a matching, legible selection tint instead of the old base theme's selection color.
This is what `WaverElement.configure({ theme })` calls internally.

```ts
function deriveSelectionColor(waveformColor: string, alpha = 0.45): string
```
Converts `waveformColor` (hex or `rgb()`/`rgba()`) to an `rgba(...)` string at the given `alpha`.
Falls back to `rgba(43, 108, 176, ALPHA)` (with `alpha` substituted) if `waveformColor` can't be
parsed.

---

## WaverElement methods

`WaverElement` extends `HTMLElement` (custom element tag: `wave-r`, registered via
`defineWaverElement()`). All methods below are public instance methods.

### Configuration

```ts
configure(options: Partial<WaverOptions>): void
```
Merges `options` into the current options (shallow merge — `options.theme`, if present, replaces
the whole theme override object rather than deep-merging). If `theme` is included, it is resolved
against the current theme via `resolveTheme` and applied. If `viewMode` changes, emits
`waver:viewmodechange`. Always re-renders.

### Loading audio

```ts
loadSamples(samples: Float32Array, sampleRate: number): void
```
Loads raw mono samples directly. Clears any existing selection, resets cursor to `0`, and resets the
viewport to a full zoomed-out view (`fullZoom`). Does not set up an `AudioEngine`, so `play()` /
`stop()` / `togglePlayback()` are no-ops after calling this directly (use `loadAudioBuffer` for
playback support).

```ts
loadAudioBuffer(buffer: AudioBuffer, context: AudioContext): void
```
Extracts channel 0 of `buffer` (or an empty buffer if `buffer.numberOfChannels === 0`) as mono
samples and calls `loadSamples`, then constructs an internal `AudioEngine` bound to `context` for
playback, wiring `waver:play` / `waver:stop` / `waver:loop` and cursor-follow during playback. This
is what the built-in Load File flow and `stopRecording()` both use internally.

```ts
connectExternalAudioNode(node: AudioNode | null): void
```
Routes the internal `AudioEngine`'s output through `node` (or disconnects if `null`). No-op if no
audio is loaded yet (no `AudioEngine` exists).

```ts
reset(): void
```
Erases any loaded/recorded audio and returns to the empty-button state. If a recording is in
progress, cancels it first (discarding captured audio, no file load). Also cancels any in-flight
zoom animation, disposes the audio engine and spectrogram cache, resets sample rate to `44100`,
clears selection/cursor, resets the viewport, and emits `waver:reset`.

```ts
hasAudio(): boolean
```
`true` iff the current sample buffer is non-empty (`samples.length > 0`).

### Playback

```ts
play(): void
stop(): void
togglePlayback(): void
```
Delegate to the internal `AudioEngine` (no-op if none exists, i.e. nothing loaded via
`loadAudioBuffer`). `play()` starts playback from the current cursor position
(`getCursorPosition()`), not from wherever the source last stopped — internally this is because
`WaverElement` always calls `AudioEngine.play(this.cursorSample)`. `play()` has **no guard against
being called while already playing**: it unconditionally tears down the current source and starts a
fresh one from the given position, re-firing `waver:play` — this is also how the internal loop
restart works (it's implemented as a `play()` call while `state` is still `"playing"`). `stop()`,
conversely, **is** a no-op if not currently playing. `togglePlayback()` calls `stop()` if currently
playing, otherwise `play()` from the current cursor.

Internally, `AudioEngine` exposes a `playbackState: "idle" | "playing"` getter; `WaverElement` reads
this (via `audioEngine?.playbackState === "playing"`) to decide whether a ruler/cursor seek should
also restart playback at the new position.

### Recording

```ts
async startRecording(stream?: MediaStream, channelIndex?: number): Promise<void>
```
Starts capture. No-op (resolves immediately) if already recording. Input source resolution order:
1. `stream` argument, if passed.
2. The stream set via `setInputStream()`, if any.
3. The default microphone via `getUserMedia`, as a last resort.

Channel resolution: the `channelIndex` argument, or the `channelIndex` option if omitted (falls back
to channel 0 if the source has fewer channels than requested). The built-in Record button always
calls `startRecording()` with no arguments, so `setInputStream()` / the `channelIndex` option are
also how a host app controls what that button records from.

On failure to acquire the stream (e.g. permission denied), emits `waver:recorderror` with the
thrown `Error` and returns without changing state. On success: clears any existing samples/selection,
resets cursor to `0`, starts a 500 ms-interval recording-time label updater, sets `isRecording()` to
`true`, and emits `waver:recordstart`.

```ts
stopRecording(): void
```
No-op if not currently recording. Stops capture; if any audio was captured, wraps it in an
`AudioBuffer` and calls `loadAudioBuffer` with it (same effect as loading via Load File, including
the reset-to-full-zoom viewport behavior). If nothing was captured, just re-renders the empty state.
Always emits `waver:recordstop` (with `positionSample` = total captured sample count) after
handling, regardless of whether any audio was captured.

```ts
isRecording(): boolean
```
`true` while a recording is in progress.

```ts
setInputStream(stream: MediaStream | null): void
getInputStream(): MediaStream | null
```
Sets/gets the stream `startRecording()` uses when called with no explicit `stream` argument
(including via the built-in Record button). Waver never picks an input device on its own — this is
how a host app lets the user choose a device ahead of time.

```ts
setChannelIndex(index: number): void
getChannelIndex(): number
```
Sets/gets the `channelIndex` option (equivalent to `configure({ channelIndex: index })` for the
setter, but returns immediately for the getter without needing to read full options).

### Zoom / viewport

```ts
setZoom(zoom: Partial<ZoomState>, animate = true): void
```
Sets the viewport (`samplesPerPixel` and/or `offsetSample`; either may be omitted to keep the
current value). The target is always clamped via `clampOffset` (offset clamped to
`[0, max(0, totalSamples - visibleSamples)]`; the caller is responsible for clamping
`samplesPerPixel` itself — internal callers use `MIN_SAMPLES_PER_PIXEL` and `fullZoom(...).samplesPerPixel`
as the practical bounds). When `animate` is `true` (default), eases to the target over 220 ms using
an ease-out-cubic curve, emitting `waver:zoomchange` on every animation frame. When `false` (used
internally for active drags/pinch gestures), applies immediately and emits `waver:zoomchange` once
synchronously.

```ts
zoomToFull(): void
```
Equivalent to `setZoom(fullZoom(viewportConfig))` — animates to a fully zoomed-out view of the whole
buffer.

```ts
getZoom(): ZoomState
```
Returns the current `{ samplesPerPixel, offsetSample }` (the *current* animated value if a zoom
animation is in progress, not the animation's target).

### Selection

```ts
setSelection(selection: SelectionRange | null, final = true): void
```
Sets or clears the selection. Non-null ranges are normalized so `startSample <= endSample`
(swapped if passed reversed). Updates the internal audio engine's loop range to match. Always emits
`waver:selectionchange` with the new detail. When `final` is `true` (the default), additionally
calls through to emit the settled event: `waver:selectionchanged` if the new selection is non-null,
or `waver:selectionreset` if it is `null`. Pass `final = false` for intermediate updates during a
drag (internally, `PointerController` does this for every drag step, then calls a separate commit
on drag end) — `waver:selectionchange` still fires on each of those, but the settled events only
fire once, on the drag's final `setSelection` call (or any single non-drag call, which defaults to
`final = true`).

```ts
getSelection(): SelectionRange | null
```
Returns the current selection, or `null` if none.

### Cursor

```ts
setCursorPosition(sample: number, emitEvent = true): void
```
Sets the playback cursor, clamped to `[0, samples.length]`. Emits `waver:cursorchange` unless
`emitEvent` is passed as `false` (used internally when the audio engine reports position changes
during playback, to avoid feedback/redundant emission patterns from that call site — host code
calling this directly will normally want the default). Always re-renders.

```ts
getCursorPosition(): number
```
Returns the current cursor sample position.

### Misc getters

```ts
getSampleRate(): number
```
Returns the sample rate (Hz) of the currently loaded/recorded audio; `44100` if nothing loaded.

```ts
getSamples(): Float32Array
```
Returns the current sample buffer — whatever's loaded (file, prior recording) or, mid-recording,
what has been captured so far. Empty array if nothing is loaded.

```ts
getViewMode(): ViewMode
setViewMode(mode: ViewMode): void
```
Get/set the main view mode (`"waveform" | "spectrogram"`). `setViewMode` is a no-op if `mode`
already matches the current mode; otherwise updates options, emits `waver:viewmodechange`, and
re-renders. The minimap is unaffected and always renders as waveform.

---

## Events

All events are `CustomEvent`s dispatched on the `WaverElement` instance with `bubbles: true` and
`composed: true` (so they cross shadow DOM boundaries). Event names are the `WaverEventMap` keys
below; `detail` is the payload shape shown.

| Event | Detail | Fires when |
|---|---|---|
| `waver:cursorchange` | `{ positionSample: number }` | `setCursorPosition()` is called with `emitEvent` not explicitly `false` (includes ruler clicks/drags and seeks). Not fired for the internal per-frame position updates during playback (those call `setCursorPosition(pos, false)`). |
| `waver:selectionchange` | `SelectionEventDetail` | Every `setSelection()` call, regardless of `final`. Fires on *every* intermediate step of a drag. |
| `waver:selectionchanged` | `SelectionEventDetail` | A selection change settles to a non-null selection: drag end, or any non-drag `setSelection(range, true)` call (the default). |
| `waver:selectionreset` | `SelectionEventDetail` | A selection change settles to `null` (cleared, or reset to full) — same settle conditions as above but for a null result. |
| `waver:zoomchange` | `{ zoom: ZoomState }` | Every `setZoom()` call: once synchronously if `animate: false`, or on every animation frame (~60/s for 220 ms) if animated. |
| `waver:play` | `{ positionSample: number }` | `play()`/`togglePlayback()` successfully starts a source (`positionSample` = the sample it started from). Also fires on each loop restart internally (see `waver:loop` below), since a loop restart is implemented as a fresh `play()` call. |
| `waver:stop` | `{ positionSample: number }` | Playback stops with `positionSample` = the position it stopped at. Fires both when `stop()`/`togglePlayback()` is called explicitly while playing, and when a source reaches its natural end with no loop range active (playback state returns to `"idle"` either way). Does **not** fire on a loop restart (see `waver:loop`) — only on stops that are not immediately followed by a re-`play()`. |
| `waver:loop` | `{ positionSample: number }` | Playback reaches the end of the active loop range (or the source's natural end, if a loop range is set and it's reached first) and restarts from `loopRange.startSample`. The loop range is set via `setSelection()` (selection doubles as loop range — `setSelection` calls `AudioEngine.setLoopRange(selection)` internally) and cleared when selection is cleared. `positionSample` is always the loop range's `startSample`. A `waver:play` also fires for the same restart (loop = stop-less replay, not a stop+play pair). |
| `waver:recordstart` | `{}` | The built-in Record button (or a direct `startRecording()` call) successfully starts a mic/stream capture. |
| `waver:recordstop` | `{ positionSample: number }` | Recording stops, whether or not a file load follows (`positionSample` is the total captured sample count). |
| `waver:recorderror` | `{ error: Error }` | Starting or running the built-in mic recording fails (e.g. permission denied). |
| `waver:loaderror` | `{ error: Error }` | Decoding a file picked via the built-in Load File button fails. |
| `waver:viewmodechange` | `{ viewMode: ViewMode }` | `setViewMode()` or `configure({ viewMode })` actually changes the view mode. |
| `waver:spectrogramready` | `{}` | The background spectrogram analysis for the current buffer/resolution resolves (only relevant in `viewMode: "spectrogram"`). |
| `waver:reset` | `{}` | `reset()` erases loaded/recorded audio and returns to the empty-button state. |

`SelectionEventDetail` shape (used by all three selection events):

```ts
interface SelectionEventDetail {
  selection: SelectionRange | null;
  startSample: number | null;
  endSample: number | null;
  durationSample: number | null; // endSample - startSample, or null if no selection
}
```

### What the React/Vue wrappers do NOT forward

Both wrappers listen only to `waver:selectionchange` (the continuous, every-drag-step event) and
map it to a single `onSelectionChange` / `selectionchange` callback. **Neither wrapper forwards
`waver:selectionchanged` or `waver:selectionreset`** — those settled-only events are currently core
element-only. Code that needs to distinguish "still dragging" from "settled" must use the
`element()` ref escape hatch (React) or the exposed element ref (Vue) to add a native listener for
those two event types directly.

---

## React API

```tsx
import { Waver } from "waver/react";
import type { WaverHandle, WaverProps } from "waver/react";
```

Importing `waver/react` registers the `wave-r` custom element as a side effect. The component
renders a single `<wave-r ref={...} class={...} style={...} />` and forwards all remaining props to
`configure()` imperatively via `useEffect` (keyed off `JSON.stringify(options)`).

### `WaverProps`

`WaverProps extends Partial<WaverOptions>` — every `WaverOptions` field (see the table above,
including `channelIndex`) is a valid prop and maps 1:1 to the same-named option via `configure()`.
Plus:

| Prop | Type | Description |
|---|---|---|
| `className` | `string?` | Applied to the rendered `<wave-r class="...">`. |
| `style` | `CSSProperties?` | Applied to the rendered `<wave-r style="...">`. |
| `inputStream` | `MediaStream \| null \| undefined` | Forwarded to `setInputStream()` via its own `useEffect` (not part of the `configure()` options object). Stream `startRecording()` uses with no explicit argument, including via the built-in Record button. |
| `onCursorChange` | `(positionSample: number) => void` | Maps to `waver:cursorchange`. |
| `onSelectionChange` | `(selection: SelectionRange \| null) => void` | Maps to `waver:selectionchange` (continuous — see note above; `selectionchanged`/`selectionreset` are not exposed). |
| `onZoomChange` | `(zoom: ZoomState) => void` | Maps to `waver:zoomchange`. |
| `onPlay` | `(positionSample: number) => void` | Maps to `waver:play`. |
| `onStop` | `(positionSample: number) => void` | Maps to `waver:stop`. |
| `onLoop` | `(positionSample: number) => void` | Maps to `waver:loop`. |
| `onRecordStart` | `() => void` | Maps to `waver:recordstart`. |
| `onRecordStop` | `(positionSample: number) => void` | Maps to `waver:recordstop`. |
| `onRecordError` | `(error: Error) => void` | Maps to `waver:recorderror`. |
| `onLoadError` | `(error: Error) => void` | Maps to `waver:loaderror`. |
| `onViewModeChange` | `(viewMode: ViewMode) => void` | Maps to `waver:viewmodechange`. |
| `onSpectrogramReady` | `() => void` | Maps to `waver:spectrogramready`. |
| `onReset` | `() => void` | Maps to `waver:reset`. |

### `WaverHandle` (imperative ref)

```ts
interface WaverHandle {
  loadSamples: (samples: Float32Array, sampleRate: number) => void;
  loadAudioBuffer: (buffer: AudioBuffer, context: AudioContext) => void;
  connectExternalAudioNode: (node: AudioNode | null) => void;
  play: () => void;
  stop: () => void;
  togglePlayback: () => void;
  startRecording: (stream?: MediaStream) => void; // channelIndex arg NOT exposed here
  stopRecording: () => void;
  reset: () => void;
  hasAudio: () => boolean;
  isRecording: () => boolean;
  setZoom: (zoom: Partial<ZoomState>, animate?: boolean) => void;
  zoomToFull: () => void;
  setSelection: (selection: SelectionRange | null) => void; // `final` arg NOT exposed here
  setCursorPosition: (sample: number, emitEvent?: boolean) => void;
  getSelection: () => SelectionRange | null;
  getCursorPosition: () => number;
  getZoom: () => ZoomState;
  setViewMode: (mode: ViewMode) => void;
  getViewMode: () => ViewMode;
  element: () => WaverElement | null;
  getSamples: () => Float32Array;
  getSampleRate: () => number;
}
```

Notes on gaps versus the core element's full method surface:
- `startRecording` on the handle only forwards `stream`, not `channelIndex` — to pick a channel per
  call rather than via the `channelIndex` prop, use `element()?.startRecording(stream, channelIndex)`.
- `setSelection` on the handle always calls the core method with its default `final = true` — there
  is no way to pass `final: false` through the handle. Use `element()?.setSelection(range, false)`
  for drag-style intermediate updates.
- `setChannelIndex`/`getChannelIndex`/`setInputStream`/`getInputStream` are not exposed on the
  handle at all (channel/stream are settable only via the `channelIndex`/`inputStream` props). Use
  `element()` for direct access if needed.
- `element()` returns the underlying `WaverElement` (or `null` before mount) as an escape hatch for
  anything not covered above, including adding listeners for `waver:selectionchanged` /
  `waver:selectionreset`.

---

## Vue API

```ts
import { Waver } from "waver/vue";
```

Importing `waver/vue` registers the `wave-r` custom element as a side effect. The component renders
a single `<wave-r ref="...">` and forwards configured props to `configure()` via a deep `watch`.

### Props

Every `WaverOptions` field is an individually-declared prop (not a spread, unlike React), each
`default: undefined` so unset props are omitted from the `configure()` call rather than overriding
with `undefined`:

`height`, `minimapHeightRatio`, `theme`, `showZeroLine`, `roundedCorners`, `showMinimap`,
`showRuler`, `rulerTimeFormat`, `rulerHeight`, `loadButton`, `recordButton`, `hideButtonLabels`,
`cancelButton`, `viewMode`, `recordViewMode`, `recordWindowSeconds`, `spectrogramFftSize`,
`spectrogramHop`, `spectrogramFreqBins`, `channelIndex`

(Types/descriptions/defaults match the `WaverOptions` table above.)

Plus:

| Prop | Type | Description |
|---|---|---|
| `inputStream` | `MediaStream \| null \| undefined` | Watched separately and forwarded to `setInputStream()`. Stream `startRecording()` uses with no explicit argument, including via the built-in Record button. |

Note: unlike the React wrapper, `channelIndex` is declared as its own explicit prop here (both
ultimately map to the same `WaverOptions.channelIndex`).

### Emits

| Emit | Payload | Source event |
|---|---|---|
| `cursorchange` | `positionSample: number` | `waver:cursorchange` |
| `selectionchange` | `selection: SelectionRange \| null` | `waver:selectionchange` (continuous only — `selectionchanged`/`selectionreset` not forwarded, same gap as React) |
| `zoomchange` | `zoom: ZoomState` | `waver:zoomchange` |
| `play` | `positionSample: number` | `waver:play` |
| `stop` | `positionSample: number` | `waver:stop` |
| `loop` | `positionSample: number` | `waver:loop` |
| `recordstart` | — | `waver:recordstart` |
| `recordstop` | `positionSample: number` | `waver:recordstop` |
| `recorderror` | `error: Error` | `waver:recorderror` |
| `loaderror` | `error: Error` | `waver:loaderror` |
| `viewmodechange` | `viewMode: ViewMode` | `waver:viewmodechange` |
| `spectrogramready` | — | `waver:spectrogramready` |
| `reset` | — | `waver:reset` |

### Exposed methods (`ref`/`expose`)

```ts
loadSamples: (samples: Float32Array, sampleRate: number) => void;
loadAudioBuffer: (buffer: AudioBuffer, context: AudioContext) => void;
connectExternalAudioNode: (node: AudioNode | null) => void;
play: () => void;
stop: () => void;
togglePlayback: () => void;
startRecording: (stream?: MediaStream) => void; // channelIndex arg NOT exposed here either
stopRecording: () => void;
reset: () => void;
hasAudio: () => boolean;
isRecording: () => boolean;
setZoom: (zoom: Partial<ZoomState>, animate?: boolean) => void;
zoomToFull: () => void;
setSelection: (selection: SelectionRange | null) => void; // `final` arg NOT exposed here either
setCursorPosition: (sample: number, emitEvent?: boolean) => void;
getSelection: () => SelectionRange | null;
getCursorPosition: () => number;
getZoom: () => ZoomState;
setViewMode: (mode: ViewMode) => void;
getViewMode: () => ViewMode;
element: () => WaverElement | null;
getSamples: () => Float32Array;
getSampleRate: () => number;
```

Same gaps as the React handle: no `channelIndex` argument on `startRecording`, no `final` argument
on `setSelection`, and no exposed `setChannelIndex`/`getChannelIndex`/`setInputStream`/
`getInputStream` — use `element()` for any of these.

---

## TypeScript types

All defined in `src/core/types.ts` unless noted; all are re-exported from the `waver` entry point.

| Type | Description |
|---|---|
| `WaverOptions` | Full configuration object accepted by `configure()` / component props. |
| `WaverTheme` | Theme fields (colors, font, spectrogram gradient, corner radius). |
| `GoogleFontSpec` | `{ family: string; weights?: number[] }` — shape of `WaverTheme.googleFont`. |
| `PeakPair` | `{ min: number; max: number }` — conceptual shape of one entry in a peaks array (the actual `computePeaks` return is a flat interleaved `Float32Array`, not an array of this type). |
| `ZoomState` | `{ samplesPerPixel: number; offsetSample: number }` — the viewport. |
| `SelectionRange` | `{ startSample: number; endSample: number }`. |
| `SelectionEdge` | `"start" \| "end" \| "body" \| null` — which part of a selection a pointer/hit-test is over. |
| `RulerTimeFormat` | `"time" \| "samples"`. |
| `ViewMode` | `"waveform" \| "spectrogram"`. |
| `ControlState` | `"enabled" \| "disabled" \| "hidden"` — visibility/interactivity of a built-in overlay control. |
| `RecordViewMode` | `"flat" \| "zoom-out" \| "scroll"` — viewport behavior while recording. |
| `SelectionEventDetail` | `{ selection, startSample, endSample, durationSample }` — detail payload for all three selection events. |
| `WaverEventMap` | Map of every `waver:*` event name to its detail payload type; used internally for the typed `emit()` helper. |
| `WaverHandle` (`react`) | React imperative ref surface, defined in `src/react/Waver.tsx`. |
| `WaverProps` (`react`) | React component props, defined in `src/react/Waver.tsx`. |

---

## Other exported helpers (advanced / internal-adjacent)

These are exported from the main entry point but are lower-level than the `WaverOptions`/theme
surface above — most consumers won't need them directly (e.g. for building custom peak
visualizations or replicating Waver's own pixel math):

```ts
function computePeaks(samples: Float32Array, startSample: number, endSample: number, outputWidth: number): Float32Array
```
Computes decimated min/max peak pairs for a visible sample range, one pair per output pixel.
Returns a `Float32Array` of length `outputWidth * 2`, interleaved as `[min0, max0, min1, max1, ...]`.
When the visible range has fewer samples than output pixels (deep zoom), each pixel maps to at most
one sample and `min === max`.

```ts
function fullZoomSamplesPerPixel(totalSamples: number, pixelWidth: number): number
```
Samples-per-pixel at 100% zoom (whole waveform fit to the given pixel width). Returns `totalSamples`
if `pixelWidth <= 0`.

```ts
const MIN_SAMPLES_PER_PIXEL: number // = 1
```
Minimum `samplesPerPixel` representing single-sample resolution (the deepest zoom level).

```ts
function pixelToSample(pixel: number, zoom: ZoomState): number
function sampleToPixel(sample: number, zoom: ZoomState): number
```
Convert between a CSS-pixel x-coordinate (relative to the waveform canvas) and an absolute sample
index, given a `ZoomState`. Inverses of each other.
