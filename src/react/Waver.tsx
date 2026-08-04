import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { CSSProperties } from "react";
import type { SelectionRange, ViewMode, WaverOptions, ZoomState } from "../core/types";
import { defineWaverElement, type WaverElement } from "../waver-element";

defineWaverElement();

export interface WaverHandle {
  loadSamples: (samples: Float32Array, sampleRate: number) => void;
  loadAudioBuffer: (buffer: AudioBuffer, context: AudioContext) => void;
  connectExternalAudioNode: (node: AudioNode | null) => void;
  play: () => void;
  stop: () => void;
  togglePlayback: () => void;
  startRecording: (stream?: MediaStream) => void;
  stopRecording: () => void;
  startMonitoring: (stream?: MediaStream) => void;
  stopMonitoring: () => void;
  reset: () => void;
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
  getChannels: () => Float32Array[];
  getSampleRate: () => number;
}

export interface WaverProps extends Partial<WaverOptions> {
  className?: string;
  style?: CSSProperties;
  /** Stream startRecording() uses when called with no argument, including via the built-in Record
   * button. Set this (e.g. from a device picker) to control what gets recorded; Waver never picks
   * an input device on its own. */
  inputStream?: MediaStream | null;
  onCursorChange?: (positionSample: number) => void;
  onSelectionChange?: (selection: SelectionRange | null) => void;
  onZoomChange?: (zoom: ZoomState) => void;
  onPlay?: (positionSample: number) => void;
  onStop?: (positionSample: number) => void;
  onLoop?: (positionSample: number) => void;
  onRecordStart?: () => void;
  onRecordStop?: (positionSample: number) => void;
  onRecordError?: (error: Error) => void;
  onMonitorStart?: () => void;
  onMonitorStop?: () => void;
  onLoadError?: (error: Error) => void;
  onViewModeChange?: (viewMode: ViewMode) => void;
  onSpectrogramReady?: () => void;
  onReset?: () => void;
  onLoadSuccess?: (detail: { durationSample: number; sampleRate: number; fileName: string }) => void;
  onRecordSuccess?: (detail: { durationSample: number; sampleRate: number }) => void;
}

/** React wrapper around the `<wave-r>` custom element. Configure/load data imperatively via the ref. */
export const Waver = forwardRef<WaverHandle, WaverProps>(function Waver(props, ref) {
  const {
    className,
    style,
    inputStream,
    onCursorChange,
    onSelectionChange,
    onZoomChange,
    onPlay,
    onStop,
    onLoop,
    onRecordStart,
    onRecordStop,
    onRecordError,
    onMonitorStart,
    onMonitorStop,
    onLoadError,
    onViewModeChange,
    onSpectrogramReady,
    onReset,
    onLoadSuccess,
    onRecordSuccess,
    ...options
  } = props;
  const elRef = useRef<WaverElement | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      loadSamples: (s, sr) => elRef.current?.loadSamples(s, sr),
      loadAudioBuffer: (b, ctx) => elRef.current?.loadAudioBuffer(b, ctx),
      connectExternalAudioNode: (n) => elRef.current?.connectExternalAudioNode(n),
      play: () => elRef.current?.play(),
      stop: () => elRef.current?.stop(),
      togglePlayback: () => elRef.current?.togglePlayback(),
      startRecording: (stream) => void elRef.current?.startRecording(stream),
      stopRecording: () => elRef.current?.stopRecording(),
      startMonitoring: (stream) => void elRef.current?.startMonitoring(stream),
      stopMonitoring: () => elRef.current?.stopMonitoring(),
      reset: () => elRef.current?.reset(),
      hasAudio: () => elRef.current?.hasAudio() ?? false,
      isRecording: () => elRef.current?.isRecording() ?? false,
      isMonitoring: () => elRef.current?.isMonitoring() ?? false,
      setZoom: (z, animate) => elRef.current?.setZoom(z, animate),
      zoomToFull: () => elRef.current?.zoomToFull(),
      setSelection: (s) => elRef.current?.setSelection(s),
      setCursorPosition: (s, emitEvent) => elRef.current?.setCursorPosition(s, emitEvent),
      getSelection: () => elRef.current?.getSelection() ?? null,
      getCursorPosition: () => elRef.current?.getCursorPosition() ?? 0,
      getZoom: () => elRef.current?.getZoom() ?? { samplesPerPixel: 1, offsetSample: 0 },
      setViewMode: (mode) => elRef.current?.setViewMode(mode),
      getViewMode: () => elRef.current?.getViewMode() ?? "waveform",
      element: () => elRef.current,
      getSamples: () => elRef.current?.getSamples() ?? new Float32Array(0),
      getChannels: () => elRef.current?.getChannels() ?? [],
      getSampleRate: () => elRef.current?.getSampleRate() ?? 44100,
    }),
    []
  );

  useEffect(() => {
    elRef.current?.configure(options);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(options)]);

  useEffect(() => {
    elRef.current?.setInputStream(inputStream ?? null);
  }, [inputStream]);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;

    const handlers: Array<[string, EventListener]> = [
      ["waver:cursorchange", ((e: CustomEvent) => onCursorChange?.(e.detail.positionSample)) as EventListener],
      ["waver:selectionchange", ((e: CustomEvent) => onSelectionChange?.(e.detail.selection)) as EventListener],
      ["waver:zoomchange", ((e: CustomEvent) => onZoomChange?.(e.detail.zoom)) as EventListener],
      ["waver:play", ((e: CustomEvent) => onPlay?.(e.detail.positionSample)) as EventListener],
      ["waver:stop", ((e: CustomEvent) => onStop?.(e.detail.positionSample)) as EventListener],
      ["waver:loop", ((e: CustomEvent) => onLoop?.(e.detail.positionSample)) as EventListener],
      ["waver:recordstart", (() => onRecordStart?.()) as EventListener],
      ["waver:recordstop", ((e: CustomEvent) => onRecordStop?.(e.detail.positionSample)) as EventListener],
      ["waver:recorderror", ((e: CustomEvent) => onRecordError?.(e.detail.error)) as EventListener],
      ["waver:monitorstart", (() => onMonitorStart?.()) as EventListener],
      ["waver:monitorstop", (() => onMonitorStop?.()) as EventListener],
      ["waver:loaderror", ((e: CustomEvent) => onLoadError?.(e.detail.error)) as EventListener],
      ["waver:viewmodechange", ((e: CustomEvent) => onViewModeChange?.(e.detail.viewMode)) as EventListener],
      ["waver:spectrogramready", (() => onSpectrogramReady?.()) as EventListener],
      ["waver:reset", (() => onReset?.()) as EventListener],
      ["waver:loadsuccess", ((e: CustomEvent) => onLoadSuccess?.(e.detail)) as EventListener],
      ["waver:recordsuccess", ((e: CustomEvent) => onRecordSuccess?.(e.detail)) as EventListener],
    ];
    handlers.forEach(([type, handler]) => el.addEventListener(type, handler));
    return () => handlers.forEach(([type, handler]) => el.removeEventListener(type, handler));
  }, [
    onCursorChange,
    onSelectionChange,
    onZoomChange,
    onPlay,
    onStop,
    onLoop,
    onRecordStart,
    onRecordStop,
    onRecordError,
    onMonitorStart,
    onMonitorStop,
    onLoadError,
    onViewModeChange,
    onSpectrogramReady,
    onReset,
    onLoadSuccess,
    onRecordSuccess,
  ]);

  return <wave-r ref={elRef as never} class={className as never} style={style as never} />;
});
