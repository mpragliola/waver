# Input Monitoring VU Meter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a mic-monitoring state to Waver — a "Monitor" button that opens the mic and shows a live left-edge VU meter without recording, with a seamless handoff into actual recording.

**Architecture:** `RecorderEngine` gains a `startMonitoring()` mode that opens the same node graph as `start()` but reports peak dB via a new `onLevel` callback instead of accumulating chunks. `WaverElement` gains a third `recordingState` value (`"monitoring"`), a Monitor button, and a CSS-only VU meter bar whose height is driven directly from `onLevel`. React/Vue wrappers get the new option, methods, and events threaded through exactly like the existing recording surface.

**Tech Stack:** TypeScript, Web Audio API (`ScriptProcessorNode`), Vitest, Playwright (e2e), Lit-free custom elements.

## Global Constraints

- Meter scale: dBFS, -60dB (empty) to 0dB (full), peak-based (not RMS).
- Color zones are fixed, not configurable: green up to -12dB, yellow -12dB to -3dB, red above -3dB. Colors: green `#38A169`, yellow `#ECC94B`, red `#E53E3E` (red matches the existing `--record` accent already used elsewhere in this file).
- Decay is CSS-only: `transition: height 300ms ease-out` on the fill element. No `requestAnimationFrame` loop.
- Monitoring and recording are mutually exclusive. Every state-exit path (`reset()`, `disconnectedCallback`, Load File click, Escape) stops monitoring uniformly, **except** clicking Record while monitoring, which hands off the open stream instead of closing it.
- No stereo metering, no configurable thresholds, no changes to canvas rendering. See the design spec's Non-Goals.
- Follow existing code conventions exactly: `ControlState` for the new button option, event naming (`waver:monitorstart`/`waver:monitorstop`), CSS class naming (`waver-*` prefix), test-fake patterns already used in `recorder-engine.test.ts` and `waver-element.test.ts`.
- Reference spec: `docs/superpowers/specs/2026-08-04-vu-meter-monitoring-design.md`.

---

### Task 1: `RecorderEngine.startMonitoring()` + `onLevel` callback

**Files:**
- Modify: `src/audio/recorder-engine.ts`
- Test: `src/audio/recorder-engine.test.ts`

**Interfaces:**
- Consumes: nothing new from other tasks (this is the base layer).
- Produces:
  - `RecorderEngineEvents.onLevel?: (db: number) => void`
  - `RecorderEngine.startMonitoring(stream?: MediaStream, channelIndex?: number): Promise<void>`
  - `RecorderEngine.getStream(): MediaStream | null` — the currently-open stream (needed by Task 3 for the monitor→record handoff; returns `null` when not open).
  - Peak-to-dB conversion as a pure exported function: `export function peakAmplitudeToDb(peak: number): number` — returns `20 * Math.log10(peak)`, clamped so silence (`peak === 0`) returns `-Infinity` rather than `NaN`.

- [ ] **Step 1: Write failing tests for `peakAmplitudeToDb`**

Add near the top of `src/audio/recorder-engine.test.ts` (new `describe` block, after the existing imports):

```ts
import { peakAmplitudeToDb, RecorderEngine } from "./recorder-engine";

describe("peakAmplitudeToDb", () => {
  it("returns 0 for a full-scale peak", () => {
    expect(peakAmplitudeToDb(1)).toBeCloseTo(0, 5);
  });

  it("returns -Infinity for silence", () => {
    expect(peakAmplitudeToDb(0)).toBe(-Infinity);
  });

  it("returns -6.02dB for a half-scale peak", () => {
    expect(peakAmplitudeToDb(0.5)).toBeCloseTo(-6.02, 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/audio/recorder-engine.test.ts -t peakAmplitudeToDb`
Expected: FAIL — `peakAmplitudeToDb` is not exported (module has no such export yet).

- [ ] **Step 3: Implement `peakAmplitudeToDb`**

In `src/audio/recorder-engine.ts`, add near the top (after imports, before the interface):

```ts
/** Converts a linear peak amplitude (0-1) to dBFS. Silence (0) maps to -Infinity rather than NaN. */
export function peakAmplitudeToDb(peak: number): number {
  return peak > 0 ? 20 * Math.log10(peak) : -Infinity;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/audio/recorder-engine.test.ts -t peakAmplitudeToDb`
Expected: PASS (3 tests)

- [ ] **Step 5: Write failing tests for `startMonitoring()`**

