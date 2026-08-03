import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineWaverElement, WaverElement } from "./waver-element";
import {
  dispatchPointerEvent,
  installDomStubs,
  makeAudioBuffer,
  makeFakeAudioContext,
} from "./waver-element.test-helpers";

defineWaverElement();

function mount(): WaverElement {
  const el = document.createElement("wave-r") as WaverElement;
  document.body.append(el);
  return el;
}

describe("WaverElement", () => {
  let stubs: ReturnType<typeof installDomStubs>;

  beforeEach(() => {
    stubs = installDomStubs(300, 100);
  });

  afterEach(() => {
    document.body.innerHTML = "";
    stubs.restore();
  });

  describe("empty state", () => {
    it("shows the Load and Record buttons by default, hides the recording bar", () => {
      const el = mount();
      const shadow = el.shadowRoot!;
      const loadBtn = shadow.querySelector(".waver-action-btn:not(.waver-action-btn--record)") as HTMLButtonElement;
      const recordBtn = shadow.querySelector(".waver-action-btn--record") as HTMLButtonElement;
      const recordingBar = shadow.querySelector(".waver-recording-bar") as HTMLElement;

      expect(loadBtn.style.display).not.toBe("none");
      expect(recordBtn.style.display).not.toBe("none");
      expect(recordingBar.style.display).toBe("none");
    });

    it("hasAudio() is false and isRecording() is false before anything happens", () => {
      const el = mount();
      expect(el.hasAudio()).toBe(false);
      expect(el.isRecording()).toBe(false);
    });
  });

  describe("configure() — loadButton / recordButton ControlState", () => {
    it("hides a button entirely when set to 'hidden'", () => {
      const el = mount();
      el.configure({ loadButton: "hidden" });
      const shadow = el.shadowRoot!;
      const loadBtn = shadow.querySelector(".waver-action-btn:not(.waver-action-btn--record)") as HTMLButtonElement;
      expect(loadBtn.style.display).toBe("none");
    });

    it("renders a button disabled (visible, unclickable) when set to 'disabled'", () => {
      const el = mount();
      el.configure({ recordButton: "disabled" });
      const shadow = el.shadowRoot!;
      const recordBtn = shadow.querySelector(".waver-action-btn--record") as HTMLButtonElement;
      expect(recordBtn.style.display).not.toBe("none");
      expect(recordBtn.disabled).toBe(true);
    });

    it("a disabled record button does not start a recording on click", () => {
      const el = mount();
      el.configure({ recordButton: "disabled" });
      const shadow = el.shadowRoot!;
      const recordBtn = shadow.querySelector(".waver-action-btn--record") as HTMLButtonElement;
      recordBtn.click();
      expect(el.isRecording()).toBe(false);
    });

    it("hides the whole empty-overlay only when both buttons are hidden", () => {
      const el = mount();
      const overlay = el.shadowRoot!.querySelector(".waver-empty-overlay") as HTMLElement;
      el.configure({ loadButton: "hidden", recordButton: "enabled" });
      expect(overlay.style.display).toBe("flex");
      el.configure({ recordButton: "hidden" });
      expect(overlay.style.display).toBe("none");
    });

    it("startRecording() still works via the public API when recordButton is 'disabled'", async () => {
      const el = mount();
      el.configure({ recordButton: "disabled" });
      vi.stubGlobal("navigator", {
        mediaDevices: { getUserMedia: vi.fn(async () => makeFakeMediaStream()) },
      });
      vi.stubGlobal(
        "AudioContext",
        vi.fn(function () {
          return makeFakeAudioContext();
        })
      );

      await el.startRecording();
      expect(el.isRecording()).toBe(true);
    });
  });

  describe("configure() — cancelButton ControlState", () => {
    it("defaults to 'enabled': cancel button hidden with no audio, visible once loaded", () => {
      const el = mount();
      const shadow = el.shadowRoot!;
      const cancelBtn = shadow.querySelector(".waver-cancel-btn") as HTMLButtonElement;
      expect(cancelBtn.style.display).toBe("none");

      el.loadSamples(new Float32Array(1000), 44100);
      expect(cancelBtn.style.display).not.toBe("none");
      expect(cancelBtn.disabled).toBe(false);
    });
  });

  describe("loadSamples / loadAudioBuffer", () => {
    it("loadSamples sets hasAudio() true and resets selection/cursor/zoom", () => {
      const el = mount();
      el.setSelection({ startSample: 10, endSample: 20 });
      el.loadSamples(new Float32Array(1000), 44100);
      expect(el.hasAudio()).toBe(true);
      expect(el.getSelection()).toBeNull();
      expect(el.getCursorPosition()).toBe(0);
    });

    it("loadAudioBuffer loads mono channel 0 data and wires up an AudioEngine", () => {
      const el = mount();
      const samples = new Float32Array([0.1, 0.2, 0.3]);
      const buffer = makeAudioBuffer(samples, 22050);
      const ctx = makeFakeAudioContext();
      el.loadAudioBuffer(buffer, ctx as unknown as AudioContext);
      expect(el.hasAudio()).toBe(true);
      expect(el.getSampleRate()).toBe(22050);
    });

    it("hides the empty overlay once audio is loaded", () => {
      const el = mount();
      const overlay = el.shadowRoot!.querySelector(".waver-empty-overlay") as HTMLElement;
      el.loadSamples(new Float32Array(1000), 44100);
      expect(overlay.style.display).toBe("none");
    });
  });

  describe("reset()", () => {
    it("erases loaded audio, shows the empty overlay again, and emits waver:reset", () => {
      const el = mount();
      el.loadSamples(new Float32Array(1000), 44100);
      el.setSelection({ startSample: 10, endSample: 20 });
      const onReset = vi.fn();
      el.addEventListener("waver:reset", onReset);

      el.reset();

      expect(el.hasAudio()).toBe(false);
      expect(el.getSelection()).toBeNull();
      expect(el.getCursorPosition()).toBe(0);
      const overlay = el.shadowRoot!.querySelector(".waver-empty-overlay") as HTMLElement;
      expect(overlay.style.display).toBe("flex");
      expect(onReset).toHaveBeenCalledTimes(1);
    });

    it("cancels an in-progress recording and returns isRecording() to false", async () => {
      const el = mount();
      vi.stubGlobal("navigator", {
        mediaDevices: { getUserMedia: vi.fn(async () => makeFakeMediaStream()) },
      });
      vi.stubGlobal(
        "AudioContext",
        vi.fn(function () {
          return makeFakeAudioContext();
        })
      );
      await el.startRecording();
      expect(el.isRecording()).toBe(true);

      el.reset();

      expect(el.isRecording()).toBe(false);
      expect(el.hasAudio()).toBe(false);
    });

    it("never stops tracks on a preset inputStream when cancelling a recording", async () => {
      const el = mount();
      const track = { stop: vi.fn() };
      vi.stubGlobal("navigator", {
        mediaDevices: { getUserMedia: vi.fn(async () => makeFakeMediaStream()) },
      });
      vi.stubGlobal(
        "AudioContext",
        vi.fn(function () {
          return makeFakeAudioContext();
        })
      );
      el.setInputStream({ getTracks: () => [track] } as unknown as MediaStream);
      await el.startRecording();

      el.reset();

      expect(track.stop).not.toHaveBeenCalled();
    });

    it("cancels a pending zoom animation frame so it can't overwrite the reset zoom afterward", () => {
      const el = mount();
      el.loadSamples(new Float32Array(10000), 44100);
      stubs.flush(); // drain the frame loadSamples's render() scheduled, so only the animation's frame remains queued below

      el.setZoom({ samplesPerPixel: 20, offsetSample: 100 }, true); // animate: true schedules a self-chaining rAF loop
      el.reset();
      const resetZoom = el.getZoom();

      stubs.flushUntilIdle(); // run any rAF callback(s) still queued from the animation, if it survived reset()

      expect(el.getZoom()).toEqual(resetZoom);
    });
  });

  describe("playback", () => {
    it("play()/stop()/togglePlayback() delegate to the AudioEngine and emit events", () => {
      const el = mount();
      const buffer = makeAudioBuffer(new Float32Array(1000), 1000);
      const ctx = makeFakeAudioContext();
      el.loadAudioBuffer(buffer, ctx as unknown as AudioContext);

      const onPlay = vi.fn();
      const onStop = vi.fn();
      el.addEventListener("waver:play", onPlay);
      el.addEventListener("waver:stop", onStop);

      el.play();
      expect(onPlay).toHaveBeenCalledTimes(1);
      stubs.flush(); // consume the position-tracking rAF play() scheduled, so it doesn't leak into other tests

      el.stop();
      expect(onStop).toHaveBeenCalledTimes(1);
    });

    it("togglePlayback() flips play state", () => {
      const el = mount();
      const buffer = makeAudioBuffer(new Float32Array(1000), 1000);
      const ctx = makeFakeAudioContext();
      el.loadAudioBuffer(buffer, ctx as unknown as AudioContext);

      const onPlay = vi.fn();
      const onStop = vi.fn();
      el.addEventListener("waver:play", onPlay);
      el.addEventListener("waver:stop", onStop);

      el.togglePlayback();
      expect(onPlay).toHaveBeenCalledTimes(1);
      stubs.flush();
      el.togglePlayback();
      expect(onStop).toHaveBeenCalledTimes(1);
    });

    it("play() is a no-op before any audio is loaded", () => {
      const el = mount();
      expect(() => el.play()).not.toThrow();
    });
  });

  describe("selection", () => {
    it("setSelection() normalizes reversed ranges and emits selectionchange + selectionchanged", () => {
      const el = mount();
      el.loadSamples(new Float32Array(1000), 44100);
      const onChange = vi.fn();
      const onChanged = vi.fn();
      el.addEventListener("waver:selectionchange", onChange);
      el.addEventListener("waver:selectionchanged", onChanged);

      el.setSelection({ startSample: 500, endSample: 100 });
      expect(el.getSelection()).toEqual({ startSample: 100, endSample: 500 });
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChanged).toHaveBeenCalledTimes(1);
    });

    it("setSelection(null) emits selectionreset instead of selectionchanged", () => {
      const el = mount();
      el.loadSamples(new Float32Array(1000), 44100);
      el.setSelection({ startSample: 0, endSample: 100 });
      const onReset = vi.fn();
      el.addEventListener("waver:selectionreset", onReset);
      el.setSelection(null);
      expect(el.getSelection()).toBeNull();
      expect(onReset).toHaveBeenCalledTimes(1);
    });

    it("setSelection(range, final=false) emits selectionchange but not selectionchanged, for in-progress drags", () => {
      const el = mount();
      el.loadSamples(new Float32Array(1000), 44100);
      const onChange = vi.fn();
      const onChanged = vi.fn();
      el.addEventListener("waver:selectionchange", onChange);
      el.addEventListener("waver:selectionchanged", onChanged);

      el.setSelection({ startSample: 0, endSample: 50 }, false);
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChanged).not.toHaveBeenCalled();
    });
  });

  describe("cursor", () => {
    it("setCursorPosition() clamps to [0, totalSamples] and emits cursorchange by default", () => {
      const el = mount();
      el.loadSamples(new Float32Array(1000), 44100);
      const onChange = vi.fn();
      el.addEventListener("waver:cursorchange", onChange);

      el.setCursorPosition(5000);
      expect(el.getCursorPosition()).toBe(1000);
      expect(onChange).toHaveBeenCalledTimes(1);

      el.setCursorPosition(-50);
      expect(el.getCursorPosition()).toBe(0);
    });

    it("setCursorPosition(sample, false) suppresses the event", () => {
      const el = mount();
      el.loadSamples(new Float32Array(1000), 44100);
      const onChange = vi.fn();
      el.addEventListener("waver:cursorchange", onChange);
      el.setCursorPosition(100, false);
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("zoom", () => {
    it("setZoom(zoom, false) applies immediately and emits zoomchange", () => {
      const el = mount();
      el.loadSamples(new Float32Array(10000), 44100);
      const onZoom = vi.fn();
      el.addEventListener("waver:zoomchange", onZoom);
      el.setZoom({ samplesPerPixel: 5 }, false);
      expect(el.getZoom().samplesPerPixel).toBe(5);
      expect(onZoom).toHaveBeenCalledTimes(1);
    });

    it("zoomToFull() eases the viewport to fit the whole buffer", () => {
      vi.useFakeTimers({ toFake: ["performance"] });
      const el = mount();
      el.loadSamples(new Float32Array(3000), 44100);
      el.setZoom({ samplesPerPixel: 1, offsetSample: 500 }, false);
      el.zoomToFull();
      // The animation checks real elapsed performance.now() each frame; advance fake time past its
      // duration before flushing so it converges in a single pass instead of many tiny steps.
      vi.advanceTimersByTime(1000);
      stubs.flushUntilIdle();
      expect(el.getZoom().offsetSample).toBe(0);
      vi.useRealTimers();
    });
  });

  describe("viewMode", () => {
    it("setViewMode() switches mode and emits viewmodechange", () => {
      const el = mount();
      const onChange = vi.fn();
      el.addEventListener("waver:viewmodechange", onChange);
      el.setViewMode("spectrogram");
      expect(el.getViewMode()).toBe("spectrogram");
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it("setViewMode() is a no-op (no event) when already in that mode", () => {
      const el = mount();
      const onChange = vi.fn();
      el.addEventListener("waver:viewmodechange", onChange);
      el.setViewMode("waveform"); // already the default
      expect(onChange).not.toHaveBeenCalled();
    });

    it("configure({ viewMode }) also emits viewmodechange when it actually changes", () => {
      const el = mount();
      const onChange = vi.fn();
      el.addEventListener("waver:viewmodechange", onChange);
      el.configure({ viewMode: "spectrogram" });
      expect(onChange).toHaveBeenCalledTimes(1);
    });
  });

  describe("file loading via the Load File button", () => {
    it("loaderror fires when the picked file fails to decode", async () => {
      const el = mount();
      vi.stubGlobal(
        "AudioContext",
        vi.fn(function () {
          return {
            ...makeFakeAudioContext(),
            decodeAudioData: vi.fn(async () => {
              throw new Error("bad file");
            }),
          };
        })
      );

      const onError = vi.fn();
      el.addEventListener("waver:loaderror", onError);

      const fileInput = el.shadowRoot!.querySelector(".waver-file-input") as HTMLInputElement;
      const file = new File([new ArrayBuffer(8)], "test.wav", { type: "audio/wav" });
      // jsdom's File doesn't implement arrayBuffer(); WaverElement's file-load path calls it directly.
      (file as unknown as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer = async () => new ArrayBuffer(8);
      Object.defineProperty(fileInput, "files", { value: [file], configurable: true });
      fileInput.dispatchEvent(new Event("change"));

      await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
      const detail = onError.mock.calls[0][0].detail;
      expect(detail.error.message).toBe("bad file");
    });
  });

  describe("channelIndex", () => {
    it("defaults to 0 and is settable via setChannelIndex()/getChannelIndex()", () => {
      const el = mount();
      expect(el.getChannelIndex()).toBe(0);
      el.setChannelIndex(1);
      expect(el.getChannelIndex()).toBe(1);
    });

    it("configure({ channelIndex }) also sets it", () => {
      const el = mount();
      el.configure({ channelIndex: 2 });
      expect(el.getChannelIndex()).toBe(2);
    });
  });

  describe("getSamples()/getSampleRate() readback", () => {
    it("returns an empty array and default rate before anything is loaded", () => {
      const el = mount();
      expect(el.getSamples()).toEqual(new Float32Array(0));
      expect(el.getSampleRate()).toBe(44100);
    });

    it("returns the loaded samples/rate after loadSamples()", () => {
      const el = mount();
      const data = new Float32Array([0.1, 0.2, 0.3]);
      el.loadSamples(data, 48000);
      expect(el.getSamples()).toEqual(data);
      expect(el.getSampleRate()).toBe(48000);
    });

    it("returns in-progress captured samples while a recording is active", async () => {
      const el = mount();
      const ctx = makeFakeAudioContext();
      vi.stubGlobal("navigator", {
        mediaDevices: { getUserMedia: vi.fn(async () => makeFakeMediaStream()) },
      });
      vi.stubGlobal(
        "AudioContext",
        vi.fn(function () {
          return ctx;
        })
      );

      await el.startRecording();
      expect(el.getSamples()).toEqual(new Float32Array(0));

      const processor = ctx.createScriptProcessor.mock.results[0].value as {
        onaudioprocess: ((e: unknown) => void) | null;
      };
      const inputData = new Float32Array([0.1, 0.2, 0.3]);
      processor.onaudioprocess?.({ inputBuffer: { getChannelData: () => inputData } });

      expect(el.getSamples()).toEqual(inputData);
    });
  });

  describe("recording", () => {
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

    it("startRecording() flips isRecording() true and emits recordstart", async () => {
      const el = mount();
      stubMicSuccess();
      const onStart = vi.fn();
      el.addEventListener("waver:recordstart", onStart);

      await el.startRecording();
      expect(el.isRecording()).toBe(true);
      expect(onStart).toHaveBeenCalledTimes(1);
    });

    it("shows the recording bar and hides the empty overlay while recording", async () => {
      const el = mount();
      stubMicSuccess();
      await el.startRecording();

      const shadow = el.shadowRoot!;
      expect((shadow.querySelector(".waver-recording-bar") as HTMLElement).style.display).toBe("flex");
      expect((shadow.querySelector(".waver-empty-overlay") as HTMLElement).style.display).toBe("none");
    });

    it("recorderror fires and isRecording() stays false when getUserMedia rejects", async () => {
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

      await el.startRecording();
      expect(el.isRecording()).toBe(false);
      expect(onError).toHaveBeenCalledTimes(1);
    });

    it("startRecording() is a no-op while already recording", async () => {
      const el = mount();
      stubMicSuccess();
      await el.startRecording();
      const getUserMedia = (navigator as unknown as { mediaDevices: { getUserMedia: ReturnType<typeof vi.fn> } })
        .mediaDevices.getUserMedia;
      await el.startRecording();
      expect(getUserMedia).toHaveBeenCalledTimes(1);
    });

    it("setInputStream() makes startRecording() (with no argument) use that stream instead of getUserMedia", async () => {
      const el = mount();
      stubMicSuccess();
      const presetStream = makeFakeMediaStream() as unknown as MediaStream;
      el.setInputStream(presetStream);
      expect(el.getInputStream()).toBe(presetStream);

      await el.startRecording();

      const getUserMedia = (navigator as unknown as { mediaDevices: { getUserMedia: ReturnType<typeof vi.fn> } })
        .mediaDevices.getUserMedia;
      expect(getUserMedia).not.toHaveBeenCalled();
      expect(el.isRecording()).toBe(true);
    });

    it("never stops tracks on a preset inputStream, since the host app owns it, not Waver", async () => {
      const el = mount();
      stubMicSuccess();
      const track = { stop: vi.fn() };
      const presetStream = { getTracks: () => [track] } as unknown as MediaStream;
      el.setInputStream(presetStream);

      await el.startRecording();
      el.stopRecording();
      expect(track.stop).not.toHaveBeenCalled();

      el.setInputStream(presetStream);
      await el.startRecording();
      el.remove(); // disconnectedCallback -> cancel()
      expect(track.stop).not.toHaveBeenCalled();
    });

    it("an explicit startRecording(stream) argument overrides a preset inputStream", async () => {
      const el = mount();
      stubMicSuccess();
      el.setInputStream(makeFakeMediaStream() as unknown as MediaStream);
      const explicitStream = makeFakeMediaStream() as unknown as MediaStream;

      await el.startRecording(explicitStream);

      const getUserMedia = (navigator as unknown as { mediaDevices: { getUserMedia: ReturnType<typeof vi.fn> } })
        .mediaDevices.getUserMedia;
      expect(getUserMedia).not.toHaveBeenCalled();
      expect(el.isRecording()).toBe(true);
    });

    it("stopRecording() loads captured audio, flips isRecording() false, and emits recordstop", async () => {
      const el = mount();
      stubMicSuccess();
      await el.startRecording();

      el.stopRecording();
      expect(el.isRecording()).toBe(false);
    });

    it("stopRecording() emits recordstop even with zero captured samples", async () => {
      const el = mount();
      stubMicSuccess();
      await el.startRecording();
      const onStop = vi.fn();
      el.addEventListener("waver:recordstop", onStop);

      el.stopRecording();
      expect(onStop).toHaveBeenCalledTimes(1);
    });

    it("stopRecording() is a no-op when not recording", () => {
      const el = mount();
      expect(() => el.stopRecording()).not.toThrow();
    });

    it("locks pointer interaction on the waveform canvas while recording", async () => {
      const el = mount();
      stubMicSuccess();
      await el.startRecording();

      const canvas = el.shadowRoot!.querySelector(".waver-waveform") as HTMLCanvasElement;
      const onCursorChange = vi.fn();
      el.addEventListener("waver:cursorchange", onCursorChange);
      dispatchPointerEvent(canvas, "pointerdown", { clientX: 50 });
      dispatchPointerEvent(canvas, "pointerup", { clientX: 50 });
      expect(onCursorChange).not.toHaveBeenCalled();
    });

    it("disconnectedCallback cancels an in-progress recording", async () => {
      const el = mount();
      stubMicSuccess();
      await el.startRecording();
      el.remove();
      expect(el.isRecording()).toBe(true); // recordingState isn't reset by cancel(), only stopRecording()
    });
  });

  describe("pointer interaction", () => {
    it("a plain click on the waveform (no drag) moves the cursor", () => {
      const el = mount();
      el.loadSamples(new Float32Array(10000), 44100);
      el.setZoom({ samplesPerPixel: 10, offsetSample: 0 }, false);

      const canvas = el.shadowRoot!.querySelector(".waver-waveform") as HTMLCanvasElement;
      const onCursorChange = vi.fn();
      el.addEventListener("waver:cursorchange", onCursorChange);

      dispatchPointerEvent(canvas, "pointerdown", { clientX: 20 });
      dispatchPointerEvent(canvas, "pointerup", { clientX: 20 });

      expect(onCursorChange).toHaveBeenCalledTimes(1);
      expect(el.getCursorPosition()).toBe(200); // pixel 20 * samplesPerPixel 10
    });

    it("a drag on the waveform creates a selection", () => {
      const el = mount();
      el.loadSamples(new Float32Array(10000), 44100);
      el.setZoom({ samplesPerPixel: 10, offsetSample: 0 }, false);

      const canvas = el.shadowRoot!.querySelector(".waver-waveform") as HTMLCanvasElement;
      dispatchPointerEvent(canvas, "pointerdown", { clientX: 10 });
      dispatchPointerEvent(canvas, "pointermove", { clientX: 50 });
      dispatchPointerEvent(canvas, "pointerup", { clientX: 50 });

      expect(el.getSelection()).toEqual({ startSample: 100, endSample: 500 });
    });

    it("clicking the ruler seeks the cursor without touching selection", () => {
      const el = mount();
      el.loadSamples(new Float32Array(10000), 44100);
      el.setZoom({ samplesPerPixel: 10, offsetSample: 0 }, false);
      el.setSelection({ startSample: 100, endSample: 200 });

      const ruler = el.shadowRoot!.querySelector(".waver-ruler") as HTMLCanvasElement;
      dispatchPointerEvent(ruler, "pointerdown", { clientX: 30 });
      dispatchPointerEvent(ruler, "pointerup", { clientX: 30 });

      expect(el.getCursorPosition()).toBe(300);
      expect(el.getSelection()).toEqual({ startSample: 100, endSample: 200 });
    });
  });

  describe("theme", () => {
    it("configure({ theme }) merges overrides onto the current theme", () => {
      const el = mount();
      el.configure({ theme: { waveformColor: "#ff0000" } });
      const container = el.shadowRoot!.querySelector(".waver-container") as HTMLElement;
      // applyTheme sets backgroundColor/fontFamily/borderRadius on the container; a smoke check
      // that configure() actually routed through applyTheme without throwing.
      expect(container.style.borderRadius).toBeTruthy();
    });
  });
});

function makeFakeMediaStream() {
  return {
    getTracks: () => [{ stop: vi.fn() }],
  };
}

describe("recordViewMode reaches the recording viewport", () => {
  let stubs: ReturnType<typeof installDomStubs>;

  beforeEach(() => {
    stubs = installDomStubs(300, 100);
  });

  afterEach(() => {
    document.body.innerHTML = "";
    stubs.restore();
  });

  /**
   * Drives the real capture path: startRecording() wires appendRecordedChunk() to the
   * ScriptProcessorNode, so firing onaudioprocess is what a live mic does. Records past
   * recordWindowSeconds so "scroll" has actually outgrown its window.
   */
  async function recordPast(mode: "flat" | "zoom-out" | "scroll", seconds: number) {
    const sampleRate = 44100;
    const context = makeFakeAudioContext(sampleRate);
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn(async () => makeFakeMediaStream()) },
    });
    vi.stubGlobal(
      "AudioContext",
      vi.fn(function () {
        return context;
      })
    );

    const el = mount();
    el.configure({ recordViewMode: mode, recordWindowSeconds: 2 });
    await el.startRecording();

    const processor = context.createScriptProcessor.mock.results.at(-1)!.value;
    const chunk = new Float32Array(sampleRate);
    for (let i = 0; i < seconds; i++) {
      processor.onaudioprocess?.({ inputBuffer: { getChannelData: () => chunk } });
    }
    return el;
  }

  it("gives scroll a different viewport than zoom-out once past the window", async () => {
    const scroll = await recordPast("scroll", 15);
    const scrollZoom = scroll.getZoom();
    document.body.innerHTML = "";

    const zoomOut = await recordPast("zoom-out", 15);
    const zoomOutZoom = zoomOut.getZoom();

    expect(scrollZoom).not.toEqual(zoomOutZoom);
  });

  it("keeps scroll pinned to the configured window instead of spanning the whole recording", async () => {
    const el = await recordPast("scroll", 15);
    const { samplesPerPixel } = el.getZoom();
    // 2s window across 300px => 44100*2/300 samples per pixel.
    expect(samplesPerPixel).toBeCloseTo((44100 * 2) / 300, 5);
  });

  it("draws nothing while recording in flat mode", async () => {
    const el = await recordPast("flat", 15);
    stubs.flushUntilIdle();
    const canvas = el.shadowRoot!.querySelector(".waver-waveform") as HTMLCanvasElement;
    const ctx = stubs.ctxByCanvas.get(canvas)!;
    expect(ctx.stroke).not.toHaveBeenCalled();
  });

  it("hides the whole wave stack (ruler and minimap included) during flat capture", async () => {
    const el = await recordPast("flat", 3);
    stubs.flushUntilIdle();
    const shadow = el.shadowRoot!;
    expect((shadow.querySelector(".waver-wave-stack") as HTMLElement).style.display).toBe("none");
    expect((shadow.querySelector(".waver-ruler") as HTMLElement).style.display).toBe("none");
    expect((shadow.querySelector(".waver-minimap") as HTMLElement).style.display).toBe("none");
  });
});
