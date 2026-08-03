# Input Monitoring VU Meter

## Problem

Waver has no way to check microphone input levels before committing to a
recording. The only mic-related affordance is the Record button, which opens
the mic and immediately starts capturing samples into `recordingBuffer`. There
is no "listen first" step, and no live level readout at all — not even during
an active recording.

This is a prerequisite for a planned follow-up (auto-record triggered by input
level crossing a threshold), which needs a live level signal regardless. This
spec covers monitoring and the meter only; the auto-record trigger is a
separate spec.

## Goals

- A new **monitoring** state: mic open, live level visible, no samples
  captured.
- A vertical VU-style meter, docked to the widget's left edge, visible only
  while monitoring.
- A "Monitor" button, alongside the existing Load File / Record buttons, that
  toggles this state.

## Non-Goals

- The meter does not run during actual recording. Monitoring and recording are
  mutually exclusive UI states — entering one always ends the other (except
  the explicit handoff described below). The existing recording bar (pulsing
  dot + timer) is unchanged.
- No stereo metering. `RecorderEngine` picks a single channel via
  `channelIndex` (never sums), so there is exactly one level value to show.
  The meter is a single bar, not a pair.
- No configurable color-zone thresholds or meter scale. These are fixed (see
  *Visual Design*) to keep the options surface small; the auto-record spec
  introduces its own independent threshold option later.
- No waveform/spectrogram rendering changes. Monitoring only affects the
  empty-state overlay area, not the canvas rendering pipeline.

## API

### `WaverOptions` (`src/core/types.ts`)

```ts
/** Controls the Monitor button, same semantics as loadButton/recordButton. */
monitorButton: ControlState;
```

Default in `DEFAULT_OPTIONS` (`src/waver-element.ts`): `monitorButton:
"enabled"`.

Threaded through `configure()`, the React wrapper (`src/react/Waver.tsx`), and
the Vue wrapper (`src/vue/Waver.ts`) exactly like `loadButton`/`recordButton`.

### `WaverElement` public methods (`src/waver-element.ts`)

```ts
/** Opens the mic and starts live level metering, without capturing samples.
 * Same stream/channelIndex conventions as startRecording(): pass an explicit
 * MediaStream to monitor a specific device, or omit to use the stream set via
 * setInputStream(), falling back to the default mic via getUserMedia. */
async startMonitoring(stream?: MediaStream, channelIndex?: number): Promise<void>;

/** Closes the mic and stops metering. No-op if not monitoring. */
stopMonitoring(): void;

isMonitoring(): boolean;
```

### Events (`WaverEventMap`, `src/core/types.ts`)

```ts
"waver:monitorstart": Record<string, never>;
"waver:monitorstop": Record<string, never>;
```

Mirrors `waver:recordstart`/`waver:recordstop`. Mic failures during monitoring
reuse the existing `waver:recorderror` event — no new error event type.

### `RecorderEngine` (`src/audio/recorder-engine.ts`)

```ts
export interface RecorderEngineEvents {
  onData?: (chunk: Float32Array) => void;
  onLevel?: (db: number) => void; // new
}

/** Opens the mic and reports live peak levels via onLevel, without invoking
 * onData / accumulating samples. Shares the mic-open plumbing with start()
 * but never wires the accumulation path. */
async startMonitoring(stream?: MediaStream, channelIndex?: number): Promise<void>;
```

`startMonitoring()` opens the same node graph as `start()` (source → optional
splitter → processor → silent gain → destination) but the processor's
`onaudioprocess` computes peak dB and calls `onLevel` instead of building a
chunk for `onData`. `stop()`/`cancel()` work unchanged for either mode, since
they only tear down nodes and don't know which callback was in use.

## State Machine

`WaverElement.recordingState` gains a third value:

```ts
type RecordingState = "idle" | "monitoring" | "recording";
```

(Field is renamed only in spirit — keeping the existing `recordingState` name
avoids a churn-only rename across the file; it now also represents
monitoring.)

Transitions:

| From | Action | To |
|---|---|---|
| `idle` | click Monitor | `monitoring` |
| `monitoring` | click Monitor again | `idle` (mic closed) |
| `monitoring` | click Record | `recording` — **seamless handoff**, see below |
| `idle` | click Record | `recording` (unchanged today) |
| `recording` | Stop / `stopRecording()` | `idle` (unchanged today) |
| `monitoring` | `reset()`, `disconnectedCallback`, Load File click, Escape | `idle` (mic closed) |
| `recording` | `reset()`, `disconnectedCallback` | `idle` (unchanged today, mic closed) |

**Every exit path stops monitoring uniformly** (closes the mic, tears down the
monitoring engine instance) with the sole exception of clicking Record, which
hands off instead of closing. This matters because `reset()` and
`disconnectedCallback` today only check `recordingState === "recording"` —
both gain a parallel check for `"monitoring"` that calls the monitoring
teardown path. Load File's click handler also gains a call to stop monitoring
if active.