Add a new `describe` block at the end of the file, before the final closing (mirror the "channel selection" block's style and use the same `FakeAudioContext`/`FakeProcessor`/etc. fakes already defined at the top of the file):

```ts
describe("startMonitoring()", () => {
  it("opens a mic graph and fires onLevel instead of onData", async () => {
    const onData = vi.fn();
    const onLevel = vi.fn();
    const engine = new RecorderEngine({ onData, onLevel });

    await engine.startMonitoring();

    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(engine.isRecording).toBe(false); // monitoring is not "recording"

    const ctx = contexts[0];
    const processor = ctx.createScriptProcessor.mock.results[0].value as FakeProcessor;
    const inputData = new Float32Array([0.1, -0.5, 0.3]);
    processor.onaudioprocess?.({ inputBuffer: { getChannelData: () => inputData } });

    expect(onData).not.toHaveBeenCalled();
    expect(onLevel).toHaveBeenCalledTimes(1);
    const db = onLevel.mock.calls[0][0] as number;
    expect(db).toBeCloseTo(20 * Math.log10(0.5), 5); // peak of the chunk is |-0.5|
  });

  it("wires the same silent-gain routing as start()", async () => {
    const engine = new RecorderEngine();
    await engine.startMonitoring();

    const ctx = contexts[0];
    const source = ctx.createMediaStreamSource.mock.results[0].value as FakeSourceNode;
    const processor = ctx.createScriptProcessor.mock.results[0].value as FakeProcessor;
    const gain = ctx.createGain.mock.results[0].value as FakeGain;

    expect(gain.gain.value).toBe(0);
    expect(source.connect).toHaveBeenCalledWith(processor);
    expect(processor.connect).toHaveBeenCalledWith(gain);
    expect(gain.connect).toHaveBeenCalledWith(ctx.destination);
  });

  it("stop() tears down monitoring nodes and stops owned mic tracks", async () => {
    const engine = new RecorderEngine();
    await engine.startMonitoring();
    const ctx = contexts[0];
    const processor = ctx.createScriptProcessor.mock.results[0].value as FakeProcessor;

    engine.stop();

    expect(processor.disconnect).toHaveBeenCalled();
    tracks.forEach((t) => expect(t.stop).toHaveBeenCalled());
  });

  it("getStream() returns the open stream while monitoring, null otherwise", async () => {
    const engine = new RecorderEngine();
    expect(engine.getStream()).toBeNull();
    await engine.startMonitoring();
    expect(engine.getStream()).toBe(stream);
    engine.stop();
    expect(engine.getStream()).toBeNull();
  });

  it("respects channelIndex the same way start() does", async () => {
    const engine = new RecorderEngine();
    const externalTracks = [new FakeTrack(), new FakeTrack()];
    const externalStream = new FakeMediaStream(externalTracks) as unknown as MediaStream;
    const twoChannelSource = new FakeSourceNode();
    twoChannelSource.channelCount = 2;
    const ctx = new FakeAudioContext();
    ctx.createMediaStreamSource = vi.fn(() => twoChannelSource);
    vi.stubGlobal("AudioContext", vi.fn(function () { return ctx; }));

    await engine.startMonitoring(externalStream, 1);

    const splitter = ctx.createChannelSplitter.mock.results[0].value as FakeSplitterNode;
    expect(splitter.connect).toHaveBeenCalledWith(ctx.createScriptProcessor.mock.results[0].value, 1);
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npx vitest run src/audio/recorder-engine.test.ts -t startMonitoring`
Expected: FAIL — `startMonitoring` and `getStream` don't exist yet.

- [ ] **Step 7: Refactor `start()` to share node-graph setup, then implement `startMonitoring()` and `getStream()`**

Replace the whole `RecorderEngine` class body in `src/audio/recorder-engine.ts` with the version below. This factors the shared "open mic, build node graph" logic out of `start()` into a private `openGraph()` that takes the per-chunk callback, so `start()` and `startMonitoring()` differ only in which callback they pass and whether `recording` flips true.

```ts
export interface RecorderEngineEvents {
  onData?: (chunk: Float32Array) => void;
  onLevel?: (db: number) => void;
}

/** Converts a linear peak amplitude (0-1) to dBFS. Silence (0) maps to -Infinity rather than NaN. */
export function peakAmplitudeToDb(peak: number): number {
  return peak > 0 ? 20 * Math.log10(peak) : -Infinity;
}

/**
 * Captures mono microphone audio via getUserMedia + ScriptProcessorNode, streaming raw Float32
 * chunks to the caller as they arrive. The caller owns accumulation/buffering; this class only
 * owns the mic stream and its AudioContext.
 *
 * Uses ScriptProcessorNode (deprecated but universally supported, no separate worklet module to
 * bundle/fetch) rather than AudioWorklet, since this runs synchronously on the main thread with
 * no extra network/module-loading step.
 */
export class RecorderEngine {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  /** Only stop() the stream's tracks on teardown if we acquired it ourselves via getUserMedia; a
   * caller-supplied stream (WebRTC track, shared device stream, etc.) is theirs to manage. */
  private ownsStream = false;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private splitterNode: ChannelSplitterNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private silentGain: GainNode | null = null;
  private recording = false;
  private inputChannelCount = 1;
  private events: RecorderEngineEvents;

  constructor(events: RecorderEngineEvents = {}) {
    this.events = events;
  }

  get isRecording(): boolean {
    return this.recording;
  }

  getSampleRate(): number {
    return this.context?.sampleRate ?? 44100;
  }

  /** Channels the opened source actually has. Valid after start()/startMonitoring(); 1 before. */
  getInputChannelCount(): number {
    return this.inputChannelCount;
  }

  /** Valid after start()/startMonitoring(); remains open after stop() so the caller can reuse it for playback. */
  getContext(): AudioContext | null {
    return this.context;
  }

  /** The currently-open MediaStream, or null if no graph is open. Lets a caller hand this stream
   * to a second RecorderEngine (e.g. monitoring -> recording handoff) without reopening the mic. */
  getStream(): MediaStream | null {
    return this.stream;
  }

  /**
   * Starts capture. Pass an existing `MediaStream` to record from it directly (a specific
   * device chosen by the host app, a WebRTC remote track, a screen-share audio track, etc.);
   * Waver has no business picking an input device itself. Omit it to fall back to the browser's
   * default mic via getUserMedia.
   *
   * `channelIndex` picks which channel of a multi-channel source to keep (0-based) — picked, not
   * summed, since summing a mic on one input with a silent other input costs 6 dB and can comb the
   * signal. Falls back to channel 0 if the source has fewer channels than requested.
   */
  async start(stream?: MediaStream, channelIndex = 0): Promise<void> {
    if (this.recording) return;
    await this.openGraph(stream, channelIndex, (chunk) => this.events.onData?.(chunk));
    this.recording = true;
  }

  /**
   * Opens the mic and reports live peak levels via `onLevel`, without invoking `onData` or
   * accumulating any samples. Shares the same node graph as `start()`; the caller is responsible
   * for treating this as a distinct (non-"recording") state, since `isRecording` stays false.
   */
  async startMonitoring(stream?: MediaStream, channelIndex = 0): Promise<void> {
    if (this.context) return; // already open (monitoring or recording)
    await this.openGraph(stream, channelIndex, undefined, (db) => this.events.onLevel?.(db));
  }

  private async openGraph(
    stream: MediaStream | undefined,
    channelIndex: number,
    onChunk: ((chunk: Float32Array) => void) | undefined,
    onLevel?: (db: number) => void
  ): Promise<void> {
    const mediaStream = stream ?? (await navigator.mediaDevices.getUserMedia({ audio: true }));
    const context = new AudioContext();
    const sourceNode = context.createMediaStreamSource(mediaStream);
    const processor = context.createScriptProcessor(4096, 1, 1);
    const silentGain = context.createGain();
    silentGain.gain.value = 0;

    this.inputChannelCount = sourceNode.channelCount;
    const activeChannel = channelIndex > 0 && channelIndex < this.inputChannelCount ? channelIndex : 0;

    let splitterNode: ChannelSplitterNode | null = null;
    if (activeChannel > 0) {
      splitterNode = context.createChannelSplitter(this.inputChannelCount);
      sourceNode.connect(splitterNode);
      splitterNode.connect(processor, activeChannel);
    } else {
      sourceNode.connect(processor);
    }

    processor.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      if (onChunk) {
        const chunk = new Float32Array(input.length);
        chunk.set(input);
        onChunk(chunk);
      }
      if (onLevel) {
        let peak = 0;
        for (let i = 0; i < input.length; i++) {
          const abs = Math.abs(input[i]);
          if (abs > peak) peak = abs;
        }
        onLevel(peakAmplitudeToDb(peak));
      }
    };

    // ScriptProcessorNode only fires onaudioprocess while connected through to a destination;
    // route through a silent gain so the mic is never actually audible.
    processor.connect(silentGain);
    silentGain.connect(context.destination);

    this.stream = mediaStream;
    this.ownsStream = stream === undefined;
    this.context = context;
    this.sourceNode = sourceNode;
    this.splitterNode = splitterNode;
    this.processor = processor;
    this.silentGain = silentGain;
  }

  /** Stops capture/monitoring and releases the mic, but leaves the AudioContext open for reuse (e.g. playback). */
  stop(): void {
    if (!this.context) return;
    this.recording = false;
    this.releaseCaptureNodes();
  }

  /** Stops capture/monitoring and fully tears down, including closing the AudioContext. */
  cancel(): void {
    if (!this.context) return;
    this.recording = false;
    this.releaseCaptureNodes();
    this.context.close().catch(() => {});
    this.context = null;
  }

  private releaseCaptureNodes(): void {
    this.processor?.disconnect();
    this.splitterNode?.disconnect();
    this.sourceNode?.disconnect();
    this.silentGain?.disconnect();
    if (this.ownsStream) this.stream?.getTracks().forEach((t) => t.stop());
    this.processor = null;
    this.splitterNode = null;
    this.sourceNode = null;
    this.silentGain = null;
    this.stream = null;
    this.ownsStream = false;
  }
}
```

Note the behavior change folded in here: `stop()` previously no-opped when `!this.recording`; it now no-ops when `!this.context`, so it also works to tear down a monitoring-only graph (which never sets `recording = true`). This is safe for the existing recording path since `this.context` is always set whenever `this.recording` is true.

- [ ] **Step 8: Run all recorder-engine tests to verify they pass**

Run: `npx vitest run src/audio/recorder-engine.test.ts`
Expected: PASS (all existing tests + new ones, ~24 total)

- [ ] **Step 9: Commit**

```bash
git add src/audio/recorder-engine.ts src/audio/recorder-engine.test.ts
git commit -m "feat: add RecorderEngine.startMonitoring() for mic level metering without capture"
```

---

### Task 2: `monitorIcon` + CSS for the Monitor button and VU meter

**Files:**
- Modify: `src/core/icons.ts`
- Modify: `src/waver-element.ts` (styleSheet() function only — no behavior yet)

**Interfaces:**
- Consumes: nothing (pure CSS/markup groundwork for Task 3).
- Produces: `monitorIcon` export from `src/core/icons.ts`; CSS classes `.waver-action-btn--monitor`, `.waver-action-btn--monitor.waver-action-btn--active`, `.waver-vu-meter`, `.waver-vu-meter-fill`, `.waver-vu-meter-fill--warn`, `.waver-vu-meter-fill--clip`.

This task has no unit-testable behavior (it's markup/CSS only) — verification is visual, done in Task 3 once the button/meter are wired up. No commit checkpoint needed on its own; fold into Task 3's commit. Skip Steps 1-2 (no failing test to write) and go straight to implementation.

- [ ] **Step 1: Add `monitorIcon`**

In `src/core/icons.ts`, add after `micIcon` (a waveform/eye-style glyph reading as "watch levels", distinct from the filled mic used for Record):

```ts
export const monitorIcon =
  '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8L4.5 8L6 4L9 12L10.5 8L14 8"/></svg>';
```

- [ ] **Step 2: Add CSS for the Monitor button variant**

In `src/waver-element.ts`, inside `styleSheet()`, immediately after the existing `.waver-action-btn--record { ... }` rule (around line 987 as of this writing — find it by searching for that exact selector), add:

```css
    .waver-action-btn--monitor { color: #2B6CB0; border-color: #2B6CB0; }
    .waver-action-btn--monitor.waver-action-btn--active { background: #2B6CB0; color: #fff; }
```

- [ ] **Step 3: Add CSS for the left-edge VU meter**

In the same `styleSheet()` function, add after the `.waver-action-btn--icon-only span { display: none; }` rule and before `.waver-recording-bar`:

```css
    .waver-vu-meter {
      position: absolute; left: 14px; top: 14px; bottom: 14px; z-index: 5;
      width: 12px; border-radius: 999px; overflow: hidden;
      background: rgba(127, 127, 127, 0.18); border: 1px solid rgba(127, 127, 127, 0.3);
      display: none;
    }
    .waver-vu-meter-fill {
      position: absolute; bottom: 0; left: 0; right: 0; height: 0%;
      background: #38A169; border-radius: 999px;
      transition: height 300ms ease-out, background-color 120ms ease;
    }
    .waver-vu-meter-fill--warn { background: #ECC94B; }
    .waver-vu-meter-fill--clip { background: #E53E3E; }
```

- [ ] **Step 4: Verify the build still compiles (no runtime behavior yet)**

Run: `npx tsc -p tsconfig.build.json --noEmit`
Expected: no errors (this task only added an unused-so-far export and CSS text, both valid TypeScript).

No commit here — proceed directly into Task 3, which uses this markup/CSS and commits both together.

---

### Task 3: `WaverElement` monitoring state, Monitor button, VU meter wiring

**Files:**
- Modify: `src/waver-element.ts`
- Test: `src/waver-element.test.ts`
- Test helpers: `src/waver-element.test-helpers.ts` (read, likely no changes needed — reuses `makeFakeMediaStream()`)

**Interfaces:**
- Consumes:
  - `RecorderEngine.startMonitoring(stream?, channelIndex?): Promise<void>` (Task 1)
  - `RecorderEngine.getStream(): MediaStream | null` (Task 1)
  - `RecorderEngineEvents.onLevel?: (db: number) => void` (Task 1)
  - `monitorIcon` (Task 2), `.waver-action-btn--monitor`, `.waver-vu-meter`, `.waver-vu-meter-fill` classes (Task 2)
- Produces:
  - `WaverElement.startMonitoring(stream?: MediaStream, channelIndex?: number): Promise<void>`
  - `WaverElement.stopMonitoring(): void`
  - `WaverElement.isMonitoring(): boolean`
  - `WaverOptions.monitorButton: ControlState` (new field in `src/core/types.ts`)
  - `WaverEventMap["waver:monitorstart"]: Record<string, never>`
  - `WaverEventMap["waver:monitorstop"]: Record<string, never>`
  - These are consumed by Task 4 (React/Vue wrappers) and Task 5 (demo page).

- [ ] **Step 1: Add `monitorButton` to `WaverOptions` and the two new events to `WaverEventMap`**

In `src/core/types.ts`, add to the `WaverOptions` interface, immediately after the `recordButton` field's doc comment and declaration:

```ts
  /** State of the built-in "Monitor" button shown while no audio is loaded. Opens the mic and
   * shows a live level meter without recording; toggled off again by clicking it a second time. */
  monitorButton: ControlState;
```

And add to `WaverEventMap`, immediately after `"waver:recordstart"`'s entry:

```ts
  /** Fires when the built-in Monitor button opens the mic for level metering (not recording). */
  "waver:monitorstart": Record<string, never>;
  /** Fires when monitoring stops, whether via the Monitor button, an exit path (reset/Load File/
   * Escape/disconnect), or a handoff into startRecording(). */
  "waver:monitorstop": Record<string, never>;
```

- [ ] **Step 2: Add `monitorButton: "enabled"` to `DEFAULT_OPTIONS`**

In `src/waver-element.ts`, in the `DEFAULT_OPTIONS` object, add after the `recordButton: "enabled",` line:

```ts
  monitorButton: "enabled",
```

- [ ] **Step 3: Write failing tests for the monitoring state machine**

The existing `describe("recording", ...)` block (around line 693) defines a local `mount()` helper (top of file, constructs+appends a `<wave-r>`) and a local `stubMicSuccess()` function that stubs both `navigator.mediaDevices.getUserMedia` (via the file-scoped `makeFakeMediaStream()` at the bottom of the file) and `AudioContext` (via `makeFakeAudioContext()` imported from `./waver-element.test-helpers`). Add a new `describe("monitoring", ...)` block immediately after the `"recording"` block, with its own copy of `stubMicSuccess()` (it's locally scoped to the `"recording"` block, not exported — either duplicate it or hoist it to module scope and use both; duplicating is consistent with this file's existing style of small per-block local helpers):

```ts
describe("monitoring", () => {
  function stubMicSuccess() {
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn(async () => makeFakeMediaStream()) },
    });
    vi.stubGlobal(
      "AudioContext",
      vi.fn(function () {
        return makeFakeAudioContext();
      })
    );
  }

  it("startMonitoring() opens the mic, sets isMonitoring() true, and emits monitorstart", async () => {
    const el = mount();
    stubMicSuccess();
    const onStart = vi.fn();
    el.addEventListener("waver:monitorstart", onStart);

    await el.startMonitoring();

    expect(el.isMonitoring()).toBe(true);
    expect(el.isRecording()).toBe(false);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("stopMonitoring() closes the mic, sets isMonitoring() false, and emits monitorstop", async () => {
    const el = mount();
    stubMicSuccess();
    await el.startMonitoring();
    const onStop = vi.fn();
    el.addEventListener("waver:monitorstop", onStop);

    el.stopMonitoring();

    expect(el.isMonitoring()).toBe(false);
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("clicking Record while monitoring hands off the open stream without a second getUserMedia call", async () => {
    const el = mount();
    stubMicSuccess();
    await el.startMonitoring();
    const getUserMedia = (navigator as unknown as { mediaDevices: { getUserMedia: ReturnType<typeof vi.fn> } })
      .mediaDevices.getUserMedia;

    await el.startRecording();

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(el.isMonitoring()).toBe(false);
    expect(el.isRecording()).toBe(true);
  });

  it("reset() stops an active monitoring session", async () => {
    const el = mount();
    stubMicSuccess();
    await el.startMonitoring();

    el.reset();

    expect(el.isMonitoring()).toBe(false);
  });

  it("monitorButton: 'disabled' prevents startMonitoring() via a click but not via the public API", async () => {
    const el = mount();
    stubMicSuccess();
    el.configure({ monitorButton: "disabled" });
    const shadow = el.shadowRoot!;
    const monitorBtn = shadow.querySelector(".waver-action-btn--monitor") as HTMLButtonElement;

    monitorBtn.click();
    expect(el.isMonitoring()).toBe(false); // click is blocked by disabled state

    await el.startMonitoring(); // public API call, unaffected by button state (mirrors recordButton's existing test)
    expect(el.isMonitoring()).toBe(true);
  });

  it("recorderror fires and isMonitoring() stays false when getUserMedia rejects during startMonitoring()", async () => {
    const el = mount();
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn(async () => {
          throw new DOMException("denied", "NotAllowedError");
        }),
      },
    });
    const onError = vi.fn();
    el.addEventListener("waver:recorderror", onError);

    await el.startMonitoring();

    expect(el.isMonitoring()).toBe(false);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run src/waver-element.test.ts -t monitoring`
Expected: FAIL — `startMonitoring`/`stopMonitoring`/`isMonitoring` don't exist on `WaverElement` yet.

- [ ] **Step 5: Add monitoring fields and DOM elements**

In `src/waver-element.ts`, change the `recordingState` field type and add a stream-tracking field. Find:

```ts
  private recordingState: "idle" | "recording" = "idle";
```

Replace with:

```ts
  private recordingState: "idle" | "monitoring" | "recording" = "idle";
  private monitorEngine: RecorderEngine | null = null;
```

Find the field group with `private loadButtonEl`/`private recordButtonEl` and add a sibling field plus the VU meter fill element:

```ts
  private loadButtonEl: HTMLButtonElement;
  private recordButtonEl: HTMLButtonElement;
  private monitorButtonEl: HTMLButtonElement;
```

and near `private recordingTimeEl: HTMLSpanElement;` add:

```ts
  private vuMeterEl: HTMLDivElement;
  private vuMeterFillEl: HTMLDivElement;
```

- [ ] **Step 6: Construct the Monitor button and VU meter DOM in the constructor**

In the constructor, immediately after the existing block that builds `this.recordButtonEl` and before `this.emptyOverlay.append(this.loadButtonEl, this.recordButtonEl);`, add the Monitor button and change the append call:

```ts
    this.monitorButtonEl = document.createElement("button");
    this.monitorButtonEl.type = "button";
    this.monitorButtonEl.className = "waver-action-btn waver-action-btn--monitor";
    this.monitorButtonEl.setAttribute("aria-label", "Monitor");
    this.monitorButtonEl.innerHTML = `${monitorIcon}<span>Monitor</span>`;
    this.emptyOverlay.append(this.loadButtonEl, this.monitorButtonEl, this.recordButtonEl);
```

(Remove the old `this.emptyOverlay.append(this.loadButtonEl, this.recordButtonEl);` line — replaced by the three-button version above.)

Add the `monitorIcon` import at the top of the file:

```ts
import { closeIcon, micIcon, monitorIcon, stopIcon, uploadIcon } from "./core/icons";
```

Immediately after the block constructing `this.recordingBar` (after `this.recordingBar.append(recordingReadout, stopButton);`), construct the VU meter:

```ts
    this.vuMeterEl = document.createElement("div");
    this.vuMeterEl.className = "waver-vu-meter";
    this.vuMeterFillEl = document.createElement("div");
    this.vuMeterFillEl.className = "waver-vu-meter-fill";
    this.vuMeterEl.append(this.vuMeterFillEl);
```

Add `this.vuMeterEl` to the `this.container.append(...)` call (any position is fine since it's `position: absolute`; add it after `this.emptyOverlay`):

```ts
    this.container.append(
      this.rulerCanvas,
      this.waveStack,
      this.minimapCanvas,
      this.emptyOverlay,
      this.vuMeterEl,
      this.cancelButtonEl,
      this.confirmOverlayEl,
      this.recordingBar,
      this.fileInput
    );
```

- [ ] **Step 7: Wire the Monitor button's click handler**

Immediately after the existing `this.recordButtonEl.addEventListener(...)` block, add:

```ts
    this.monitorButtonEl.addEventListener("click", () => {
      if (this.opts.monitorButton !== "enabled") return;
      if (this.recordingState === "monitoring") {
        this.stopMonitoring();
      } else {
        void this.startMonitoring();
      }
    });
```

- [ ] **Step 8: Implement `startMonitoring()`, `stopMonitoring()`, `isMonitoring()`**

Add these public methods immediately after `isRecording()`:

```ts
  isMonitoring(): boolean {
    return this.recordingState === "monitoring";
  }

  /**
   * Opens the mic and starts live level metering, without capturing samples. Same stream/
   * channelIndex conventions as startRecording(): pass an explicit MediaStream to monitor a
   * specific device, or omit to use the stream set via setInputStream(), falling back to the
   * default mic via getUserMedia.
   */
  async startMonitoring(stream?: MediaStream, channelIndex?: number): Promise<void> {
    if (this.recordingState !== "idle") return;

    const engine = new RecorderEngine({ onLevel: (db) => this.updateVuMeter(db) });
    try {
      await engine.startMonitoring(stream ?? this.presetInputStream ?? undefined, channelIndex ?? this.opts.channelIndex);
    } catch (err) {
      this.emit("waver:recorderror", { error: err as Error });
      return;
    }

    this.monitorEngine = engine;
    this.recordingState = "monitoring";
    this.updateOverlay();
    this.emit("waver:monitorstart", {});
  }

  /** Closes the mic and stops metering. No-op if not monitoring. */
  stopMonitoring(): void {
    if (this.recordingState !== "monitoring" || !this.monitorEngine) return;
    this.monitorEngine.cancel();
    this.monitorEngine = null;
    this.recordingState = "idle";
    this.resetVuMeter();
    this.updateOverlay();
    this.emit("waver:monitorstop", {});
  }

  private updateVuMeter(db: number): void {
    const clamped = Math.max(-60, Math.min(0, db));
    const pct = ((clamped + 60) / 60) * 100;
    this.vuMeterFillEl.style.height = `${pct}%`;
    this.vuMeterFillEl.classList.toggle("waver-vu-meter-fill--warn", db >= -12 && db < -3);
    this.vuMeterFillEl.classList.toggle("waver-vu-meter-fill--clip", db >= -3);
  }

  private resetVuMeter(): void {
    this.vuMeterFillEl.style.height = "0%";
    this.vuMeterFillEl.classList.remove("waver-vu-meter-fill--warn", "waver-vu-meter-fill--clip");
  }
```

- [ ] **Step 9: Wire the monitor-to-record handoff in `startRecording()`**

Find the existing `startRecording()` method:

```ts
  async startRecording(stream?: MediaStream, channelIndex?: number): Promise<void> {
    if (this.recordingState === "recording") return;

    const engine = new RecorderEngine({ onData: (chunk) => this.appendRecordedChunk(chunk) });
    try {
      await engine.start(stream ?? this.presetInputStream ?? undefined, channelIndex ?? this.opts.channelIndex);
    } catch (err) {
      this.emit("waver:recorderror", { error: err as Error });
      return;
    }
```

Replace with (adds a handoff branch that fires before the existing `"recording"` guard-and-open sequence, only taken when currently monitoring):

```ts
  async startRecording(stream?: MediaStream, channelIndex?: number): Promise<void> {
    if (this.recordingState === "recording") return;

    let handoffStream = stream;
    if (this.recordingState === "monitoring" && this.monitorEngine) {
      handoffStream = handoffStream ?? this.monitorEngine.getStream() ?? undefined;
      this.monitorEngine.releaseNodesOnly(); // added in Step 10 below; keeps tracks alive for the new engine
      this.monitorEngine = null;
      this.recordingState = "idle";
      this.resetVuMeter();
      this.emit("waver:monitorstop", {});
    }

    const engine = new RecorderEngine({ onData: (chunk) => this.appendRecordedChunk(chunk) });
    try {
      await engine.start(handoffStream ?? this.presetInputStream ?? undefined, channelIndex ?? this.opts.channelIndex);
    } catch (err) {
      this.emit("waver:recorderror", { error: err as Error });
      return;
    }
```

(The rest of the method — from `this.recorderEngine = engine;` onward — is unchanged.)

This step references `RecorderEngine.releaseNodesOnly()`, added next in Step 10 — do Step 10 before running/committing this task, or the build will fail to typecheck in between.

- [ ] **Step 10: Add `RecorderEngine.releaseNodesOnly()` for handoff teardown**

Plain `stop()` stops the stream's tracks whenever `ownsStream` is true — which is exactly the common monitoring case (no explicit stream argument, acquired via `getUserMedia`). The handoff in Step 9 must release the monitoring engine's processing nodes WITHOUT stopping those tracks, since the new recording engine is about to reuse them. Add a dedicated method to `RecorderEngine` (in `src/audio/recorder-engine.ts`, alongside `stop()`/`cancel()`):

```ts
  /** Releases this engine's processing nodes WITHOUT stopping the stream's tracks, even if this
   * engine acquired the stream itself. For handing an open stream off to a different RecorderEngine
   * instance (e.g. monitoring -> recording) without an audible drop or a second permission prompt. */
  releaseNodesOnly(): void {
    if (!this.context) return;
    this.recording = false;
    this.processor?.disconnect();
    this.splitterNode?.disconnect();
    this.sourceNode?.disconnect();
    this.silentGain?.disconnect();
    this.processor = null;
    this.splitterNode = null;
    this.sourceNode = null;
    this.silentGain = null;
    this.stream = null;
    this.ownsStream = false;
  }
```

Add a unit test in `src/audio/recorder-engine.test.ts` (in the `startMonitoring()` describe block added in Task 1):

```ts
  it("releaseNodesOnly() disconnects nodes without stopping tracks, even for a self-acquired stream", async () => {
    const engine = new RecorderEngine();
    await engine.startMonitoring(); // no explicit stream -> acquired via getUserMedia -> ownsStream is true
    const ctx = contexts[0];
    const processor = ctx.createScriptProcessor.mock.results[0].value as FakeProcessor;

    engine.releaseNodesOnly();

    expect(processor.disconnect).toHaveBeenCalled();
    tracks.forEach((t) => expect(t.stop).not.toHaveBeenCalled());
    expect(engine.getStream()).toBeNull();
  });
```

Run: `npx vitest run src/audio/recorder-engine.test.ts -t releaseNodesOnly`
Expected: PASS.

- [ ] **Step 11: Wire monitoring teardown into `reset()`, `disconnectedCallback()`, Load File click, and Escape**

In `reset()`, find:

```ts
  reset(): void {
    if (this.recordingState === "recording") {
      this.recorderEngine?.cancel();
      this.recorderEngine = null;
      this.recordingState = "idle";
      this.stopRecordingTimerDisplay();
    }
```

Add an `else if` branch immediately after:

```ts
  reset(): void {
    if (this.recordingState === "recording") {
      this.recorderEngine?.cancel();
      this.recorderEngine = null;
      this.recordingState = "idle";
      this.stopRecordingTimerDisplay();
    } else if (this.recordingState === "monitoring") {
      this.monitorEngine?.cancel();
      this.monitorEngine = null;
      this.recordingState = "idle";
      this.resetVuMeter();
    }
```

In `disconnectedCallback()`, find:

```ts
  disconnectedCallback(): void {
    this.resizeObserver?.disconnect();
    this.audioEngine?.dispose();
    this.recorderEngine?.cancel();
    this.stopRecordingTimerDisplay();
```

Add a line for the monitor engine:

```ts
  disconnectedCallback(): void {
    this.resizeObserver?.disconnect();
    this.audioEngine?.dispose();
    this.recorderEngine?.cancel();
    this.monitorEngine?.cancel();
    this.stopRecordingTimerDisplay();
```

In the Load File click handler, find:

```ts
    this.loadButtonEl.addEventListener("click", () => {
      if (this.opts.loadButton !== "enabled") return;
      this.fileInput.click();
    });
```

Replace with:

```ts
    this.loadButtonEl.addEventListener("click", () => {
      if (this.opts.loadButton !== "enabled") return;
      this.stopMonitoring();
      this.fileInput.click();
    });
```

(`stopMonitoring()` is already a no-op when not monitoring, so this is safe unconditionally.)

In `handleEscapeKey`, find:

```ts
  private handleEscapeKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape" && this.confirmOverlayEl.style.display !== "none") this.closeCancelConfirm();
  };
```

Replace with:

```ts
  private handleEscapeKey = (e: KeyboardEvent): void => {
    if (e.key !== "Escape") return;
    if (this.confirmOverlayEl.style.display !== "none") this.closeCancelConfirm();
    else if (this.recordingState === "monitoring") this.stopMonitoring();
  };
```

- [ ] **Step 12: Update `updateOverlay()` to show/hide the Monitor button and VU meter**

Find:

```ts
  private updateOverlay(): void {
    const showButtons = !this.hasAudio() && this.recordingState !== "recording";
    const loadVisible = showButtons && this.opts.loadButton !== "hidden";
    const recordVisible = showButtons && this.opts.recordButton !== "hidden";
    this.loadButtonEl.style.display = loadVisible ? "" : "none";
    this.recordButtonEl.style.display = recordVisible ? "" : "none";
    this.loadButtonEl.disabled = this.opts.loadButton === "disabled";
    this.recordButtonEl.disabled = this.opts.recordButton === "disabled";
    this.loadButtonEl.classList.toggle("waver-action-btn--icon-only", this.opts.hideButtonLabels);
    this.recordButtonEl.classList.toggle("waver-action-btn--icon-only", this.opts.hideButtonLabels);
    this.emptyOverlay.style.display = loadVisible || recordVisible ? "flex" : "none";
    this.recordingBar.style.display = this.recordingState === "recording" ? "flex" : "none";
```

Replace with:

```ts
  private updateOverlay(): void {
    const showButtons = !this.hasAudio() && this.recordingState !== "recording";
    const loadVisible = showButtons && this.opts.loadButton !== "hidden";
    const recordVisible = showButtons && this.opts.recordButton !== "hidden";
    const monitorVisible = showButtons && this.opts.monitorButton !== "hidden";
    this.loadButtonEl.style.display = loadVisible ? "" : "none";
    this.recordButtonEl.style.display = recordVisible ? "" : "none";
    this.monitorButtonEl.style.display = monitorVisible ? "" : "none";
    this.loadButtonEl.disabled = this.opts.loadButton === "disabled";
    this.recordButtonEl.disabled = this.opts.recordButton === "disabled";
    this.monitorButtonEl.disabled = this.opts.monitorButton === "disabled";
    this.loadButtonEl.classList.toggle("waver-action-btn--icon-only", this.opts.hideButtonLabels);
    this.recordButtonEl.classList.toggle("waver-action-btn--icon-only", this.opts.hideButtonLabels);
    this.monitorButtonEl.classList.toggle("waver-action-btn--icon-only", this.opts.hideButtonLabels);
    this.monitorButtonEl.classList.toggle("waver-action-btn--active", this.recordingState === "monitoring");
    this.emptyOverlay.style.display = loadVisible || recordVisible || monitorVisible ? "flex" : "none";
    this.recordingBar.style.display = this.recordingState === "recording" ? "flex" : "none";
    this.vuMeterEl.style.display = this.recordingState === "monitoring" ? "block" : "none";
```

(Leave the rest of the method — the `cancelVisible` block — unchanged.)

- [ ] **Step 13: Run all `waver-element.test.ts` tests**

Run: `npx vitest run src/waver-element.test.ts`
Expected: PASS (existing 73 + new monitoring tests from Step 3, adjusted to match real helper names)

- [ ] **Step 14: Run the full unit test suite and typecheck**

Run: `npx vitest run && npx tsc -p tsconfig.build.json --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 15: Manual visual verification in the demo (see Task 5 for demo wiring) — defer actual manual check to after Task 5**

- [ ] **Step 16: Commit**

```bash
git add src/waver-element.ts src/core/types.ts src/core/icons.ts src/audio/recorder-engine.ts src/audio/recorder-engine.test.ts src/waver-element.test.ts
git commit -m "feat: add mic monitoring state with Monitor button and left-edge VU meter"
```

---

### Task 4: Thread `monitorButton` and monitoring methods/events through React and Vue wrappers

**Files:**
- Modify: `src/react/Waver.tsx`
- Modify: `src/vue/Waver.ts`
- Test: `src/react/Waver.test.tsx`
- Test: `src/vue/Waver.test.ts`

**Interfaces:**
- Consumes: `WaverElement.startMonitoring/stopMonitoring/isMonitoring` (Task 3), `WaverOptions.monitorButton` (Task 3), `waver:monitorstart`/`waver:monitorstop` events (Task 3).
- Produces: `WaverHandle.startMonitoring/stopMonitoring/isMonitoring` (React), Vue `expose()` equivalents, `onMonitorStart`/`onMonitorStop` props (React) and `monitorstart`/`monitorstop` emits (Vue).

- [ ] **Step 1: Check existing test patterns for `recordButton`/`onRecordStart` in both wrapper test files**

Read `src/react/Waver.test.tsx` and `src/vue/Waver.test.ts` for the exact test structure used for `recordButton` passthrough and `onRecordStart`/`recordstart` event forwarding — copy that structure for monitoring below rather than inventing new patterns.

- [ ] **Step 2: Write failing React wrapper tests**

Add to `src/react/Waver.test.tsx`, following the existing passthrough-test pattern for `recordButton`:

```tsx
it("passes monitorButton through to configure()", () => {
  // mirror the existing recordButton passthrough test's structure exactly
});

it("exposes startMonitoring/stopMonitoring/isMonitoring via the ref", () => {
  // mirror the existing startRecording/stopRecording/isRecording ref test's structure exactly
});

it("forwards waver:monitorstart/waver:monitorstop as onMonitorStart/onMonitorStop", () => {
  // mirror the existing onRecordStart/onRecordStop event-forwarding test's structure exactly
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/react/Waver.test.tsx -t monitor`
Expected: FAIL.

- [ ] **Step 4: Implement React wrapper changes**

In `src/react/Waver.tsx`:

Add to `WaverHandle`:

```ts
  startMonitoring: (stream?: MediaStream) => void;
  stopMonitoring: () => void;
  isMonitoring: () => boolean;
```

(Insert after `stopRecording: () => void;`.)

Add to `WaverProps`:

```ts
  onMonitorStart?: () => void;
  onMonitorStop?: () => void;
```

(Insert after `onRecordError?: (error: Error) => void;`.)

Destructure the two new props in the component body (alongside the existing `onRecordStart, onRecordStop, onRecordError,`):

```ts
    onMonitorStart,
    onMonitorStop,
```

Add to the `useImperativeHandle` object (after `stopRecording: () => elRef.current?.stopRecording(),`):

```ts
      startMonitoring: (stream) => void elRef.current?.startMonitoring(stream),
      stopMonitoring: () => elRef.current?.stopMonitoring(),
      isMonitoring: () => elRef.current?.isMonitoring() ?? false,
```

Add to the `handlers` array (after the `waver:recorderror` entry):

```ts
      ["waver:monitorstart", (() => onMonitorStart?.()) as EventListener],
      ["waver:monitorstop", (() => onMonitorStop?.()) as EventListener],
```

Add `onMonitorStart, onMonitorStop,` to that `useEffect`'s dependency array.

- [ ] **Step 5: Run React wrapper tests to verify pass**

Run: `npx vitest run src/react/Waver.test.tsx`
Expected: PASS.

- [ ] **Step 6: Write failing Vue wrapper tests**

Add to `src/vue/Waver.test.ts`, mirroring the existing `recordButton`/`recordstart` test structure:

```ts
it("passes monitorButton through to configure()", () => {
  // mirror the existing recordButton passthrough test
});

it("exposes startMonitoring/stopMonitoring/isMonitoring", () => {
  // mirror the existing startRecording/stopRecording/isRecording exposed-method test
});

it("emits monitorstart/monitorstop", () => {
  // mirror the existing recordstart/recordstop emit test
});
```

- [ ] **Step 7: Run to verify failure**

Run: `npx vitest run src/vue/Waver.test.ts -t monitor`
Expected: FAIL.

- [ ] **Step 8: Implement Vue wrapper changes**

In `src/vue/Waver.ts`:

Add to `props`, after `recordButton: { type: String as PropType<ControlState>, default: undefined },`:

```ts
    monitorButton: { type: String as PropType<ControlState>, default: undefined },
```

Add to `emits`, after `recordstop: (_positionSample: number) => true,` and its neighbors (near `recorderror`):

```ts
    monitorstart: () => true,
    monitorstop: () => true,
```

Add to the `listeners` array, after the `waver:recorderror` entry:

```ts
      ["waver:monitorstart", (() => emit("monitorstart")) as EventListener],
      ["waver:monitorstop", (() => emit("monitorstop")) as EventListener],
```

Add to `collectOptions()`, after `if (props.recordButton !== undefined) opts.recordButton = props.recordButton;`:

```ts
      if (props.monitorButton !== undefined) opts.monitorButton = props.monitorButton;
```

Add to the `expose(...)` object, after `stopRecording: () => elRef.value?.stopRecording(),`:

```ts
      startMonitoring: (stream?: MediaStream) => elRef.value?.startMonitoring(stream),
      stopMonitoring: () => elRef.value?.stopMonitoring(),
      isMonitoring: () => elRef.value?.isMonitoring() ?? false,
```

- [ ] **Step 9: Run Vue wrapper tests to verify pass**

Run: `npx vitest run src/vue/Waver.test.ts`
Expected: PASS.

- [ ] **Step 10: Run the full test suite and typecheck**

Run: `npx vitest run && npx tsc -p tsconfig.build.json --noEmit`
Expected: PASS, no errors.

- [ ] **Step 11: Commit**

```bash
git add src/react/Waver.tsx src/react/Waver.test.tsx src/vue/Waver.ts src/vue/Waver.test.ts
git commit -m "feat: expose monitoring (startMonitoring/stopMonitoring/isMonitoring) in Vue/React wrappers"
```

---

### Task 5: Demo page wiring + manual/e2e verification

**Files:**
- Modify: `index.html`
- Modify: `src/demo/main.ts`
- Test (e2e): `e2e/recording.spec.ts` (add monitoring cases) or a new `e2e/monitoring.spec.ts` — prefer adding to `recording.spec.ts` since it already sets up mic mocking; only split into a new file if that file grows unwieldy.

**Interfaces:**
- Consumes: `WaverElement.startMonitoring/stopMonitoring/isMonitoring` (Task 3).
- Produces: nothing consumed by later tasks — this is the last task.

- [ ] **Step 1: Read `e2e/recording.spec.ts` and `e2e/helpers.ts` for the mic-mocking pattern**

Confirm how `getUserMedia` is stubbed at the browser level for e2e (likely `page.addInitScript` or similar in `e2e/helpers.ts`) before writing new e2e cases.

- [ ] **Step 2: Add a Monitor button to the demo page**

In `index.html`, find the existing controls row (near `<button id="reset">Reset</button>`) and add:

```html
      <button id="monitor">Monitor</button>
```

- [ ] **Step 3: Wire it in the demo script**

In `src/demo/main.ts`, add near the other button element lookups:

```ts
const monitorButton = document.getElementById("monitor") as HTMLButtonElement;
```

And near the other event listeners:

```ts
monitorButton.addEventListener("click", () => {
  if (waver.isMonitoring()) {
    waver.stopMonitoring();
  } else {
    void waver.startMonitoring();
  }
});
```

- [ ] **Step 4: Write failing e2e test**

Add to `e2e/recording.spec.ts`:

```ts
test("Monitor button opens the mic and shows the VU meter without recording", async ({ page }) => {
  await page.goto("/");
  const waver = page.locator("wave-r");
  await page.click("#monitor");
  await expect(waver.locator(".waver-vu-meter")).toBeVisible();
  await expect(waver.locator(".waver-recording-bar")).toBeHidden();
});

test("clicking Record while monitoring transitions straight to recording", async ({ page }) => {
  await page.goto("/");
  const waver = page.locator("wave-r");
  await page.click("#monitor");
  await expect(waver.locator(".waver-vu-meter")).toBeVisible();

  await page.click(".waver-action-btn--record");

  await expect(waver.locator(".waver-vu-meter")).toBeHidden();
  await expect(waver.locator(".waver-recording-bar")).toBeVisible();
});
```

(Match whatever mic-mocking setup the existing tests in this file use — likely a `test.beforeEach` already stubs `getUserMedia`; reuse it rather than duplicating.)

- [ ] **Step 5: Run to verify it fails, then run again after implementation to verify it passes**

Run: `npx playwright test e2e/recording.spec.ts`
Expected: FAIL before Steps 2-3 are done, PASS after.

- [ ] **Step 6: Manual verification pass**

With `npm run dev` running, open the demo in a browser and confirm:
- Clicking Monitor prompts for mic permission and shows the left-edge VU meter reacting to actual mic input (speak/tap the mic to see green→yellow→red transitions).
- Clicking Monitor again closes it (meter disappears, no lingering mic indicator in the browser tab).
- Clicking Record while monitoring does NOT trigger a second permission prompt, and transitions straight into the recording bar.
- Pressing Escape while monitoring (with no confirm dialog open) closes monitoring.
- Clicking "Load File" while monitoring closes the mic first, then opens the file picker.
- `hideButtonLabels` toggle (existing demo button) also collapses the Monitor button to icon-only.

- [ ] **Step 7: Run the full test suite (unit + e2e) one final time**

Run: `npx vitest run && npx playwright test`
Expected: full PASS.

- [ ] **Step 8: Update `CHANGELOG.md`**

Add an entry under the current unreleased/dated section (check the file's existing convention — incremental entry under the latest git tag or today's date per repo convention) describing: "Added mic input monitoring: a Monitor button opens the mic and shows a live VU meter without recording; clicking Record while monitoring hands off seamlessly."

- [ ] **Step 9: Commit**

```bash
git add index.html src/demo/main.ts e2e/recording.spec.ts CHANGELOG.md
git commit -m "test: add demo wiring and e2e coverage for mic monitoring"
```

---

## Post-Plan Note

This plan implements monitoring + VU meter only. The auto-record-on-threshold follow-up (triggering `startRecording()` automatically when the monitored level crosses a threshold) is a separate spec/plan and is expected to consume `onLevel`/`updateVuMeter`'s dB value as its trigger signal — do not add any auto-trigger logic in this plan.
