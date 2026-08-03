# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Touch support: two-finger pinch to zoom, two-finger swipe to pan.
- `recordViewMode` option (`"flat"` / `"zoom-out"` / `"scroll"`) and `recordWindowSeconds` option
  controlling the viewport while recording.
- `setInputStream()` / `getInputStream()` and an optional `MediaStream` argument to
  `startRecording()`, plus the `inputStream` prop in the React/Vue wrappers, for selecting a
  specific recording input device.
- `channelIndex` option (and `setChannelIndex()`/`getChannelIndex()`), plus an optional
  `channelIndex` argument to `startRecording()`, for picking a specific channel out of a
  multi-channel recording source (falls back to channel 0 if the source is narrower than
  requested). The `channelIndex` prop in the React/Vue wrappers mirrors `inputStream`.
- `getSamples()` / `getSampleRate()` methods to read back the currently loaded (or, mid-recording,
  in-progress) sample buffer — lets a host app pull a just-finished recording out after
  `waver:recordstop` without re-deriving it from the original stream.
- `reset()` and `hasAudio()` methods, and a `waver:reset` event.
- `height: "auto"`, inheriting the host element's rendered CSS height.
- Spectrogram view (`viewMode: "spectrogram"`), computed off the main thread via Web Workers and
  cached per buffer/resolution, with `spectrogramFftSize` / `spectrogramHop` / `spectrogramFreqBins`
  options and a `waver:spectrogramready` event.
- Built-in mic recording overlay (Record button, live readout, Stop button) alongside the existing
  Load File flow, with `recordButton` control state, and `waver:recordstart` / `waver:recordstop` /
  `waver:recorderror` events.
- `waver:selectionchanged` / `waver:selectionreset` settled-selection events (core element only —
  not yet forwarded by the React/Vue wrappers), alongside the existing continuous
  `waver:selectionchange`.
- Playwright end-to-end suite and CI job.

## [0.1.0] - Initial development

Initial implementation: waveform + minimap rendering, zoom/pan, click-drag selection, seek ruler,
Web Audio playback with external-node hook, theming (light/dark, Google Fonts, rounded corners),
and React/Vue wrappers.
