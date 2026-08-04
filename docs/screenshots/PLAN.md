# Screenshots — Waver

Captured screenshots illustrating every feature in the [Usage Manual](../manual.md).

---

## empty-state/

### 01-full-page-default.png
Whole demo page on first load — Load File, Monitor, and Record buttons visible in the empty overlay, controls row at top, status line. Orientation shot.

### 02-buttons-with-labels.png
Close-up of empty overlay buttons with text labels (default `hideButtonLabels: false`).

### 03-buttons-icon-only.png
Same empty overlay after `hideButtonLabels: true` — icon-only buttons.

---

## loading/

### 01-waveform-loaded-default.png
Waveform loaded, default view — ruler strip at top, waveform body, minimap strip at bottom, zero line visible.

### 02-load-error.png
Status line showing "Failed to decode audio…" after attempting to load a corrupt file.

---

## selection/

### 01-click-drag-selection.png
Click-drag selection on the waveform — shaded overlay region with resize handles at edges.

---

## playback/

### 01-playback-in-progress.png
Cursor mid-waveform while audio is playing (static frame).

---

## zoom/

### 01-zoomed-in-samples.png
Deeply zoomed waveform showing individual sample steps (single-sample resolution).

### 02-zoomed-to-full.png
Same buffer, zoomed to fit entirely in the viewport.

---

## view-modes/

### 01-spectrogram-view.png
Spectrogram view mode replacing the waveform (frequency content over time).

---

## minimap/

### 01-minimap-closeup.png
Minimap strip with viewport overlay rectangle (after zooming in, so the overlay is a partial-width band).

---

## recording/

### 01-recording-overlay-scroll.png
Live recording UI — pulsing dot, elapsed time, Stop button. Waveform accumulates in scroll mode as capture proceeds.

---

## cancel/

### 01-cancel-confirm-overlay.png
Confirmation dialog (Keep / Clear) shown after clicking the cancel (×) button with audio loaded.

---

## ruler/

### 01-ruler-time-format.png
Ruler strip in default `"time"` format (hh:mm:ss / mm:ss labels).

### 02-ruler-samples-format.png
Ruler strip in `"samples"` format (raw sample index labels).

---

## theming/

### 01-dark-theme.png
Default dark theme.

### 02-light-theme.png
Light theme variant.
