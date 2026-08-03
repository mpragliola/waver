# Waver Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add channel-index recording support and a readback API to waver, bump Tomas's pin to
consume them, and fully replace Tomas's bespoke mic-recording stack (`RecordingPanel.vue`,
`AudioRecorder`, VU meter, auto-trigger) with waver's native per-instance Record/Stop button —
keeping only device and channel selection on the Tomas side.

**Architecture:** Two repositories. Part A modifies `waver` (`/home/marco/dev/waver`): adds
`channelIndex` to `RecorderEngine`/`WaverElement`/wrappers, and adds `getSamples()`/`getSampleRate()`
getters so a host app can read back a just-finished recording. Part B modifies `tomas`
(`/home/marco/dev/tomas`): bumps the `waver` pin, fixes a prop rename `show-load-button` /
`show-record-button` → `load-button` / `record-button`, wires each `WaveformEditor`'s `<Waver>`
instance to waver's own Record button (fed by a trimmed device/channel picker), and deletes the old
recording pipeline.

**Tech Stack:** waver — TypeScript, Vitest, a custom-element core with thin Vue/React wrappers, no
build step needed to consume from Tomas via the git-hash dependency. Tomas — Vue 3 `<script setup>`,
Pinia, Vitest (unit), Playwright (e2e, including a `chromium-mic` project with a fake input device).

## Global Constraints

- Never touch device enumeration inside waver — device selection stays Tomas's job (existing waver
  design boundary: "Waver has no business picking an input device itself").
- No level meter, no auto-trigger-on-threshold anywhere in the new code — both are dropped with no
  replacement (confirmed user decision).
- Recorded audio is always mono by the time it reaches waver (channel already picked before the
  `MediaStream` is handed to `setInputStream()`, OR picked by waver itself via the new
  `channelIndex` — see Task 1). Downstream Tomas code (FFT, IR derivation) has never handled
  multi-channel `audioBufferA`/reference buffers and must keep receiving mono.
- Follow existing code patterns exactly: waver's `configure()`-driven options pattern for the new
  `channelIndex` option; Tomas's existing `resolve()`/`getTarget()` seam in `useWaveformSlot.ts` for
  any per-target logic.

---

## Part A — waver (`/home/marco/dev/waver`)

### Task 1: `RecorderEngine` — add `channelIndex` support

**Files:**
- Modify: `src/audio/recorder-engine.ts`
- Test: `src/audio/recorder-engine.test.ts`

**Interfaces:**
- Produces: `RecorderEngine.start(stream?: MediaStream, channelIndex = 0): Promise<void>` (was
  `start(stream?: MediaStream)`); `RecorderEngine.getInputChannelCount(): number` (new, valid after
  `start()`, returns `1` before).

- [ ] **Step 1: Write the failing tests**

Add to `src/audio/recorder-engine.test.ts`, inside a new `describe("channel selection", ...)` block
(place it after the existing `describe("with a caller-supplied MediaStream", ...)` block, before the
final closing `});` of the outer `describe`). Extend the existing fakes first — `FakeAudioContext`
needs `createChannelSplitter`, and `FakeSourceNode`/a new `FakeSplitter` need `connect` tracking:

```ts
class FakeSplitterNode {
  connect = vi.fn();
  disconnect = vi.fn();
}

// Add to FakeAudioContext class body (alongside the other createX mocks):
//   createChannelSplitter = vi.fn(() => new FakeSplitterNode());

// Add a channelCount field to FakeSourceNode so multi-channel sources can be simulated:
class FakeSourceNode {
  channelCount = 1;
  connect = vi.fn();
  disconnect = vi.fn();
}
```

Update `FakeAudioContext.createMediaStreamSource` to return a `FakeSourceNode` whose `channelCount`
the test can set. Since `createMediaStreamSource = vi.fn(() => new FakeSourceNode())` currently
always returns a fresh 1-channel node, change it to accept a settable channel count via a test-local
override:

```ts
  describe("channel selection", () => {
    it("connects the source directly (no splitter) when channelIndex is 0", async () => {
      const engine = new RecorderEngine();
      await engine.start(undefined, 0);

      const ctx = contexts[0];
      const source = ctx.createMediaStreamSource.mock.results[0].value as FakeSourceNode;
      const processor = ctx.createScriptProcessor.mock.results[0].value as FakeProcessor;
      expect(ctx.createChannelSplitter).not.toHaveBeenCalled();
      expect(source.connect).toHaveBeenCalledWith(processor);
    });

    it("splits and connects only the requested channel when channelIndex > 0 and the source has enough channels", async () => {
      const engine = new RecorderEngine();
      const externalTracks = [new FakeTrack(), new FakeTrack()];
      const externalStream = new FakeMediaStream(externalTracks) as unknown as MediaStream;

      // Simulate a 2-channel source: patch the next createMediaStreamSource call's result.
      const twoChannelSource = new FakeSourceNode();
      twoChannelSource.channelCount = 2;
      const ctx = new FakeAudioContext();
      ctx.createMediaStreamSource = vi.fn(() => twoChannelSource);
      vi.stubGlobal("AudioContext", vi.fn(() => ctx));

      await engine.start(externalStream, 1);

      const splitter = ctx.createChannelSplitter.mock.results[0].value as FakeSplitterNode;
      const processor = ctx.createScriptProcessor.mock.results[0].value as FakeProcessor;
      expect(ctx.createChannelSplitter).toHaveBeenCalledWith(2);
      expect(twoChannelSource.connect).toHaveBeenCalledWith(splitter);
      expect(splitter.connect).toHaveBeenCalledWith(processor, 1);
      expect(engine.getInputChannelCount()).toBe(2);
    });

    it("falls back to channel 0 when the requested channel is beyond what the source has", async () => {
      const engine = new RecorderEngine();
      await engine.start(undefined, 5); // default fake source is 1-channel

      const ctx = contexts[0];
      const source = ctx.createMediaStreamSource.mock.results[0].value as FakeSourceNode;
      const processor = ctx.createScriptProcessor.mock.results[0].value as FakeProcessor;
      expect(ctx.createChannelSplitter).not.toHaveBeenCalled();
      expect(source.connect).toHaveBeenCalledWith(processor);
    });

    it("getInputChannelCount() reports 1 before start()", () => {
      const engine = new RecorderEngine();
      expect(engine.getInputChannelCount()).toBe(1);
    });
  });
```

Also add `createChannelSplitter = vi.fn(() => new FakeSplitterNode());` to the `FakeAudioContext`
class definition near the top of the file, and change `FakeSourceNode` to include
`channelCount = 1;` as its first field (both edits above the `describe("RecorderEngine", ...)` block).

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/marco/dev/waver && npx vitest run src/audio/recorder-engine.test.ts`
Expected: FAIL — `createChannelSplitter` does not exist on the real class yet, `getInputChannelCount`
is not a function, `start()` doesn't accept a second argument.

- [ ] **Step 3: Implement `channelIndex` support in `RecorderEngine`**

In `src/audio/recorder-engine.ts`, replace the class body with:

```ts
export class RecorderEngine {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
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

  /** Channels the opened source actually has. Valid after start(); 1 before. */
  getInputChannelCount(): number {
    return this.inputChannelCount;
  }

