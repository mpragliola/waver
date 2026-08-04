# Screenshot Plan — Waver

**Output dir:** `/home/marco/dev/waver/docs/screenshots`
**App type:** web (Vite demo app, `<wave-r>` custom element)
**Capture harness:** standalone Playwright script (`scripts/take-screenshots.ts`), run via `npx playwright test` against `webServer` on port 4173 (reusing `playwright.config.ts` conventions), chromium only (fake mic device support).

---

## empty-state/

### 01-full-page-default
- **What it shows:** Whole demo page on first load — Load File / Record buttons, controls row, status line. Orientation shot.
- **Capture:** full page
- **Filename:** `empty-state/01-full-page-default.png`
- **Setup:** `page.goto('/')`, wait for mic permission grant to settle (fake device), wait for `.waver-action-btn--record` visible.

### 02-buttons-with-labels
- **What it shows:** Close-up of the empty overlay buttons with text labels (default `hideButtonLabels: false`).
- **Capture:** element crop `wave-r`
- **Filename:** `empty-state/02-buttons-with-labels.png`
- **Setup:** fresh page, wait for empty overlay.

### 03-buttons-icon-only
- **What it shows:** Same empty overlay after `hideButtonLabels: true` — icon-only buttons.
- **Capture:** element crop `wave-r`
- **Filename:** `empty-state/03-buttons-icon-only.png`
- **Setup:** click `#toggleButtonLabels` once, wait for `.waver-action-btn--icon-only` class.

---

## loading/

### 01-waveform-loaded-default
- **What it shows:** `tone.wav` loaded, default view — ruler + waveform + zero line + minimap.
- **Capture:** element crop `wave-r`
- **Filename:** `loading/01-waveform-loaded-default.png`
- **Setup:** `waver-file-input.setInputFiles(tone.wav)`, wait for status text empty + record button hidden.

### 02-load-error
- **What it shows:** Status line showing "Failed to decode audio…" after loading `corrupt.wav`.
- **Capture:** full page (status line lives outside `wave-r`) — actually crop `#app` region (status + waver) to keep it tight.
- **Filename:** `loading/02-load-error.png`
- **Setup:** fresh page, `setInputFiles(corrupt.wav)`, wait for `#status` to contain "Failed to decode audio".

---

## selection/

### 01-click-drag-selection
- **What it shows:** A click-drag selection on the waveform — overlay region + implied resize handles.
- **Capture:** element crop `wave-r`
- **Filename:** `selection/01-click-drag-selection.png`
- **Setup:** load tone.wav, mouse.move/down/move/up across waveform 20%→60%, wait for `waver:selectionchanged` captured event, then screenshot.

---

## playback/

### 01-playback-in-progress
- **What it shows:** Cursor mid-waveform while playing (Play button toggled to "playing" — static frame).
- **Capture:** element crop `wave-r`
- **Filename:** `playback/01-playback-in-progress.png`
- **Setup:** load tone.wav, click `#play`, wait briefly (~400ms) for playhead to move off 0, screenshot, then click `#play` again to stop (cleanup before next capture).

---

## zoom/

### 01-zoomed-in-samples
- **What it shows:** Deeply zoomed waveform showing individual sample steps.
- **Capture:** element crop `wave-r`
- **Filename:** `zoom/01-zoomed-in-samples.png`
- **Setup:** load tone.wav, `waver.setZoom({ samplesPerPixel: 1 }, false)` via page.evaluate (direct API call — cleanest, no UI gesture needed for a precise deterministic zoom level), wait a frame, screenshot.

### 02-zoomed-to-full
- **What it shows:** Same buffer, zoomed to fit entirely (contrast with 01).
- **Capture:** element crop `wave-r`
- **Filename:** `zoom/02-zoomed-to-full.png`
- **Setup:** click `#zoomFull`, screenshot.

---

## view-modes/

### 01-spectrogram-view
- **What it shows:** Spectrogram view mode replacing the waveform.
- **Capture:** element crop `wave-r`
- **Filename:** `view-modes/01-spectrogram-view.png`
- **Setup:** load tone.wav, click `#viewMode`, wait for captured `waver:spectrogramready` event (poll), screenshot.

