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
  startRecording: () => void;
  stopRecording: () => void;
  hasAudio: () => boolean;
  isRecording: () => boolean;
  setZoom: (zoom: Partial<ZoomState>) => void;
  zoomToFull: () => void;
  setSelection: (selection: SelectionRange | null) => void;
  setCursorPosition: (sample: number) => void;
  getSelection: () => SelectionRange | null;
  getCursorPosition: () => number;
  getZoom: () => ZoomState;
  setViewMode: (mode: ViewMode) => void;
  getViewMode: () => ViewMode;
  element: () => WaverElement | null;
}

export interface WaverProps extends Partial<WaverOptions> {
  className?: string;
  style?: CSSProperties;
  onCursorChange?: (positionSample: number) => void;
  onSelectionChange?: (selection: SelectionRange | null) => void;
  onZoomChange?: (zoom: ZoomState) => void;
  onPlay?: (positionSample: number) => void;
  onStop?: (positionSample: number) => void;
  onLoop?: (positionSample: number) => void;
  onRecordStart?: () => void;
  onRecordStop?: (positionSample: number) => void;
  onRecordError?: (error: Error) => void;
  onLoadError?: (error: Error) => void;
  onViewModeChange?: (viewMode: ViewMode) => void;
  onSpectrogramReady?: () => void;
}

/** React wrapper around the `<wave-r>` custom element. Configure/load data imperatively via the ref. */
export const Waver = forwardRef<WaverHandle, WaverProps>(function Waver(props, ref) {
  const {
    className,
    style,
    onCursorChange,
    onSelectionChange,
    onZoomChange,
    onPlay,
    onStop,
    onLoop,
    onRecordStart,
    onRecordStop,
    onRecordError,
    onLoadError,
    onViewModeChange,
    onSpectrogramReady,
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
      startRecording: () => void elRef.current?.startRecording(),
      stopRecording: () => elRef.current?.stopRecording(),
      hasAudio: () => elRef.current?.hasAudio() ?? false,
      isRecording: () => elRef.current?.isRecording() ?? false,
      setZoom: (z) => elRef.current?.setZoom(z),
      zoomToFull: () => elRef.current?.zoomToFull(),
      setSelection: (s) => elRef.current?.setSelection(s),
      setCursorPosition: (s) => elRef.current?.setCursorPosition(s),
      getSelection: () => elRef.current?.getSelection() ?? null,
      getCursorPosition: () => elRef.current?.getCursorPosition() ?? 0,
      getZoom: () => elRef.current?.getZoom() ?? { samplesPerPixel: 1, offsetSample: 0 },
      setViewMode: (mode) => elRef.current?.setViewMode(mode),
      getViewMode: () => elRef.current?.getViewMode() ?? "waveform",
      element: () => elRef.current,
    }),
    []
  );

  useEffect(() => {
    elRef.current?.configure(options);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(options)]);

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
      ["waver:loaderror", ((e: CustomEvent) => onLoadError?.(e.detail.error)) as EventListener],
      ["waver:viewmodechange", ((e: CustomEvent) => onViewModeChange?.(e.detail.viewMode)) as EventListener],
      ["waver:spectrogramready", (() => onSpectrogramReady?.()) as EventListener],
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
    onLoadError,
    onViewModeChange,
    onSpectrogramReady,
  ]);

  return <wave-r ref={elRef as never} className={className} style={style as never} />;
});