`handleEscapeKey` (`src/waver-element.ts:120-122`) today only fires when the
cancel-confirm overlay is open (`e.key === "Escape" && confirmOverlayEl.style
.display !== "none"`) — Escape currently does nothing while monitoring, since
no confirm dialog is open in that state. This spec adds new behavior: the
guard condition gains an `|| this.recordingState === "monitoring"` branch, so
Escape also stops monitoring when no confirm dialog is showing. This is a new
keybinding effect, not an extension of existing behavior.

### Monitor → Record handoff

Clicking Record while `monitoring` must not reopen the mic (avoids a second
permission prompt and an audible gap). `WaverElement` keeps a reference to the
`MediaStream` obtained during `startMonitoring()` (via a private field
alongside `recorderEngine`, e.g. `monitorStream`). On handoff:

1. Tear down the monitoring engine's processing nodes only — **do not** stop
   the stream's tracks (the recording engine will own the stream next).
2. Call `startRecording(monitorStream, channelIndex)` with the same
   `channelIndex` monitoring was using.
3. Clear `monitorStream`/monitoring engine fields, set state to `recording`.

This requires `RecorderEngine` to expose the stream it opened (a getter, or
`WaverElement` captures the resolved stream itself before calling
`recorderEngine.startMonitoring(stream)` — implementation detail for the
plan). Either way, `RecorderEngine.releaseCaptureNodes()` must not stop tracks
in this path; `ownsStream`-gated stopping already exists for the "caller
supplied the stream" case and this handoff is analogous (the recording engine
now owns lifecycle for those tracks, not the monitoring engine).

## Visual Design

Single vertical bar, docked to the widget's left edge, full height (with a
small inset matching the existing container padding conventions), visible
only while `recordingState === "monitoring"`. Hidden (via `display: none`,
consistent with `.waver-recording-bar`) at all other times.

- **Scale**: dBFS, -60dB (empty) to 0dB (full). Peak-based: each incoming
  chunk's peak amplitude converts to dB; the bar's fill height is set
  directly from that value every chunk (~85-93ms cadence, matching the
  existing `ScriptProcessorNode` buffer size).
- **Decay**: a CSS `transition` on the fill element's height (~300ms
  ease-out) provides the fall-off between chunks — no JS animation loop.
  Matches the existing CSS-only approach used for the recording dot's pulse.
- **Color zones**: fixed, not configurable. Green through most of the range,
  yellow approaching clipping, red near 0dB. Exact thresholds and colors
  drawn from the active `WaverTheme` where a sensible mapping exists (e.g.
  reuse `waveformColor`-family greens) with hardcoded fallback hex for the
  warn/clip zones (yellow/red aren't currently part of `WaverTheme`) — final
  hex values are an implementation-time detail, not a design constraint.
- **Monitor button**: pill-styled like the existing `.waver-action-btn`,
  toggles an active/pressed visual state while monitoring (filled background,
  similar to how `.waver-action-btn--record` already distinguishes itself by
  color). Respects `hideButtonLabels` exactly like Load File/Record.

## Implementation Notes

- `appendRecordedChunk()` is untouched — monitoring never calls it.
- The empty-state overlay (`emptyOverlay`) gains the third button
  (`monitorButtonEl`) alongside `loadButtonEl`/`recordButtonEl`, following the
  exact construction pattern at `src/waver-element.ts:171-181`.
- A new DOM element for the meter bar (e.g. `.waver-vu-meter` containing a
  `.waver-vu-meter-fill`) is appended once, sibling to `recordingBar`,
  toggled via the same `display` show/hide convention as
  `.waver-recording-bar`.
- `updateOverlay()` (or equivalent) gains a branch for `"monitoring"`: show
  Monitor (pressed) + Load File + Record buttons, show the meter, hide the
  recording bar.

## Testing

- `RecorderEngine` unit tests (`recorder-engine.test.ts`): `startMonitoring()`
  opens a mic graph and fires `onLevel` with a plausible dB value for a known
  input signal, without ever calling `onData`. Peak-to-dB conversion is a pure
  function, unit-testable in isolation (e.g. full-scale sine → ~0dB, silence →
  -Infinity or the floor value).
- `WaverElement` already has a test file (`src/waver-element.test.ts`) that
  drives real recording behavior end-to-end by mocking only
  `navigator.mediaDevices.getUserMedia` (via `makeFakeMediaStream()` in
  `src/waver-element.test-helpers.ts`) — `RecorderEngine` itself is not
  mocked. The plan should add cases there for the state-machine transitions
  in the table above, following that same pattern, rather than relying
  solely on manual verification.
- Manual verification in the demo page as a supplement: Monitor toggles the
  meter and mic permission prompt; clicking Record while monitoring does not
  re-prompt for permission; Escape/Load File/reset() all close an active
  monitoring session; meter is absent during actual recording.
- Demo page (`index.html` / `src/demo/main.ts`) gains a Monitor button wired
  to `startMonitoring()`/`stopMonitoring()` for manual testing, following the
  existing demo wiring conventions for Record/Stop.