---

## minimap/

### 01-minimap-closeup
- **What it shows:** Minimap strip with viewport overlay rectangle, after zooming in (so the overlay rect is a visibly partial width, not full-width).
- **Capture:** element crop `.waver-minimap` (locator inside `wave-r`)
- **Filename:** `minimap/01-minimap-closeup.png`
- **Setup:** load tone.wav, zoom in via `setZoom({ samplesPerPixel: 20 })`, crop just the minimap canvas.

---

## recording/

### 01-recording-overlay-scroll
- **What it shows:** Live recording UI — pulsing dot, elapsed time, Stop button — in default `scroll` recordViewMode, using the real fake mic device stream.
- **Capture:** element crop `wave-r`
- **Filename:** `recording/01-recording-overlay-scroll.png`
- **Setup:** fresh page, click `.waver-action-btn--record`, wait for `.waver-recording-bar` visible + `.waver-recording-time` visible, wait ~1500ms for elapsed time + waveform to accumulate, screenshot, then click Stop to end capture cleanly (avoid leaking an open mic stream into later steps in the same page).
- **Note:** `zoom-out` and `flat` recordViewModes will be described in prose only (switching `#recordViewMode` mid-recording live for all 3 adds flakiness/time for marginal documentation value per task instructions — scroll is enough to prove the mechanism works).

---

## cancel/

### 01-cancel-confirm-overlay
- **What it shows:** The confirmation dialog (Keep / Clear) shown after clicking the cancel (X) button with audio loaded.
- **Capture:** element crop `wave-r`
- **Filename:** `cancel/01-cancel-confirm-overlay.png`
- **Setup:** load tone.wav, click `.waver-cancel-btn`, wait for `.waver-confirm-overlay` visible, screenshot (do NOT confirm — leave dialog open for the shot, then click "keep" to dismiss cleanly afterward).

---

## ruler/

### 01-ruler-time-format
- **What it shows:** Ruler strip in default `"time"` format (mm:ss labels).
- **Capture:** element crop `.waver-ruler`
- **Filename:** `ruler/01-ruler-time-format.png`
- **Setup:** load tone.wav (default `rulerTimeFormat: "time"`), crop ruler canvas.

### 02-ruler-samples-format
- **What it shows:** Ruler strip switched to `"samples"` format (raw sample index labels).
- **Capture:** element crop `.waver-ruler`
- **Filename:** `ruler/02-ruler-samples-format.png`
- **Setup:** `waver.configure({ rulerTimeFormat: "samples" })` via page.evaluate, crop ruler canvas.

---

## theming/

### 01-dark-theme (default)
- **What it shows:** Default dark theme (already the demo's default — no override needed).
- **Capture:** element crop `wave-r`
- **Filename:** `theming/01-dark-theme.png`
- **Setup:** load tone.wav, default theme, screenshot.

### 02-light-theme
- **What it shows:** Same buffer with `configure({ theme: lightTheme })` applied.
- **Capture:** element crop `wave-r`
- **Filename:** `theming/02-light-theme.png`
- **Setup:** `page.evaluate` importing/using the already-bundled `lightTheme` export is awkward from a page context without a module import; instead call `waver.configure({ theme: { backgroundColor: "#ffffff", waveformColor: "#2b6cb0", cursorColor: "#e53e3e", rulerColor: "#4a5568", zeroLineColor: "#a0aec0" } })` — reconstructing `lightTheme`'s known values inline (read from `src/core/theme.ts` before writing the script) is simplest since the demo doesn't expose an import hook for it. Reset to dark theme afterward if any later shot depends on default.

---

## Summary

- ~17 screenshots across 10 sections.
- No `⚠️ requires approval` items — everything reachable via normal user interaction, direct public API calls (`configure`, `setZoom`, `setViewMode`), or fixture files already in the repo. All within already-granted scope.
- Script clears `docs/screenshots/` (except this PLAN.md) at the start of each run.
