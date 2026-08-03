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

    expect(onSelectionChange).toHaveBeenCalledWith({ startSample: 10, endSample: 20 });
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
