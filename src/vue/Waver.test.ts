import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WaverElement } from "../waver-element";
import { installDomStubs, makeAudioBuffer, makeFakeAudioContext } from "../waver-element.test-helpers";
import { Waver } from "./Waver";

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

  it("exposes imperative methods on the component instance", async () => {
    const wrapper = mount(Waver);
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.hasAudio()).toBe(false);
    expect(wrapper.vm.isRecording()).toBe(false);
    expect(wrapper.vm.getZoom()).toEqual({ samplesPerPixel: 1, offsetSample: 0 });

    wrapper.vm.loadSamples(new Float32Array(1000), 44100);
    expect(wrapper.vm.hasAudio()).toBe(true);
  });

  it("element() returns the underlying WaverElement instance", async () => {
    const wrapper = mount(Waver);
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.element()).toBe(wrapper.find("wave-r").element);
  });

  it("emits cursorchange when the element fires waver:cursorchange", async () => {
    const wrapper = mount(Waver);
    await wrapper.vm.$nextTick();

    wrapper.vm.loadSamples(new Float32Array(1000), 44100);
    wrapper.vm.setCursorPosition(42);

    expect(wrapper.emitted("cursorchange")).toEqual([[42]]);
  });

  it("emits play/stop from real playback lifecycle events", async () => {
    const wrapper = mount(Waver);
    await wrapper.vm.$nextTick();

    const ctx = makeFakeAudioContext();
    const buffer = makeAudioBuffer(new Float32Array(1000), 1000);
    wrapper.vm.loadAudioBuffer(buffer, ctx as unknown as AudioContext);
    wrapper.vm.play();
    expect(wrapper.emitted("play")).toHaveLength(1);
    stubs.flush();

    wrapper.vm.stop();
    expect(wrapper.emitted("stop")).toHaveLength(1);
  });

  it("emits selectionchange on setSelection", async () => {
    const wrapper = mount(Waver);
    await wrapper.vm.$nextTick();

    wrapper.vm.loadSamples(new Float32Array(1000), 44100);
    wrapper.vm.setSelection({ startSample: 10, endSample: 20 });

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

    await wrapper.vm.startRecording();

    expect(wrapper.emitted("recorderror")).toHaveLength(1);
  });

  it("removes event listeners on unmount (no stale emits)", async () => {
    const wrapper = mount(Waver);
    await wrapper.vm.$nextTick();
    const el = wrapper.vm.element();

    wrapper.unmount();
    el?.setCursorPosition(10);

    expect(wrapper.emitted("cursorchange")).toBeUndefined();
  });
});
