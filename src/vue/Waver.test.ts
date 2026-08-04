import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SelectionRange, ViewMode, ZoomState } from "../core/types";
import type { WaverElement } from "../waver-element";
import { installDomStubs, makeAudioBuffer, makeFakeAudioContext } from "../waver-element.test-helpers";
import { Waver } from "./Waver";

/**
 * Mirrors the object passed to `expose()` in Waver.ts's setup(). Imperative `expose()` calls
 * aren't statically analyzable the way `<script setup>`'s `defineExpose()` macro is, so
 * `mount()`'s inferred instance type has no way to know these members exist even though they're
 * fully present at runtime — cast through this type instead of `wrapper.vm` directly.
 */
type WaverVueExposed = {
  loadSamples: (samples: Float32Array, sampleRate: number) => void;
  loadAudioBuffer: (buffer: AudioBuffer, context: AudioContext) => void;
  connectExternalAudioNode: (node: AudioNode | null) => void;
  play: () => void;
  stop: () => void;
  togglePlayback: () => void;
  startRecording: () => void;
  stopRecording: () => void;
  startMonitoring: () => void;
  stopMonitoring: () => void;
  hasAudio: () => boolean;
  isRecording: () => boolean;
  isMonitoring: () => boolean;
  setZoom: (zoom: Partial<ZoomState>, animate?: boolean) => void;
  zoomToFull: () => void;
  setSelection: (selection: SelectionRange | null) => void;
  setCursorPosition: (sample: number, emitEvent?: boolean) => void;
  getSelection: () => SelectionRange | null;
  getCursorPosition: () => number;
  getZoom: () => ZoomState;
  setViewMode: (mode: ViewMode) => void;
  getViewMode: () => ViewMode;
  element: () => WaverElement | null;
  getSamples: () => Float32Array;
  getSampleRate: () => number;
};

function exposed(wrapper: { vm: unknown }): WaverVueExposed {
  return wrapper.vm as WaverVueExposed;
}

