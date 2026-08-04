import { defineComponent, h, onBeforeUnmount, onMounted, ref, watch, type PropType } from "vue";
import type {
  ControlState,
  RecordViewMode,
  RulerTimeFormat,
  SelectionRange,
  ViewMode,
  WaverOptions,
  ZoomState,
} from "../core/types";
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
    loadButton: { type: String as PropType<ControlState>, default: undefined },
    recordButton: { type: String as PropType<ControlState>, default: undefined },
    monitorButton: { type: String as PropType<ControlState>, default: undefined },
    hideButtonLabels: { type: Boolean as PropType<boolean>, default: undefined },
    cancelButton: { type: String as PropType<ControlState>, default: undefined },
    viewMode: { type: String as PropType<ViewMode>, default: undefined },
    recordViewMode: { type: String as PropType<RecordViewMode>, default: undefined },
    recordWindowSeconds: { type: Number as PropType<number>, default: undefined },
    spectrogramFftSize: { type: Number as PropType<number>, default: undefined },
    spectrogramHop: { type: Number as PropType<number>, default: undefined },
    spectrogramFreqBins: { type: Number as PropType<number>, default: undefined },
    /** Stream startRecording() uses when called with no argument, including via the built-in
     * Record button. Set this (e.g. from a device picker) to control what gets recorded; Waver
     * never picks an input device on its own. */
    inputStream: { type: Object as PropType<MediaStream | null>, default: undefined },
    channelIndex: { type: Number as PropType<number>, default: undefined },
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
    monitorstart: () => true,
    monitorstop: () => true,
    loaderror: (_error: Error) => true,
    loadsuccess: (_detail: { durationSample: number; sampleRate: number; fileName: string }) => true,
    recordsuccess: (_detail: { durationSample: number; sampleRate: number }) => true,
    viewmodechange: (_viewMode: ViewMode) => true,
    spectrogramready: () => true,
    reset: () => true,
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
      ["waver:monitorstart", (() => emit("monitorstart")) as EventListener],
      ["waver:monitorstop", (() => emit("monitorstop")) as EventListener],
      ["waver:loaderror", ((e: CustomEvent) => emit("loaderror", e.detail.error)) as EventListener],
      ["waver:loadsuccess", ((e: CustomEvent) => emit("loadsuccess", e.detail)) as EventListener],
      ["waver:recordsuccess", ((e: CustomEvent) => emit("recordsuccess", e.detail)) as EventListener],
      ["waver:viewmodechange", ((e: CustomEvent) => emit("viewmodechange", e.detail.viewMode)) as EventListener],
      ["waver:spectrogramready", (() => emit("spectrogramready")) as EventListener],
      ["waver:reset", (() => emit("reset")) as EventListener],
    ];

    onMounted(() => {
      const el = elRef.value;
      if (!el) return;
      listeners.forEach(([type, handler]) => el.addEventListener(type, handler));
      el.configure(collectOptions());
      el.setInputStream(props.inputStream ?? null);
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
      if (props.loadButton !== undefined) opts.loadButton = props.loadButton;
      if (props.recordButton !== undefined) opts.recordButton = props.recordButton;
      if (props.monitorButton !== undefined) opts.monitorButton = props.monitorButton;
      if (props.hideButtonLabels !== undefined) opts.hideButtonLabels = props.hideButtonLabels;
      if (props.cancelButton !== undefined) opts.cancelButton = props.cancelButton;
      if (props.viewMode !== undefined) opts.viewMode = props.viewMode;
      if (props.recordViewMode !== undefined) opts.recordViewMode = props.recordViewMode;
      if (props.recordWindowSeconds !== undefined) opts.recordWindowSeconds = props.recordWindowSeconds;
      if (props.spectrogramFftSize !== undefined) opts.spectrogramFftSize = props.spectrogramFftSize;
      if (props.spectrogramHop !== undefined) opts.spectrogramHop = props.spectrogramHop;
      if (props.spectrogramFreqBins !== undefined) opts.spectrogramFreqBins = props.spectrogramFreqBins;
      if (props.channelIndex !== undefined) opts.channelIndex = props.channelIndex;
      return opts;
    }

    watch(
      () => collectOptions(),
      (opts) => elRef.value?.configure(opts),
      { deep: true }
    );

    watch(
      () => props.inputStream,
      (stream) => elRef.value?.setInputStream(stream ?? null)
    );

    expose({
      loadSamples: (samples: Float32Array, sampleRate: number) => elRef.value?.loadSamples(samples, sampleRate),
      loadAudioBuffer: (buffer: AudioBuffer, context: AudioContext) => elRef.value?.loadAudioBuffer(buffer, context),
      connectExternalAudioNode: (node: AudioNode | null) => elRef.value?.connectExternalAudioNode(node),
      play: () => elRef.value?.play(),
      stop: () => elRef.value?.stop(),
      togglePlayback: () => elRef.value?.togglePlayback(),
      startRecording: (stream?: MediaStream) => elRef.value?.startRecording(stream),
      stopRecording: () => elRef.value?.stopRecording(),
      startMonitoring: (stream?: MediaStream) => elRef.value?.startMonitoring(stream),
      stopMonitoring: () => elRef.value?.stopMonitoring(),
      reset: () => elRef.value?.reset(),
      hasAudio: () => elRef.value?.hasAudio() ?? false,
      isRecording: () => elRef.value?.isRecording() ?? false,
      isMonitoring: () => elRef.value?.isMonitoring() ?? false,
      setZoom: (zoom: Partial<ZoomState>, animate?: boolean) => elRef.value?.setZoom(zoom, animate),
      zoomToFull: () => elRef.value?.zoomToFull(),
      setSelection: (selection: SelectionRange | null) => elRef.value?.setSelection(selection),
      setCursorPosition: (sample: number, emitEvent?: boolean) => elRef.value?.setCursorPosition(sample, emitEvent),
      getSelection: () => elRef.value?.getSelection() ?? null,
      getCursorPosition: () => elRef.value?.getCursorPosition() ?? 0,
      getZoom: () => elRef.value?.getZoom() ?? { samplesPerPixel: 1, offsetSample: 0 },
      setViewMode: (mode: ViewMode) => elRef.value?.setViewMode(mode),
      getViewMode: () => elRef.value?.getViewMode() ?? "waveform",
      element: () => elRef.value,
      getSamples: () => elRef.value?.getSamples() ?? new Float32Array(0),
      getChannels: () => elRef.value?.getChannels() ?? [],
      getSampleRate: () => elRef.value?.getSampleRate() ?? 44100,
    });

    return () => h("wave-r", { ref: elRef });
  },
});