  getContext(): AudioContext | null {
    return this.context;
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
      const chunk = new Float32Array(input.length);
      chunk.set(input);
      this.events.onData?.(chunk);
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
    this.recording = true;
  }

  stop(): void {
    if (!this.recording) return;
    this.recording = false;
    this.releaseCaptureNodes();
  }

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

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /home/marco/dev/waver && npx vitest run src/audio/recorder-engine.test.ts`
Expected: PASS, all tests including the new `channel selection` block.

- [ ] **Step 5: Commit**

```bash
cd /home/marco/dev/waver
git add src/audio/recorder-engine.ts src/audio/recorder-engine.test.ts
git commit -m "feat: add channelIndex support to RecorderEngine"
```

---

### Task 2: `WaverElement` — thread `channelIndex` through, add `getSamples()`/`getSampleRate()` readback

**Files:**
- Modify: `src/waver-element.ts`
- Modify: `src/core/types.ts`
- Test: `src/waver-element.test.ts` (existing file — check for a `recording` describe block to add
  alongside; if none exists, add a new one)

**Interfaces:**
- Consumes: `RecorderEngine.start(stream?, channelIndex?)`, `RecorderEngine.getInputChannelCount()`
  from Task 1.
- Produces: `WaverElement.startRecording(stream?: MediaStream, channelIndex?: number): Promise<void>`;
  `WaverElement.setChannelIndex(index: number): void` / `getChannelIndex(): number`;
  `WaverElement.getSamples(): Float32Array` (returns the current buffer, live or loaded — empty
  array if none); `WaverElement.getSampleRate(): number` (this already exists at line ~540 — confirm
  and leave as-is, just ensure it's exported/used, do not duplicate).
- New `WaverOptions.channelIndex: number` field in `core/types.ts` (default `0`).

- [ ] **Step 1: Check the existing test file structure**

Run: `cd /home/marco/dev/waver && grep -n "describe\|startRecording\|inputStream" src/waver-element.test.ts | head -30`

Read the surrounding `describe("recording", ...)` or equivalent block (if `startRecording`/
`inputStream` are already tested there) so the new tests below follow the same mocking pattern
(check whether `RecorderEngine` is mocked via `vi.mock` in this file, and reuse that mock rather than
introducing a second one).

- [ ] **Step 2: Write the failing tests**

Add (adjusting mock setup to match whatever pattern Step 1 found) to `src/waver-element.test.ts`:

```ts
describe("channelIndex", () => {
  it("defaults to 0 and is settable via setChannelIndex()/getChannelIndex()", () => {
    const el = document.createElement("wave-r") as WaverElement;
    expect(el.getChannelIndex()).toBe(0);
    el.setChannelIndex(1);
    expect(el.getChannelIndex()).toBe(1);
  });

  it("configure({ channelIndex }) also sets it", () => {
    const el = document.createElement("wave-r") as WaverElement;
    el.configure({ channelIndex: 2 });
    expect(el.getChannelIndex()).toBe(2);
  });
});

describe("getSamples()/getSampleRate() readback", () => {
  it("returns an empty array and default rate before anything is loaded", () => {
    const el = document.createElement("wave-r") as WaverElement;
    expect(el.getSamples()).toEqual(new Float32Array(0));
    expect(el.getSampleRate()).toBe(44100);
  });

  it("returns the loaded samples/rate after loadSamples()", () => {
    const el = document.createElement("wave-r") as WaverElement;
    const data = new Float32Array([0.1, 0.2, 0.3]);
    el.loadSamples(data, 48000);
    expect(el.getSamples()).toEqual(data);
    expect(el.getSampleRate()).toBe(48000);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd /home/marco/dev/waver && npx vitest run src/waver-element.test.ts -t "channelIndex"`
Run: `cd /home/marco/dev/waver && npx vitest run src/waver-element.test.ts -t "getSamples"`
Expected: FAIL — none of `setChannelIndex`/`getChannelIndex`/`getSamples` exist yet;
`configure({ channelIndex: ... })` is a TS error until the type is added.

- [ ] **Step 4: Add `channelIndex` to `WaverOptions` in `core/types.ts`**

In `src/core/types.ts`, inside the `WaverOptions` interface, add (near `recordButton`, since it's
part of the same recording-config cluster):

```ts
  /**
   * Which channel of a multi-channel recording source to keep, 0-based. Used by
   * startRecording() (including the built-in Record button) when called with no explicit
   * channelIndex argument. Falls back to channel 0 if the source has fewer channels.
   */
  channelIndex: number;
```

- [ ] **Step 5: Implement in `WaverElement`**

In `src/waver-element.ts`:

1. Add `channelIndex: 0,` to `DEFAULT_OPTIONS` (near `recordButton: "enabled",`).

2. Near `setInputStream`/`getInputStream` (around line 319-325), add:

```ts
  setChannelIndex(index: number): void {
    this.opts.channelIndex = index;
  }

  getChannelIndex(): number {
    return this.opts.channelIndex;
  }
```

3. Update `startRecording` (around line 355) to accept and forward `channelIndex`:

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
    // ... rest unchanged
```

4. Add readback getters near `getSampleRate()` (around line 540):

```ts
  /** Current sample buffer — whatever's loaded (file, prior recording) or, mid-recording, what
   * has been captured so far. Empty array if nothing is loaded. */
  getSamples(): Float32Array {
    return this.samples;
  }
```

(Confirm `getSampleRate()` already exists at that location returning `this.sampleRate`; do not
duplicate it.)

5. Update the `configure()` method (around line 252) to accept `channelIndex` — find where other
   simple scalar options (e.g. `recordViewMode`, `recordWindowSeconds`) are merged into `this.opts`
   and confirm `channelIndex` merges the same way (a generic `Object.assign`/spread over
   `Partial<WaverOptions>` needs no per-field code; only add an explicit line if `configure()` lists
   fields individually — check the actual implementation before assuming).

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd /home/marco/dev/waver && npx vitest run src/waver-element.test.ts`
Expected: PASS, all tests including the two new blocks.

- [ ] **Step 7: Run the full waver test suite to check nothing else broke**

Run: `cd /home/marco/dev/waver && npm run test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
cd /home/marco/dev/waver
git add src/waver-element.ts src/core/types.ts src/waver-element.test.ts
git commit -m "feat: thread channelIndex through WaverElement, add getSamples()/getSampleRate() readback"
```

---

### Task 3: Vue/React wrappers — expose `channelIndex` prop and `getSamples()`/`getSampleRate()`

**Files:**
- Modify: `src/vue/Waver.ts`
- Modify: `src/react/Waver.tsx`
- Test: `src/vue/Waver.test.ts`, `src/react/Waver.test.tsx` (extend existing files — follow their
  current test patterns for prop-forwarding and exposed-method tests)

**Interfaces:**
- Consumes: `WaverElement.setChannelIndex/getChannelIndex/getSamples/getSampleRate` from Task 2.
- Produces: Vue `Waver` component prop `channelIndex?: number`; exposed methods
  `getSamples(): Float32Array`, `getSampleRate(): number`. Same for the React `Waver` component
  (prop + imperative handle methods via `WaverHandle`).

- [ ] **Step 1: Write the failing Vue wrapper test**

Read `src/vue/Waver.test.ts` first to match its exact style (likely mounts the component, accesses
`wrapper.vm` or an exposed ref). Add a test resembling the existing `inputStream` prop test:

```ts
it("forwards the channelIndex prop to the element", async () => {
  const wrapper = mount(Waver, { props: { channelIndex: 1 } });
  await nextTick();
  const el = wrapper.find("wave-r").element as WaverElement;
  expect(el.getChannelIndex()).toBe(1);
});

it("exposes getSamples() and getSampleRate()", async () => {
  const wrapper = mount(Waver);
  await nextTick();
  const el = wrapper.find("wave-r").element as WaverElement;
  el.loadSamples(new Float32Array([1, 2, 3]), 48000);
  expect((wrapper.vm as any).getSamples()).toEqual(new Float32Array([1, 2, 3]));
  expect((wrapper.vm as any).getSampleRate()).toBe(48000);
});
```

(Match import paths and the exact mount/access pattern already used in the file — this is
illustrative of intent, not necessarily copy-pasteable if the file uses a different helper.)

- [ ] **Step 2: Run to verify it fails**

Run: `cd /home/marco/dev/waver && npx vitest run src/vue/Waver.test.ts`
Expected: FAIL — no `channelIndex` prop, no `getSamples`/`getSampleRate` in `expose()`.

- [ ] **Step 3: Implement in `src/vue/Waver.ts`**

Add to `props`:
```ts
    channelIndex: { type: Number as PropType<number>, default: undefined },
```

Add to `collectOptions()`:
```ts
      if (props.channelIndex !== undefined) opts.channelIndex = props.channelIndex;
```

Add to the `expose({...})` block:
```ts
      getSamples: () => elRef.value?.getSamples() ?? new Float32Array(0),
      getSampleRate: () => elRef.value?.getSampleRate() ?? 44100,
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd /home/marco/dev/waver && npx vitest run src/vue/Waver.test.ts`
Expected: PASS.

- [ ] **Step 5: Repeat for React — write failing test, implement, verify**

Read `src/react/Waver.tsx` and `src/react/Waver.test.tsx` to match their prop/ref pattern (likely a
`forwardRef` + `useImperativeHandle`). Add the equivalent `channelIndex` prop and
`getSamples`/`getSampleRate` to the imperative handle, mirroring the Vue changes exactly. Add
matching tests to `src/react/Waver.test.tsx` first (failing), then implement, then verify passing —
same 4-step cycle as Steps 1-4 above, for the React file.

Run: `cd /home/marco/dev/waver && npx vitest run src/react/Waver.test.tsx`
Expected: PASS after implementation.

- [ ] **Step 6: Run the full test suite**

Run: `cd /home/marco/dev/waver && npm run test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd /home/marco/dev/waver
git add src/vue/Waver.ts src/vue/Waver.test.ts src/react/Waver.tsx src/react/Waver.test.tsx
git commit -m "feat: expose channelIndex prop and getSamples()/getSampleRate() in Vue/React wrappers"
```

---

### Task 4: Update waver's README and CHANGELOG

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: nothing (docs only).
- Produces: nothing consumed by later tasks — purely documentation, but required before Tomas's pin
  bump per the design spec.

- [ ] **Step 1: Update `CHANGELOG.md`**

In the `[Unreleased]` → `Added` list, amend the existing recording bullet points (find the ones
mentioning `setInputStream()`/`startRecording()` and `reset()`/`hasAudio()`) to append two new
bullets:

```markdown
- `channelIndex` option (and `setChannelIndex()`/`getChannelIndex()`), plus an optional
  `channelIndex` argument to `startRecording()`, for picking a specific channel out of a
  multi-channel recording source (falls back to channel 0 if the source is narrower than
  requested). The `channelIndex` prop in the React/Vue wrappers mirrors `inputStream`.
- `getSamples()` / `getSampleRate()` methods to read back the currently loaded (or, mid-recording,
  in-progress) sample buffer — lets a host app pull a just-finished recording out after
  `waver:recordstop` without re-deriving it from the original stream.
```

- [ ] **Step 2: Update `README.md`**

1. In the `Configurable options (WaverOptions)` table, add a row after `rulerHeight`:

```markdown
| `channelIndex` | `number` | `0` | Which channel of a multi-channel recording source to keep. Used by `startRecording()` when called with no explicit `channelIndex` argument (including via the built-in Record button). Falls back to channel 0 if the source has fewer channels. |
```

2. In the `Recording` prose section, after the paragraph about `setInputStream()`, add:

```markdown
For a multi-channel source (e.g. a stereo interface with the mic on one input), set `channelIndex`
(via `configure()`/the `channelIndex` prop, or as `startRecording()`'s second argument) to pick which
channel is kept — picked, not summed, since summing with a silent second input costs 6 dB and can
comb the signal if the two aren't in phase.
```

3. In the `Public API` table, add rows after `setInputStream`/`getInputStream`:

```markdown
| `setChannelIndex(index: number)` / `getChannelIndex()` | Set/get the channel `startRecording()` (including the built-in Record button) picks out of a multi-channel source. |
| `getSamples()` | Current sample buffer — loaded audio, or (mid-recording) what's been captured so far. Empty array if nothing is loaded. |
```

(`getSampleRate()` is presumably already listed — confirm before adding a duplicate row.)

4. Update `startRecording` row in the same table to reflect the new signature:

```markdown
| `startRecording(stream?: MediaStream, channelIndex?: number)` | Starts mic capture via the same path as the built-in Record button. Omitted arguments fall back to `inputStream`/`channelIndex` set ahead of time, then the default mic/channel 0. |
```

- [ ] **Step 3: Commit**

```bash
cd /home/marco/dev/waver
git add README.md CHANGELOG.md
git commit -m "docs: document channelIndex recording support and getSamples()/getSampleRate() readback"
```

---

## Part B — Tomas (`/home/marco/dev/tomas`)

### Task 5: Bump the waver pin and fix the `load-button`/`record-button` prop rename

**Files:**
- Modify: `package.json`
- Modify: `src/components/upload/WaveformEditor.vue`

**Interfaces:**
- Consumes: the waver commit produced by Part A (Tasks 1-4).
- Produces: `node_modules/waver` updated to the new commit; `WaveformEditor.vue`'s `<Waver>` no
  longer passes nonexistent props.

- [ ] **Step 1: Get the new waver commit hash**

Run: `cd /home/marco/dev/waver && git rev-parse HEAD`

Copy the resulting hash for the next step.

- [ ] **Step 2: Update `package.json`**

In `/home/marco/dev/tomas/package.json`, change:
```json
    "waver": "github:mpragliola/waver#5562262af7cbe03d541b045f34b5e3aee52ed0ed"
```
to:
```json
    "waver": "github:mpragliola/waver#<new-hash-from-step-1>"
```

- [ ] **Step 3: Install**

Run: `cd /home/marco/dev/tomas && npm install`
Expected: `package-lock.json`'s `waver` entries update to the new hash/resolved URL; no errors.

- [ ] **Step 4: Verify the new API surface is present**

Run: `grep -n "channelIndex\|getSamples" /home/marco/dev/tomas/node_modules/waver/dist/index.d.ts /home/marco/dev/tomas/node_modules/waver/dist/vue/Waver.d.ts`
Expected: both symbols appear.

- [ ] **Step 5: Fix `WaveformEditor.vue`'s prop rename**

In `src/components/upload/WaveformEditor.vue`, in the `<Waver>` template block (around lines 4-17),
change:
```vue
      :show-load-button="false"
      :show-record-button="false"
```
to:
```vue
      load-button="hidden"
      record-button="enabled"
```

(Do not wire up recording behavior yet — that's Task 8. This step only fixes what would otherwise be
a silent no-op prop after the bump, per the design spec's point 2.)

- [ ] **Step 6: Typecheck**

Run: `cd /home/marco/dev/tomas && npx vue-tsc --noEmit`
Expected: no new errors introduced by this change. (Existing unrelated errors, if any, are out of
scope — only check this change didn't add new ones.)

- [ ] **Step 7: Manual smoke check**

Run: `cd /home/marco/dev/tomas && npm run dev`, open the app, load a file into Wave 1, confirm the
waveform still renders, zoom/selection still work, and the "Load File" overlay does not flash
(since `WaveformEditor` is always mounted with real content behind it once a file is loaded, this
should look identical to before). Since `record-button="enabled"` is now set but nothing wires
`recordstart`/`recordstop` yet, clicking waver's own Record button (visible only in the empty
state, if `hasAudio()` is false) is expected to work using the default mic — that's fine, Task 8
wires it into the store properly. Stop the dev server.

- [ ] **Step 8: Commit**

```bash
cd /home/marco/dev/tomas
git add package.json package-lock.json src/components/upload/WaveformEditor.vue
git commit -m "chore: bump waver pin, fix load-button/record-button prop rename"
```

---

### Task 6: Store — generalize `finishRecordingIntoA`/`finishRecordingIntoReference` to accept a real sample rate, export them, drop the old recording pipeline

**Files:**
- Modify: `src/stores/analysisStore.ts`
- Modify: `src/types/audio.ts`
- Test: `tests/unit/stores/analysisStore.emptyReferences.test.ts`

**Interfaces:**
- Consumes: nothing new from waver yet (this task is pure Tomas store surgery).
- Produces: exported store actions `finishRecordingIntoA(audioData: Float32Array, sampleRate: number): Promise<void>`
  and `finishRecordingIntoReference(referenceId: string, audioData: Float32Array, sampleRate: number): Promise<void>`,
  used by `WaveformEditor.vue` in Task 8. `recordingTarget: Ref<RecordTarget | null>` remains exported,
  repurposed as a pure UI lock flag set directly by callers (no longer set by a deleted
  `recordAudio()`).

- [ ] **Step 1: Write the updated failing test**

In `tests/unit/stores/analysisStore.emptyReferences.test.ts`:

1. Delete the `vi.mock('../../../src/services/audio/recorder', ...)` block (lines 17-43) and the
   `RECORDER_CONFIG` constant (lines 45-51) — no longer needed once `AudioRecorder` is gone.

2. Replace the entire `describe('recording into a reference tab', ...)` block (lines 153-237) with:

```ts
  describe('finishing a recording into A or a reference tab', () => {
    function fakeTake(freqOffset = 0): Float32Array {
      const n = 88200; // 2s @ 44100Hz — comfortably past the 1s analysis floor
      const data = new Float32Array(n);
      const freq = 200 + freqOffset;
      for (let i = 0; i < n; i++) data[i] = Math.sin((i / 44100) * 2 * Math.PI * freq) * 0.5;
      return data;
    }

    it('finishRecordingIntoA saves the take and recomputes A\'s spectrum', async () => {
      const store = useAnalysisStore();
      await store.finishRecordingIntoA(fakeTake(), 44100);

      expect(store.audioBufferA.length).toBeGreaterThan(0);
      expect(store.sourceNameA).toBe('Live take');
      expect(store.spectrumA).not.toBeNull();
    });

    it('finishRecordingIntoA respects the sample rate it is given', async () => {
      const store = useAnalysisStore();
      await store.finishRecordingIntoA(fakeTake(), 48000);
      expect(store.sampleRateA).toBe(48000);
    });

    it('finishRecordingIntoReference creates a new asset and does not disturb A or a different reference', async () => {
      const store = useAnalysisStore();
      await store.loadFile(toneFile('harmonic-e2'));
      const aLengthBefore = store.audioBufferA.length;

      const otherId = await store.addReference(toneFile('white-noise'));
      const otherAssetId = store.references[otherId]!.assetId!;
      const otherBufferBefore = store.audioAssets[otherAssetId]!.buffer;

      const emptyId = store.addEmptyReference();
      await store.finishRecordingIntoReference(emptyId, fakeTake(37), 44100);

      const ref = store.references[emptyId]!;
      expect(ref.assetId).not.toBeNull();
      expect(ref.label).toContain('Live take');

      const asset = store.audioAssets[ref.assetId!]!;
      expect(asset.buffer.length).toBeGreaterThan(0);
      expect(asset.sampleRate).toBe(44100);

      expect(store.audioBufferA.length).toBe(aLengthBefore);
      expect(store.references[otherId]!.assetId).toBe(otherAssetId);
      expect(store.audioAssets[otherAssetId]!.buffer).toBe(otherBufferBefore);
    });

    it('disambiguates the "Live take" label across multiple recorded reference tabs', async () => {
      const store = useAnalysisStore();
      const id1 = store.addEmptyReference();
      await store.finishRecordingIntoReference(id1, fakeTake(1), 44100);

      const id2 = store.addEmptyReference();
      await store.finishRecordingIntoReference(id2, fakeTake(2), 44100);

      expect(store.references[id1]!.label).not.toBe(store.references[id2]!.label);
    });

    it('recomputes immediately when recording lands in the active tab', async () => {
      const store = useAnalysisStore();
      await store.loadFile(toneFile('harmonic-e2'));
      const emptyId = store.addEmptyReference();
      expect(store.activeReferenceId).toBe(emptyId);

      await store.finishRecordingIntoReference(emptyId, fakeTake(), 44100);

      expect(store.references[emptyId]!.ir).not.toBeNull();
      expect(store.references[emptyId]!.stale).toBe(false);
    });

    it('drops the take cleanly if the target reference was removed mid-recording', async () => {
      const store = useAnalysisStore();
      const emptyId = store.addEmptyReference();
      store.removeReference(emptyId);

      await expect(store.finishRecordingIntoReference(emptyId, fakeTake(), 44100)).resolves.not.toThrow();
      expect(store.references[emptyId]).toBeUndefined();
    });
  });
```

3. Remove the now-stale doc comment above the deleted mock (lines 6-16) describing why
   `AudioRecorder` was mocked — no longer applicable.

- [ ] **Step 2: Run to verify it fails**

Run: `cd /home/marco/dev/tomas && npx vitest run tests/unit/stores/analysisStore.emptyReferences.test.ts`
Expected: FAIL — `finishRecordingIntoA`/`finishRecordingIntoReference` are not exported from the
store yet (TS error / undefined).

- [ ] **Step 3: Update `src/types/audio.ts`**

Delete `RecorderConfig` and `RecorderState` interfaces (lines 50-85) — no longer used anywhere once
Task 7 removes `AudioRecorder`. Leave `RecordTarget` untouched (still used).

- [ ] **Step 4: Update `src/stores/analysisStore.ts`**

1. Remove the import `import { AudioRecorder } from '../services/audio/recorder';` (line 30).
2. Remove `RecorderConfig` from the type import list (line 6).
3. Remove `const recorder = new AudioRecorder();` (line 91).
4. Delete the `recordAudio()` function (lines 285-291) entirely.
5. Delete the `stopRecording()` function (lines 293-306) entirely.
6. Rename nothing else — `finishRecordingIntoA`/`finishRecordingIntoReference` already have the
   right names; generalize their signatures:

```ts
  async function finishRecordingIntoA(audioData: Float32Array, sampleRate: number): Promise<void> {
    audioBufferA.value = audioData;
    // The recorder picks a single input channel rather than summing, so a take is already
    // mono and there is nothing to deinterleave.
    channelBufferA.value = [audioData];
    audioHeaderA.value = { sampleRate, channels: 1, bitDepth: 32, duration: audioData.length / sampleRate };
    sampleRateA.value = sampleRate;
    sourceNameA.value = 'Live take';

    selectionA.value = {
      startSample: 0,
      endSample: audioData.length,
      duration: audioHeaderA.value.duration * 1000,
    };

    logger.info('analysisStore', 'Recording saved', {
      samples: audioData.length,
      sampleRate,
    });

    await autoComputeSpectrumA();
  }
```

```ts
  async function finishRecordingIntoReference(referenceId: string, audioData: Float32Array, sampleRate: number): Promise<void> {
    const ref = references.value[referenceId];
    if (!ref) {
      logger.warn('analysisStore', 'Recording target reference no longer exists, discarding take', {
        referenceId,
      });
      return;
    }

    const header: WavHeader = { sampleRate, channels: 1, bitDepth: 32, duration: audioData.length / sampleRate };
    const assetId = generateId('asset');
    const label = disambiguateLabel('Live take');
    audioAssets.value[assetId] = {
      id: assetId,
      buffer: audioData,
      channels: [audioData],
      sampleRate,
      header,
      sourceName: label,
    };

    ref.assetId = assetId;
    ref.selection = { startSample: 0, endSample: audioData.length, duration: header.duration * 1000 };
    ref.label = label;
    ref.stale = true;

    logger.info('analysisStore', 'Recording saved into reference', {
      referenceId,
      assetId,
      samples: audioData.length,
    });

    if (referenceId === activeReferenceId.value) {
      try {
        await recomputeReference(referenceId);
      } catch (error) {
        reportError('Recompute after recording into reference failed', error, "Couldn't analyze the new recording.");
      }
    }
  }
```

(Both functions keep their exact current bodies otherwise — only the hardcoded `const sr = 44100`
becomes the `sampleRate` parameter, used everywhere `sr` was used.)

7. Add both functions to the store's `return { ... }` block (near `recordingTarget`, replacing the
   removed `recordAudio`/`stopRecording` entries):

```ts
    finishRecordingIntoA,
    finishRecordingIntoReference,
```

(`recordingTarget` stays in the return block, untouched — it becomes a plain UI-lock ref that
`WaveformEditor.vue` sets directly in Task 8, no longer written by a store action.)

- [ ] **Step 5: Run to verify it passes**

Run: `cd /home/marco/dev/tomas && npx vitest run tests/unit/stores/analysisStore.emptyReferences.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full unit suite to catch any other breakage**

Run: `cd /home/marco/dev/tomas && npx vitest run`
Expected: Only `tests/unit/services/recorder.test.ts` should fail (it tests `AudioRecorder` directly,
which Task 7 deletes) — confirm no other unexpected failures. That file is deleted in Task 7, not
this one.

- [ ] **Step 7: Commit**

```bash
cd /home/marco/dev/tomas
git add src/stores/analysisStore.ts src/types/audio.ts tests/unit/stores/analysisStore.emptyReferences.test.ts
git commit -m "refactor: generalize finishRecordingIntoA/Reference to a real sample rate, export them"
```

---

### Task 7: Delete the bespoke recording stack

**Files:**
- Delete: `src/components/RecordingPanel.vue`
- Delete: `src/services/audio/recorder.ts`
- Delete: `src/composables/useMonitor.ts`
- Delete: `src/utils/vuMeter.ts`
- Delete: `src/utils/audioFormat.ts` (only consumer was `RecordingPanel.vue` — confirm with grep
  before deleting)
- Delete: `tests/unit/services/recorder.test.ts`
- Modify: `src/App.vue`

**Interfaces:**
- Consumes: nothing (pure deletion + one wiring cleanup in `App.vue`).
- Produces: `App.vue` no longer imports/renders `RecordingPanel`; the `panel-input` sidebar slot is
  now empty (Task 9 fills it with the trimmed device/channel picker).

- [ ] **Step 1: Confirm nothing else references these files**

Run:
```bash
cd /home/marco/dev/tomas
grep -rln "RecordingPanel\|services/audio/recorder\|useMonitor\|utils/vuMeter" src/ tests/ --include="*.ts" --include="*.vue" | grep -v "RecordingPanel.vue$\|services/audio/recorder.ts$\|useMonitor.ts$\|utils/vuMeter.ts$\|tests/unit/services/recorder.test.ts$"
```
Expected output: only `src/App.vue` (import + template usage) and possibly
`tests/e2e/recording.spec.ts` (rewritten in Task 10, not this one — leave it for now, it will fail
until Task 10, which is expected and tracked there).

Run: `grep -n "formatDurationMs" src/ -r` — expected: only inside `RecordingPanel.vue` (being
deleted) and its own definition in `utils/audioFormat.ts`. If any other file uses it, do not delete
`audioFormat.ts` — note this and skip that specific deletion.

- [ ] **Step 2: Delete the files**

```bash
cd /home/marco/dev/tomas
git rm src/components/RecordingPanel.vue
git rm src/services/audio/recorder.ts
git rm src/composables/useMonitor.ts
git rm src/utils/vuMeter.ts
git rm src/utils/audioFormat.ts   # only if Step 1 confirmed no other consumer
git rm tests/unit/services/recorder.test.ts
```

- [ ] **Step 3: Update `App.vue`**

Remove:
- `import RecordingPanel from './components/RecordingPanel.vue';` (line 76)
- `import type { RecordTarget } from './types/audio';` (line 84) — check first whether `onRecord`
  removal below also removes the only usage; if so, delete this import too.
- `const recordingPanel = ref<InstanceType<typeof RecordingPanel>>();` (line 96)
- The `<RecordingPanel ref="recordingPanel" @recorded="onRecorded" />` line inside
  `<aside class="panel panel-input panel-side-bg">` (line 35) — leave the `<aside>` wrapper itself
  in place (Task 9 fills it), just remove the child.
- `@record="onRecord($event)"` and `@stop-record="onStopRecord"` from the `<FileUpload>` tag
  (line 29) — becomes `<FileUpload @file-loaded="onFileLoaded" />`.
- The `onRecord`, `onStopRecord`, `onRecorded` functions (lines 171-183).

Leave `onFileLoaded` and `onIRDerived` untouched.

- [ ] **Step 4: Typecheck**

Run: `cd /home/marco/dev/tomas && npx vue-tsc --noEmit`
Expected: errors in `FileUpload.vue`/`AudioSlot.vue`/`ReferenceSlot.vue` about now-unused
`record`/`stop-record` emits are expected and fixed in Task 9 — confirm no *other* new errors
(e.g. nothing else broke from the `App.vue` edits themselves). If `vue-tsc` errors are hard to
attribute, proceed — Task 9 will re-run this check after those files are also updated.

- [ ] **Step 5: Commit**

```bash
cd /home/marco/dev/tomas
git add -A
git commit -m "chore: delete bespoke recorder, VU meter, and RecordingPanel"
```

---

### Task 8: `WaveformEditor.vue` — wire waver's native Record button into the store

**Files:**
- Modify: `src/components/upload/WaveformEditor.vue`
- Modify: `src/composables/useWaveformSlot.ts`

**Interfaces:**
- Consumes: `store.finishRecordingIntoA(audioData, sampleRate)`,
  `store.finishRecordingIntoReference(referenceId, audioData, sampleRate)`,
  `store.recordingTarget: Ref<RecordTarget | null>` from Task 6. `WaverHandle`-equivalent
  `getSamples()`/`getSampleRate()` from waver (Task 3), already available on `waverRef.value` once
  Task 5's pin bump lands.
- Produces: `WaveformEditor.vue` emits are unchanged (`clear`, `status`) — no new emits needed, since
  recording is now fully self-contained per instance via the store.

- [ ] **Step 1: Extend the `WaverHandle` interface in `useWaveformSlot.ts`**

In `src/composables/useWaveformSlot.ts`, add to the `WaverHandle` interface (near the top, alongside
`loadSamples`/`setSelection`/etc.):

```ts
  getSamples: () => Float32Array;
  getSampleRate: () => number;
```

- [ ] **Step 2: Add a `record-button` state computed and event handlers in `WaveformEditor.vue`**

In the `<script setup>` block, add (near the existing `spectrum`/`useWaveformSlot` wiring):

```ts
const recordButtonState = computed<'enabled' | 'disabled'>(() => {
  const lockedTo = store.recordingTarget;
  if (lockedTo === null) return 'enabled';
  const isThisSlot =
    props.target === 'A' ? lockedTo === 'A' : lockedTo !== 'A' && lockedTo.referenceId === props.target.referenceId;
  return isThisSlot ? 'enabled' : 'disabled';
});

function onRecordStart(): void {
  store.recordingTarget = props.target;
}

async function onRecordStop(): Promise<void> {
  const el = waverRef.value;
  store.recordingTarget = null;
  if (!el) return;

  const samples = el.getSamples();
  const sampleRate = el.getSampleRate();
  if (samples.length === 0) return;

  if (props.target === 'A') {
    await store.finishRecordingIntoA(samples, sampleRate);
  } else {
    await store.finishRecordingIntoReference(props.target.referenceId, samples, sampleRate);
  }
}

function onRecordError(error: Error): void {
  store.recordingTarget = null;
  emit('status', `Recording failed: ${error.message}`, 3000);
}
```

- [ ] **Step 3: Wire the template**

In the `<Waver>` tag, replace the static `record-button="enabled"` (set in Task 5) with the reactive
state, and add the three new event listeners:

```vue
    <Waver
      ref="waverRef"
      :height="96"
      :theme="theme"
      :view-mode="view"
      show-zero-line
      show-minimap
      load-button="hidden"
      :record-button="recordButtonState"
      class="waveform-host"
      @selectionchange="onSelectionChange"
      @cursorchange="onCursorChange"
      @zoomchange="onZoomChange"
      @recordstart="onRecordStart"
      @recordstop="onRecordStop"
      @recorderror="onRecordError"
    />
```

- [ ] **Step 4: Typecheck**

Run: `cd /home/marco/dev/tomas && npx vue-tsc --noEmit`
Expected: no new errors from this file (the `WaverHandle` extension in Step 1 must line up with the
real waver `Waver` component's exposed methods from Task 3 — if this errors, re-check Task 3's
`expose()` block matches these names exactly).

- [ ] **Step 5: Typecheck only — defer behavioral testing to Task 9**

Run: `cd /home/marco/dev/tomas && npx vue-tsc --noEmit`
Expected: clean.

`AudioSlot.vue`'s own empty-state Load File/Record buttons (deleted in Task 9, not yet in this task)
still render on top of `WaveformEditor`'s v-show'd content, so waver's own Record button isn't
visible in the DOM yet — a manual click-through here would test nothing real. Task 9's Step 10 is
the first point where the buttons this task wired are actually reachable; do the behavioral smoke
test there.

- [ ] **Step 6: Commit**

```bash
cd /home/marco/dev/tomas
git add src/components/upload/WaveformEditor.vue src/composables/useWaveformSlot.ts
git commit -m "feat: wire waver's native Record/Stop button into the store per waveform slot"
```

---

### Task 9: Remove empty-state Record/Stop buttons from `AudioSlot.vue`/`ReferenceSlot.vue`/`FileUpload.vue`, add the trimmed device/channel picker

**Files:**
- Modify: `src/components/upload/AudioSlot.vue`
- Modify: `src/components/upload/ReferenceSlot.vue`
- Modify: `src/components/FileUpload.vue`
- Modify: `src/composables/useAudioDevices.ts`
- Modify: `src/App.vue`
- Create: `src/components/DevicePicker.vue`

**Interfaces:**
- Consumes: `useAudioDevices` (existing, trimmed), waver's `setInputStream()`/`inputStream` prop and
  new `channelIndex` prop/`setChannelIndex()` from Task 3.
- Produces: `DevicePicker.vue` writes `store.selectedInputDeviceId: Ref<string>` and
  `store.selectedChannelIndex: Ref<number>` (new store refs — see Step 4) that `WaveformEditor.vue`
  reads to set `inputStream`/`channelIndex` on its own `<Waver>` before the user presses Record.

- [ ] **Step 1: Remove empty-state Record buttons from `AudioSlot.vue`**

In `src/components/upload/AudioSlot.vue`:
- Remove the `v-else-if="isRecordingHere"` block (lines 41-49) entirely.
- In the `v-else-if="!hasAudio"` block (lines 51-68), remove the "Record" `<button>` (lines 57-66),
  keeping only the "Load File" button. The `buttons-row` div can stay (still wraps the one remaining
  button) or be simplified — keep it for minimal diff.
- Remove `record`/`stop-record` from `defineEmits` (lines 93-94).
- Remove `isRecordingHere`/`recordingElsewhere` computed refs (lines 128-129) — no longer used
  anywhere in this file once the button is gone.
- Remove the now-dead `.action-button.record`/`.action-button.stop`/`.recording-hint`/
  `@keyframes pulse-record` CSS rules if nothing else in the file's `<style>` block uses them
  (`.action-button` base class stays, only the `.record`/`.stop` modifiers and the recording-hint
  text go).

- [ ] **Step 2: Remove empty-state Record buttons from `ReferenceSlot.vue`**

Read the file first (`src/components/upload/ReferenceSlot.vue`) to find the equivalent blocks (lines
82-131 per the earlier grep): the `isRecordingActive` empty-state Stop button, and the two "Record"
buttons (`onRecordActive`/`onRecordZero`). Remove all three UI blocks and their handler functions
(`onRecordActive`, `onRecordZero`), the `isRecordingActive`/`recordingElsewhere` computed refs, and
`record`/`stop-record` from `defineEmits`. Follow the exact same pattern as Task 1's edits to
`AudioSlot.vue` — mirror structurally, this file has the same shape with an added "no tab exists
yet" case.

- [ ] **Step 3: Remove the `record`/`stop-record` relay in `FileUpload.vue`**

In `src/components/FileUpload.vue`, remove `@record="emit('record', 'A')"` /
`@record="emit('record', $event)"` / `@stop-record="emit('stop-record')"` (lines 8-9, 17-18) from
wherever `AudioSlot`/`ReferenceSlot` are used, and remove `record`/`stop-record` from `defineEmits`
(lines 30-31). Remove the now-unused `import type { RecordTarget } from '../types/audio';` (line 26)
if nothing else in the file needs it.

- [ ] **Step 4: Add store refs for the picker selection**

In `src/stores/analysisStore.ts`, add two new refs near `recordingTarget` (around line 95):

```ts
  const selectedInputDeviceId = ref('');
  const selectedChannelIndex = ref(0);
```

Add both to the `return { ... }` block.

- [ ] **Step 5: Trim `useAudioDevices.ts`**

The composable already returns exactly what's needed (`devices`, `selectedDeviceId`, `channelCount`,
`channelIndex`, `refreshDevices`, `refreshChannels`) — no functional trimming is needed here since it
was never coupled to the deleted `AudioRecorder` (confirm via
`grep -n "AudioRecorder\|recorder" src/composables/useAudioDevices.ts` — expected: no matches). Leave
the file as-is.

- [ ] **Step 6: Create `src/components/DevicePicker.vue`**

A small standalone component replacing the deleted `RecordingPanel.vue` sidebar content — device and
channel dropdowns only, writing straight into the store's new refs:

```vue
<template>
  <div class="device-picker">
    <div class="section-header">
      <label class="section-title">Recording input</label>
    </div>

    <div class="device-select">
      <label class="input-label">Input device</label>
      <select v-model="store.selectedInputDeviceId" class="device-dropdown">
        <option value="">System default</option>
        <option v-for="d in devices" :key="d.deviceId" :value="d.deviceId">{{ d.label }}</option>
      </select>
    </div>

    <div class="device-select">
      <label class="input-label">Input channel</label>
      <select v-model.number="store.selectedChannelIndex" :disabled="channelCount < 2" class="device-dropdown">
        <option v-for="n in channelCount" :key="n" :value="n - 1">
          Channel {{ n }}{{ channelCount === 2 ? (n === 1 ? ' (left)' : ' (right)') : '' }}
        </option>
      </select>
      <span class="device-hint">
        {{ channelCount < 2 ? 'Device is mono' : `${channelCount} channels available` }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { watch } from 'vue';
import { useAnalysisStore } from '../stores/analysisStore';
import { useAudioDevices } from '../composables/useAudioDevices';

const store = useAnalysisStore();
// No recording in progress ever disables this picker itself; WaveformEditor's own
// record-button reactivity handles the one-at-a-time lock — this panel stays live so a
// user can line up the next take's device/channel while a different slot is recording.
const alwaysFalse = { value: false };
const { devices, selectedDeviceId, channelCount, channelIndex } = useAudioDevices(alwaysFalse);

// useAudioDevices owns its own selectedDeviceId/channelIndex refs (used to drive its
// internal channel-count probing) — mirror them into the store's refs so WaveformEditor
// can read the current selection without importing this composable itself.
watch(selectedDeviceId, (v) => { store.selectedInputDeviceId = v; });
watch(channelIndex, (v) => { store.selectedChannelIndex = v; });
</script>

<style lang="scss" scoped>
@use '../styles/variables' as *;
@use '../styles/mixins' as *;

.device-picker {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.section-title { @include caps-label; }

.device-select {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.device-dropdown {
  width: 100%;
  padding: 6px 8px;
  font-size: var(--font-size-sm);
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background-color: var(--color-bg);
  color: var(--color-text-primary);

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

.device-hint {
  font-size: var(--font-size-label);
  color: var(--color-text-secondary);
  opacity: 0.8;
}

.input-label { @include caps-label; }
</style>
```

- [ ] **Step 7: Mount `DevicePicker` in `App.vue`**

In `src/App.vue`, inside `<aside class="panel panel-input panel-side-bg">` (now empty after Task 7
removed `RecordingPanel`), add:

```vue
          <aside class="panel panel-input panel-side-bg">
            <DevicePicker />
          </aside>
```

Add the import: `import DevicePicker from './components/DevicePicker.vue';`

- [ ] **Step 8: Wire `inputStream`/`channelIndex` into `WaveformEditor.vue`**

Back in `src/components/upload/WaveformEditor.vue` (from Task 8), add a `watch` that opens a
`MediaStream` for the store's selected device and feeds it to this instance's `<Waver>` — but only
lazily, when the user is about to record, not on every render (opening a mic stream is a permission
prompt). Add:

```ts
import { openInputStream } from '../../services/audio/devices';

const inputStream = ref<MediaStream | null>(null);

async function refreshInputStream(): Promise<void> {
  inputStream.value?.getTracks().forEach((t) => t.stop());
  inputStream.value = null;
  if (!store.selectedInputDeviceId) return; // "system default" — let waver fall back to getUserMedia itself
  try {
    inputStream.value = await openInputStream(store.selectedInputDeviceId);
  } catch {
    inputStream.value = null;
  }
}

watch(() => store.selectedInputDeviceId, refreshInputStream, { immediate: true });
onUnmounted(() => inputStream.value?.getTracks().forEach((t) => t.stop()));
```

Add `:input-stream="inputStream"` and `:channel-index="store.selectedChannelIndex"` to the `<Waver>`
tag (alongside `:record-button="recordButtonState"` from Task 8).

**Note the cost:** every `WaveformEditor` instance (Wave 1 + up to 8 reference tabs, though only one
is mounted/visible-relevant at a time per the existing v-show model) opens its own `MediaStream` for
the selected device whenever the picker selection changes. Since only one recording happens at a
time and `getUserMedia` for the same device across multiple open handles is generally fine
(browsers allow concurrent opens of the same device), this is acceptable — flag in code review if
it causes visible permission-prompt spam in manual testing (Step 10).

- [ ] **Step 9: Add `openInputStream` to `src/services/audio/devices.ts`**

Port a trimmed version of the stream-opening logic that used to live in
`services/audio/recorder.ts`'s `AudioRecorder.openStream` (now deleted in Task 7) — channel-width
constraint removed, since channel picking is now waver's job via `channelIndex`:

```ts
/**
 * Opens a MediaStream for a specific input device, with the same anti-processing
 * constraints the old recorder used (voice-call DSP mangles a take): AEC/AGC/noise
 * suppression off, voice isolation off where supported.
 */
export async function openInputStream(deviceId?: string): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      sampleRate: { ideal: 48000 },
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      voiceIsolation: { ideal: false },
    } as MediaTrackConstraints,
  });
}
```

- [ ] **Step 10: Typecheck and manual test**

Run: `cd /home/marco/dev/tomas && npx vue-tsc --noEmit`
Expected: clean (or only pre-existing unrelated errors).

Run: `cd /home/marco/dev/tomas && npm run dev`
1. Confirm the sidebar shows the new device/channel dropdowns (no VU meter, no auto-trigger, no
   duration readout).
2. Confirm Wave 1's empty state now shows waver's own "Load File" / "Record" overlay (since
   `AudioSlot.vue` no longer renders its own competing buttons).
3. Click Record on Wave 1, speak/make noise, click Stop — confirm the waveform populates and the
   spectrum plot updates (same as a file load would).
4. Repeat into a reference tab.
5. While Wave 1 is recording, confirm the reference tab's Record button is greyed out (waver's own
   `disabled` state via `recordButtonState`), and vice versa.
6. Pick a specific device (if more than one mic is available) and confirm recording still works.

- [ ] **Step 11: Commit**

```bash
cd /home/marco/dev/tomas
git add src/components/upload/AudioSlot.vue src/components/upload/ReferenceSlot.vue \
        src/components/FileUpload.vue src/components/DevicePicker.vue src/App.vue \
        src/components/upload/WaveformEditor.vue src/services/audio/devices.ts \
        src/stores/analysisStore.ts
git commit -m "feat: replace RecordingPanel with a trimmed device/channel picker feeding waver's native recorder"
```

---

### Task 10: Rewrite the recording Playwright spec

**Files:**
- Modify: `tests/e2e/recording.spec.ts`

**Interfaces:**
- Consumes: the DOM waver's own Record/Stop button renders (needs the actual class names/structure —
  see Step 1) and the `chromium-mic` Playwright project (existing, untouched, uses
  `--use-fake-device-for-media-stream`).

- [ ] **Step 1: Inspect waver's rendered DOM for the Record/Stop button structure**

Run: `cd /home/marco/dev/waver && grep -n "waver-action-btn\|waver-recording-bar\|waver-recording-dot\|waver-empty-overlay" src/waver-element.ts`

This gives the exact class names (`waver-action-btn--record`, `waver-action-btn--stop`,
`waver-recording-bar`, etc.) needed to write real selectors — waver renders into its shadow DOM, so
Playwright locators must pierce it: use `page.locator('wave-r').locator('.waver-action-btn--record')`
(Playwright's `locator()` auto-pierces open shadow roots, no special syntax needed beyond chaining).

- [ ] **Step 2: Rewrite the spec**

Replace `tests/e2e/recording.spec.ts` in full:

```ts
import { test, expect } from '@playwright/test';

// Runs only under the `chromium-mic` project (see playwright.config.ts), which launches
// Chromium with a fake audio input device — no real mic/OS permission dialog needed.
//
// Recording is now waver's own built-in Record/Stop button (rendered in its shadow DOM),
// not a bespoke RecordingPanel — Playwright locators pierce open shadow roots automatically.

test.describe('recording via waver\'s native Record button', () => {
  test('Record on Wave 1 shows Stop, disables Record on the reference slot, and returns to idle', async ({ page }) => {
    await page.goto('/');

    const waves = page.locator('wave-r');
    await expect(waves).toHaveCount(2); // Wave 1 + reference

    const waveOneRecord = waves.nth(0).locator('.waver-action-btn--record');
    await waveOneRecord.click();

    const waveOneStop = waves.nth(0).locator('.waver-action-btn--stop');
    await expect(waveOneStop).toBeVisible();

    // The reference slot's Record button must be disabled while Wave 1 is recording
    const referenceRecord = waves.nth(1).locator('.waver-action-btn--record');
    await expect(referenceRecord).toBeDisabled();

    await page.waitForTimeout(1500); // let the fake device produce a real take

    await waveOneStop.click();
    await expect(waveOneStop).toBeHidden();
    await expect(referenceRecord).toBeEnabled();
  });

  test('recording into a reference tab does not disturb Wave 1', async ({ page }) => {
    await page.goto('/');
    const waves = page.locator('wave-r');

    const referenceRecord = waves.nth(1).locator('.waver-action-btn--record');
    await referenceRecord.click();

    const referenceStop = waves.nth(1).locator('.waver-action-btn--stop');
    await expect(referenceStop).toBeVisible();

    const waveOneRecord = waves.nth(0).locator('.waver-action-btn--record');
    await expect(waveOneRecord).toBeDisabled();

    await page.waitForTimeout(1500);
    await referenceStop.click();
    await expect(referenceStop).toBeHidden();
  });

  test('device picker is present and independent of recording state', async ({ page }) => {
    await page.goto('/');
    const dropdowns = page.locator('.device-dropdown');
    await expect(dropdowns).toHaveCount(2); // device + channel

    const waves = page.locator('wave-r');
    await waves.nth(0).locator('.waver-action-btn--record').click();
    await expect(waves.nth(0).locator('.waver-action-btn--stop')).toBeVisible();

    // Unlike the old panel, the picker is not disabled by an in-progress recording.
    await expect(dropdowns.nth(0)).toBeEnabled();

    await waves.nth(0).locator('.waver-action-btn--stop').click();
  });
});
```

- [ ] **Step 3: Run the e2e suite**

Run: `cd /home/marco/dev/tomas && npx playwright test tests/e2e/recording.spec.ts --project=chromium-mic`
Expected: PASS. If a selector doesn't match, re-run Step 1's grep against the *installed*
`node_modules/waver/dist/waver.js` (minified, but class name strings survive) rather than the source
checkout, since the actual DOM comes from what got bundled into the dependency — adjust selectors to
match reality, not assumption.

- [ ] **Step 4: Run the full e2e suite to check nothing else regressed**

Run: `cd /home/marco/dev/tomas && npx playwright test`
Expected: PASS (aside from any pre-existing unrelated flakiness — note but don't block on it).

- [ ] **Step 5: Commit**

```bash
cd /home/marco/dev/tomas
git add tests/e2e/recording.spec.ts
git commit -m "test: rewrite recording e2e spec against waver's native Record/Stop button"
```

---

### Task 11: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Full unit suite**

Run: `cd /home/marco/dev/tomas && npx vitest run`
Expected: PASS, no skipped files referencing deleted modules.

- [ ] **Step 2: Full typecheck**

Run: `cd /home/marco/dev/tomas && npx vue-tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Full e2e suite**

Run: `cd /home/marco/dev/tomas && npx playwright test`
Expected: PASS.

- [ ] **Step 4: Grep for dead references**

Run:
```bash
cd /home/marco/dev/tomas
grep -rn "AudioRecorder\|RecorderConfig\|RecorderState\|RecordingPanel\|useMonitor\|vuMeter\b" src/ tests/ --include="*.ts" --include="*.vue"
```
Expected: no matches.

- [ ] **Step 5: Manual full pass**

Run: `npm run dev`, exercise: load a file into Wave 1, record into Wave 1, record into a reference
tab, switch themes (confirm waver's Record/Stop button styling still looks acceptable under each
theme — no design work was done on waver's own button CSS, so check it doesn't clash badly with
retro/sepia/earth themes; if it does, note as a follow-up rather than blocking this plan), touch
gestures on a touchscreen/trackpad if available (pinch-zoom, two-finger pan — confirms Part A's
bump brought in Task-unrelated waver improvements correctly).

- [ ] **Step 6: Update the design spec's status (optional but recommended)**

If the team tracks spec status, add a one-line note to
`docs/superpowers/specs/2026-08-03-waver-upgrade-design.md` marking it implemented, with the date.
Not required for functionality — skip if the project doesn't follow this convention (check for
similar notes in other specs in that directory first).