describe("Vue Waver wrapper", () => {
  let stubs: ReturnType<typeof installDomStubs>;

  beforeEach(() => {
    stubs = installDomStubs(300, 100);
  });

  afterEach(() => {
    stubs.restore();
  });

  it("renders the underlying <wave-r> custom element", () => {
    const wrapper = mount(Waver);
    expect(wrapper.find("wave-r").exists()).toBe(true);
  });

  it("configures the element from props on mount", async () => {
    const wrapper = mount(Waver, { props: { loadButton: "disabled" } });
    await wrapper.vm.$nextTick();
    const el = wrapper.find("wave-r").element as WaverElement;
    const loadBtn = el.shadowRoot!.querySelector(".waver-action-btn:not(.waver-action-btn--record)") as HTMLButtonElement;
    expect(loadBtn.disabled).toBe(true);
  });

  it("re-configures the element reactively when a prop changes", async () => {
    const wrapper = mount(Waver, { props: { recordButton: "enabled" as const } });
    const el = wrapper.find("wave-r").element as WaverElement;
    const configureSpy = vi.spyOn(el, "configure");

    await wrapper.setProps({ recordButton: "hidden" });
    await wrapper.vm.$nextTick();

    expect(configureSpy).toHaveBeenCalledWith(expect.objectContaining({ recordButton: "hidden" }));
  });

  it("configures hideButtonLabels from props on mount", async () => {
    const wrapper = mount(Waver, { props: { hideButtonLabels: true } });
    await wrapper.vm.$nextTick();
    const el = wrapper.find("wave-r").element as WaverElement;
    const loadBtn = el.shadowRoot!.querySelector(".waver-action-btn:not(.waver-action-btn--record)") as HTMLButtonElement;
    expect(loadBtn.classList.contains("waver-action-btn--icon-only")).toBe(true);
  });

  it("re-configures hideButtonLabels reactively when the prop changes", async () => {
    const wrapper = mount(Waver, { props: { hideButtonLabels: false } });
    const el = wrapper.find("wave-r").element as WaverElement;
    const configureSpy = vi.spyOn(el, "configure");

    await wrapper.setProps({ hideButtonLabels: true });
    await wrapper.vm.$nextTick();

    expect(configureSpy).toHaveBeenCalledWith(expect.objectContaining({ hideButtonLabels: true }));
  });

  it("forwards the cancelButton prop on mount", async () => {
    const wrapper = mount(Waver, { props: { cancelButton: "hidden" } });
    await wrapper.vm.$nextTick();
    const el = wrapper.find("wave-r").element as WaverElement;
    el.loadSamples(new Float32Array(1000), 44100);
    const cancelBtn = el.shadowRoot!.querySelector(".waver-cancel-btn") as HTMLButtonElement;
    expect(cancelBtn.style.display).toBe("none");
  });

  it("re-configures cancelButton reactively when the prop changes", async () => {
    const wrapper = mount(Waver, { props: { cancelButton: "enabled" as const } });
    const el = wrapper.find("wave-r").element as WaverElement;
    const configureSpy = vi.spyOn(el, "configure");

    await wrapper.setProps({ cancelButton: "hidden" });
    await wrapper.vm.$nextTick();

    expect(configureSpy).toHaveBeenCalledWith(expect.objectContaining({ cancelButton: "hidden" }));
  });

  it("exposes imperative methods on the component instance", async () => {
    const wrapper = mount(Waver);
    await wrapper.vm.$nextTick();

    expect(exposed(wrapper).hasAudio()).toBe(false);
    expect(exposed(wrapper).isRecording()).toBe(false);
    expect(exposed(wrapper).isMonitoring()).toBe(false);
    expect(exposed(wrapper).getZoom()).toEqual({ samplesPerPixel: 1, offsetSample: 0 });

    exposed(wrapper).loadSamples(new Float32Array(1000), 44100);
    expect(exposed(wrapper).hasAudio()).toBe(true);
  });

  it("element() returns the underlying WaverElement instance", async () => {
    const wrapper = mount(Waver);
    await wrapper.vm.$nextTick();
    expect(exposed(wrapper).element()).toBe(wrapper.find("wave-r").element);
  });

  it("forwards the channelIndex prop to the element", async () => {
    const wrapper = mount(Waver, { props: { channelIndex: 1 } });
    await wrapper.vm.$nextTick();
    const el = wrapper.find("wave-r").element as WaverElement;
    expect(el.getChannelIndex()).toBe(1);
  });

  it("exposes getSamples() and getSampleRate()", async () => {
    const wrapper = mount(Waver);
    await wrapper.vm.$nextTick();
    const el = wrapper.find("wave-r").element as WaverElement;
    el.loadSamples(new Float32Array([1, 2, 3]), 48000);
    expect(exposed(wrapper).getSamples()).toEqual(new Float32Array([1, 2, 3]));
    expect(exposed(wrapper).getSampleRate()).toBe(48000);
  });

  it("emits cursorchange when the element fires waver:cursorchange", async () => {
    const wrapper = mount(Waver);
    await wrapper.vm.$nextTick();

    exposed(wrapper).loadSamples(new Float32Array(1000), 44100);
    exposed(wrapper).setCursorPosition(42);

    expect(wrapper.emitted("cursorchange")).toEqual([[42]]);
  });

  it("emits play/stop from real playback lifecycle events", async () => {
    const wrapper = mount(Waver);
    await wrapper.vm.$nextTick();

    const ctx = makeFakeAudioContext();
    const buffer = makeAudioBuffer(new Float32Array(1000), 1000);
    exposed(wrapper).loadAudioBuffer(buffer, ctx as unknown as AudioContext);
    exposed(wrapper).play();
    expect(wrapper.emitted("play")).toHaveLength(1);
    stubs.flush();

    exposed(wrapper).stop();
    expect(wrapper.emitted("stop")).toHaveLength(1);
  });

  it("emits selectionchange on setSelection", async () => {
    const wrapper = mount(Waver);
    await wrapper.vm.$nextTick();

    exposed(wrapper).loadSamples(new Float32Array(1000), 44100);
    exposed(wrapper).setSelection({ startSample: 10, endSample: 20 });

    expect(wrapper.emitted("selectionchange")).toEqual([[{ startSample: 10, endSample: 20 }]]);
  });

  it("emits recorderror when mic access is denied", async () => {
    const wrapper = mount(Waver);
    await wrapper.vm.$nextTick();

    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn(async () => {
          throw new DOMException("denied", "NotAllowedError");
        }),
      },
    });

    await exposed(wrapper).startRecording();

    expect(wrapper.emitted("recorderror")).toHaveLength(1);
  });

  it("re-configures monitorButton reactively when the prop changes", async () => {
    const wrapper = mount(Waver, { props: { monitorButton: "enabled" as const } });
    const el = wrapper.find("wave-r").element as WaverElement;
    const configureSpy = vi.spyOn(el, "configure");

    await wrapper.setProps({ monitorButton: "disabled" });
    await wrapper.vm.$nextTick();

    expect(configureSpy).toHaveBeenCalledWith(expect.objectContaining({ monitorButton: "disabled" }));
  });

  it("exposes startMonitoring/stopMonitoring/isMonitoring", async () => {
    const wrapper = mount(Waver);
    await wrapper.vm.$nextTick();

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

    await exposed(wrapper).startMonitoring();
    expect(exposed(wrapper).isMonitoring()).toBe(true);

    exposed(wrapper).stopMonitoring();
    expect(exposed(wrapper).isMonitoring()).toBe(false);
  });

  it("emits monitorstart/monitorstop", async () => {
    const wrapper = mount(Waver);
    await wrapper.vm.$nextTick();

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

    await exposed(wrapper).startMonitoring();
    expect(wrapper.emitted("monitorstart")).toHaveLength(1);

    exposed(wrapper).stopMonitoring();
    expect(wrapper.emitted("monitorstop")).toHaveLength(1);
  });

  it("removes event listeners on unmount (no stale emits)", async () => {
    const wrapper = mount(Waver);
    await wrapper.vm.$nextTick();
    const el = exposed(wrapper).element();

    wrapper.unmount();
    el?.setCursorPosition(10);

    expect(wrapper.emitted("cursorchange")).toBeUndefined();
  });
});
