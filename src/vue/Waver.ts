import { defineComponent, h, onBeforeUnmount, onMounted, ref, watch, type PropType } from "vue";
import type { RulerTimeFormat, SelectionRange, WaverOptions, ZoomState } from "../core/types";
import { defineWaverElement, type WaverElement } from "../waver-element";

defineWaverElement();

/** Vue 3 wrapper around the `<wave-r>` custom element. Configure/load data imperatively via the exposed methods. */
export const Waver = defineComponent({
  name: "Waver",
  props: {
    height: { type: [Number, String] as PropType<WaverOptions["height"]>, default: undefined },
    minimapHeightRatio: { type: Number as PropType<number>, default: undefined },
    theme: { type: Object as PropType<WaverOptions["theme"]>, default: undefined },
    showZeroLine: { type: Boolean as PropType<boolean>, default: undefined },
    roundedCorners: { type: Boolean as PropType<boolean>, default: undefined },
    showMinimap: { type: Boolean as PropType<boolean>, default: undefined },
    showRuler: { type: Boolean as PropType<boolean>, default: undefined },
    rulerTimeFormat: { type: String as PropType<RulerTimeFormat>, default: undefined },
    rulerHeight: { type: Number as PropType<number>, default: undefined },
    showLoadButton: { type: Boolean as PropType<boolean>, default: undefined },
    showRecordButton: { type: Boolean as PropType<boolean>, default: undefined },
  },
  emits: {
    cursorchange: (_positionSample: number) => true,
    selectionchange: (_selection: SelectionRange | null) => true,
    zoomchange: (_zoom: ZoomState) => true,
    play: (_positionSample: number) => true,
    stop: (_positionSample: number) => true,
    loop: (_positionSample: number) => true,
    recordstart: () => true,
    recordstop: (_positionSample: number) => true,
    recorderror: (_error: Error) => true,
    loaderror: (_error: Error) => true,
  },
  setup(props, { emit, expose }) {
    const elRef = ref<WaverElement | null>(null);

    const listeners: Array<[string, EventListener]> = [
      ["waver:cursorchange", ((e: CustomEvent) => emit("cursorchange", e.detail.positionSample)) as EventListener],
      ["waver:selectionchange", ((e: CustomEvent) => emit("selectionchange", e.detail.selection)) as EventListener],
      ["waver:zoomchange", ((e: CustomEvent) => emit("zoomchange", e.detail.zoom)) as EventListener],
      ["waver:play", ((e: CustomEvent) => emit("play", e.detail.positionSample)) as EventListener],
      ["waver:stop", ((e: CustomEvent) => emit("stop", e.detail.positionSample)) as EventListener],
      ["waver:loop", ((e: CustomEvent) => emit("loop", e.detail.positionSample)) as EventListener],
      ["waver:recordstart", (() => emit("recordstart")) as EventListener],
      ["waver:recordstop", ((e: CustomEvent) => emit("recordstop", e.detail.positionSample)) as EventListener],
      ["waver:recorderror", ((e: CustomEvent) => emit("recorderror", e.detail.error)) as EventListener],
      ["waver:loaderror", ((e: CustomEvent) => emit("loaderror", e.detail.error)) as EventListener],
    ];

    onMounted(() => {
      const el = elRef.value;
      if (!el) return;
      listeners.forEach(([type, handler]) => el.addEventListener(type, handler));
      el.configure(collectOptions());
    });

    onBeforeUnmount(() => {
      const el = elRef.value;
      if (!el) return;
      listeners.forEach(([type, handler]) => el.removeEventListener(type, handler));
    });

    function collectOptions(): Partial<WaverOptions> {
      const opts: Partial<WaverOptions> = {};
      if (props.height !== undefined) opts.height = props.height;
      if (props.minimapHeightRatio !== undefined) opts.minimapHeightRatio = props.minimapHeightRatio;
      if (props.theme !== undefined) opts.theme = props.theme;
      if (props.showZeroLine !== undefined) opts.showZeroLine = props.showZeroLine;
      if (props.roundedCorners !== undefined) opts.roundedCorners = props.roundedCorners;
      if (props.showMinimap !== undefined) opts.showMinimap = props.showMinimap;
      if (props.showRuler !== undefined) opts.showRuler = props.showRuler;
      if (props.rulerTimeFormat !== undefined) opts.rulerTimeFormat = props.rulerTimeFormat;
      if (props.rulerHeight !== undefined) opts.rulerHeight = props.rulerHeight;
      if (props.showLoadButton !== undefined) opts.showLoadButton = props.showLoadButton;
      if (props.showRecordButton !== undefined) opts.showRecordButton = props.showRecordButton;
      return opts;
    }

    watch(
      () => collectOptions(),
      (opts) => elRef.value?.configure(opts),
      { deep: true }
    );

    expose({
      loadSamples: (samples: Float32Array, sampleRate: number) => elRef.value?.loadSamples(samples, sampleRate),
      loadAudioBuffer: (buffer: AudioBuffer, context: AudioContext) => elRef.value?.loadAudioBuffer(buffer, context),
      connectExternalAudioNode: (node: AudioNode | null) => elRef.value?.connectExternalAudioNode(node),
      play: () => elRef.value?.play(),
      stop: () => elRef.value?.stop(),
      togglePlayback: () => elRef.value?.togglePlayback(),
      startRecording: () => elRef.value?.startRecording(),
      stopRecording: () => elRef.value?.stopRecording(),
      hasAudio: () => elRef.value?.hasAudio() ?? false,
      isRecording: () => elRef.value?.isRecording() ?? false,
      setZoom: (zoom: Partial<ZoomState>) => elRef.value?.setZoom(zoom),
      zoomToFull: () => elRef.value?.zoomToFull(),
      setSelection: (selection: SelectionRange | null) => elRef.value?.setSelection(selection),
      setCursorPosition: (sample: number) => elRef.value?.setCursorPosition(sample),
      getSelection: () => elRef.value?.getSelection() ?? null,
      getCursorPosition: () => elRef.value?.getCursorPosition() ?? 0,
      getZoom: () => elRef.value?.getZoom() ?? { samplesPerPixel: 1, offsetSample: 0 },
      element: () => elRef.value,
    });

    return () => h("wave-r", { ref: elRef });
  },
});
