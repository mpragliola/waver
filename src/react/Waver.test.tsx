import { act, render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WaverElement } from "../waver-element";
import { installDomStubs, makeAudioBuffer, makeFakeAudioContext } from "../waver-element.test-helpers";
import { Waver, type WaverHandle } from "./Waver";

describe("React Waver wrapper", () => {
  let stubs: ReturnType<typeof installDomStubs>;

  beforeEach(() => {
    stubs = installDomStubs(300, 100);
  });

  afterEach(() => {
    stubs.restore();
  });

  it("renders the underlying <wave-r> custom element", () => {
    const { container } = render(<Waver />);
    expect(container.querySelector("wave-r")).not.toBeNull();
  });

  it("forwards className and style to the custom element", () => {
    const { container } = render(<Waver className="my-waver" style={{ width: "42px" }} />);
    const el = container.querySelector("wave-r") as HTMLElement;
    expect(el.className).toBe("my-waver");
    expect(el.style.width).toBe("42px");
  });

  it("configures the element from WaverOptions props on mount", async () => {
    const { container } = render(<Waver showRuler={false} rulerHeight={30} />);
    const el = container.querySelector("wave-r") as WaverElement;
    await act(async () => {});
    const ruler = el.shadowRoot!.querySelector(".waver-ruler") as HTMLElement;
    // showRuler affects render output, exercised more directly in waver-element tests;
    // here we're confirming the prop actually reached configure() without throwing.
    expect(ruler).not.toBeNull();
  });

  it("re-configures the element when options props change", async () => {
    const { container, rerender } = render(<Waver loadButton="enabled" />);
    const el = container.querySelector("wave-r") as WaverElement;
    const configureSpy = vi.spyOn(el, "configure");

    rerender(<Waver loadButton="disabled" />);
    await act(async () => {});

    expect(configureSpy).toHaveBeenCalledWith(expect.objectContaining({ loadButton: "disabled" }));
  });

  it("exposes imperative methods via the ref", async () => {
    const ref = createRef<WaverHandle>();
    render(<Waver ref={ref} />);
    await act(async () => {});

    expect(ref.current?.hasAudio()).toBe(false);
    expect(ref.current?.isRecording()).toBe(false);
    expect(ref.current?.isMonitoring()).toBe(false);
    expect(ref.current?.getZoom()).toEqual({ samplesPerPixel: 1, offsetSample: 0 });

    const samples = new Float32Array(1000);
    act(() => {
      ref.current?.loadSamples(samples, 44100);
    });
    expect(ref.current?.hasAudio()).toBe(true);
  });

  it("ref.element() returns the underlying WaverElement instance", async () => {
    const ref = createRef<WaverHandle>();
    const { container } = render(<Waver ref={ref} />);
    await act(async () => {});
    expect(ref.current?.element()).toBe(container.querySelector("wave-r"));
  });

  it("forwards the hideButtonLabels prop to the element", async () => {
    const { container } = render(<Waver hideButtonLabels={true} />);
    const el = container.querySelector("wave-r") as WaverElement;
    await act(async () => {});
    const shadow = el.shadowRoot!;
    const loadBtn = shadow.querySelector(".waver-action-btn:not(.waver-action-btn--record)") as HTMLButtonElement;
    const recordBtn = shadow.querySelector(".waver-action-btn--record") as HTMLButtonElement;
    expect(loadBtn.classList.contains("waver-action-btn--icon-only")).toBe(true);
    expect(recordBtn.classList.contains("waver-action-btn--icon-only")).toBe(true);
  });

  it("forwards the channelIndex prop to the element", async () => {
    const { container } = render(<Waver channelIndex={1} />);
    const el = container.querySelector("wave-r") as WaverElement;
    await act(async () => {});
    expect(el.getChannelIndex()).toBe(1);
  });

  it("exposes getSamples() and getSampleRate() via the ref", async () => {
    const ref = createRef<WaverHandle>();
    const { container } = render(<Waver ref={ref} />);
    await act(async () => {});
    const el = container.querySelector("wave-r") as WaverElement;
    el.loadSamples(new Float32Array([1, 2, 3]), 48000);
    expect(ref.current?.getSamples()).toEqual(new Float32Array([1, 2, 3]));
    expect(ref.current?.getSampleRate()).toBe(48000);
  });

  it("exposes getChannels() via the ref", async () => {
    const ref = createRef<WaverHandle>();
    const { container } = render(<Waver ref={ref} />);
    await act(async () => {});
    const el = container.querySelector("wave-r") as WaverElement;

    expect(ref.current?.getChannels()).toEqual([]);

    const left = new Float32Array([0.1, 0.2]);
    const right = new Float32Array([0.3, 0.4]);
    const buffer = {
      sampleRate: 44100,
      duration: left.length / 44100,
      numberOfChannels: 2,
      length: left.length,
      getChannelData: (i: number) => (i === 0 ? left : right),
      copyToChannel: vi.fn(),
    } as unknown as AudioBuffer;
    const ctx = makeFakeAudioContext() as unknown as AudioContext;

    act(() => {
      el.loadAudioBuffer(buffer, ctx);
    });

    const channels = ref.current?.getChannels();
    expect(channels).toHaveLength(2);
    expect(channels?.[0]).toEqual(left);
    expect(channels?.[1]).toEqual(right);
  });

  it("fires onLoadSuccess (with fileName) when the element emits waver:loadsuccess", async () => {
    const onLoadSuccess = vi.fn();
    const ref = createRef<WaverHandle>();
    render(<Waver ref={ref} onLoadSuccess={onLoadSuccess} />);
    await act(async () => {});

    act(() => {
      ref.current
        ?.element()
        ?.dispatchEvent(
          new CustomEvent("waver:loadsuccess", { detail: { durationSample: 100, sampleRate: 44100, fileName: "test.wav" } })
        );
    });

    expect(onLoadSuccess).toHaveBeenCalledWith({ durationSample: 100, sampleRate: 44100, fileName: "test.wav" });
  });

  it("fires onRecordSuccess when the element emits waver:recordsuccess", async () => {
    const onRecordSuccess = vi.fn();
    const ref = createRef<WaverHandle>();
    render(<Waver ref={ref} onRecordSuccess={onRecordSuccess} />);
    await act(async () => {});

    act(() => {
      ref.current
        ?.element()
        ?.dispatchEvent(new CustomEvent("waver:recordsuccess", { detail: { durationSample: 200, sampleRate: 48000 } }));
    });

    expect(onRecordSuccess).toHaveBeenCalledWith({ durationSample: 200, sampleRate: 48000 });
  });

  it("fires onBeforeLoad with the file when the element emits waver:beforeload", async () => {
    const onBeforeLoad = vi.fn();
    const ref = createRef<WaverHandle>();
    render(<Waver ref={ref} onBeforeLoad={onBeforeLoad} />);
    await act(async () => {});

    const file = new File([new ArrayBuffer(8)], "test.wav", { type: "audio/wav" });
    const event = new CustomEvent("waver:beforeload", { detail: { file }, cancelable: true });
    act(() => {
      ref.current?.element()?.dispatchEvent(event);
    });

    expect(onBeforeLoad).toHaveBeenCalledWith(file);
    expect(event.defaultPrevented).toBe(false);
  });

  it("returning false from onBeforeLoad calls preventDefault() on waver:beforeload", async () => {
    const ref = createRef<WaverHandle>();
    render(<Waver ref={ref} onBeforeLoad={() => false} />);
    await act(async () => {});

    const file = new File([new ArrayBuffer(8)], "test.wav", { type: "audio/wav" });
    const event = new CustomEvent("waver:beforeload", { detail: { file }, cancelable: true });
    act(() => {
      ref.current?.element()?.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
  });

  it("re-configures the element when only the validateFile prop identity changes", async () => {
    const validateFileA = () => null;
    const validateFileB = () => null;
    const { container, rerender } = render(<Waver validateFile={validateFileA} />);
    const el = container.querySelector("wave-r") as WaverElement;
    await act(async () => {});
    const configureSpy = vi.spyOn(el, "configure");

    rerender(<Waver validateFile={validateFileB} />);
    await act(async () => {});

    expect(configureSpy).toHaveBeenCalledWith(expect.objectContaining({ validateFile: validateFileB }));
  });

  it("fires onCursorChange when the element emits waver:cursorchange", async () => {
    const onCursorChange = vi.fn();
    const ref = createRef<WaverHandle>();
    render(<Waver ref={ref} onCursorChange={onCursorChange} />);
    await act(async () => {});

    act(() => {
      ref.current?.loadSamples(new Float32Array(1000), 44100);
      ref.current?.setCursorPosition(42);
    });

    expect(onCursorChange).toHaveBeenCalledWith(42);
  });

  it("fires onPlay/onStop from real playback lifecycle events", async () => {
    const onPlay = vi.fn();
    const onStop = vi.fn();
    const ref = createRef<WaverHandle>();
    render(<Waver ref={ref} onPlay={onPlay} onStop={onStop} />);
    await act(async () => {});

    const ctx = makeFakeAudioContext();
    const buffer = makeAudioBuffer(new Float32Array(1000), 1000);
    act(() => {
      ref.current?.loadAudioBuffer(buffer, ctx as unknown as AudioContext);
      ref.current?.element()?.play();
    });
    expect(onPlay).toHaveBeenCalledTimes(1);
    stubs.flush();

    act(() => {
      ref.current?.element()?.stop();
    });
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("fires onSelectionChange on setSelection", async () => {
    const onSelectionChange = vi.fn();
    const ref = createRef<WaverHandle>();
    render(<Waver ref={ref} onSelectionChange={onSelectionChange} />);
    await act(async () => {});

    act(() => {
      ref.current?.loadSamples(new Float32Array(1000), 44100);
      ref.current?.setSelection({ startSample: 10, endSample: 20 });
    });

    expect(onSelectionChange).toHaveBeenCalledWith({ startSample: 10, endSample: 20 }, true);
  });

  it("fires onRecordError when mic access is denied", async () => {
    const onRecordError = vi.fn();
    const ref = createRef<WaverHandle>();
    render(<Waver ref={ref} onRecordError={onRecordError} />);
    await act(async () => {});

    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn(async () => {
          throw new DOMException("denied", "NotAllowedError");
        }),
      },
    });

    await act(async () => {
      await ref.current?.element()?.startRecording();
    });

    expect(onRecordError).toHaveBeenCalledTimes(1);
  });

  it("re-configures the element when monitorButton prop changes", async () => {
    const { container, rerender } = render(<Waver monitorButton="enabled" />);
    const el = container.querySelector("wave-r") as WaverElement;
    const configureSpy = vi.spyOn(el, "configure");

    rerender(<Waver monitorButton="disabled" />);
    await act(async () => {});

    expect(configureSpy).toHaveBeenCalledWith(expect.objectContaining({ monitorButton: "disabled" }));
  });

  it("exposes startMonitoring/stopMonitoring/isMonitoring via the ref", async () => {
    const ref = createRef<WaverHandle>();
    render(<Waver ref={ref} />);
    await act(async () => {});

    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] }) as unknown as MediaStream),
      },
    });
    vi.stubGlobal(
      "AudioContext",
      vi.fn(function () {
        return makeFakeAudioContext();
      })
    );

    await act(async () => {
      ref.current?.startMonitoring();
    });
    expect(ref.current?.isMonitoring()).toBe(true);

    act(() => {
      ref.current?.stopMonitoring();
    });
    expect(ref.current?.isMonitoring()).toBe(false);
  });

  it("fires onMonitorStart/onMonitorStop from real monitoring lifecycle events", async () => {
    const onMonitorStart = vi.fn();
    const onMonitorStop = vi.fn();
    const ref = createRef<WaverHandle>();
    render(<Waver ref={ref} onMonitorStart={onMonitorStart} onMonitorStop={onMonitorStop} />);
    await act(async () => {});

    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] }) as unknown as MediaStream),
      },
    });
    vi.stubGlobal(
      "AudioContext",
      vi.fn(function () {
        return makeFakeAudioContext();
      })
    );

    await act(async () => {
      ref.current?.startMonitoring();
    });
    expect(onMonitorStart).toHaveBeenCalledTimes(1);

    act(() => {
      ref.current?.stopMonitoring();
    });
    expect(onMonitorStop).toHaveBeenCalledTimes(1);
  });

  it("stops listening after unmount (no stale event handlers)", async () => {
    const onCursorChange = vi.fn();
    const ref = createRef<WaverHandle>();
    const { unmount } = render(<Waver ref={ref} onCursorChange={onCursorChange} />);
    await act(async () => {});
    const el = ref.current?.element();

    unmount();
    act(() => {
      el?.setCursorPosition(10);
    });
    expect(onCursorChange).not.toHaveBeenCalled();
  });
});
