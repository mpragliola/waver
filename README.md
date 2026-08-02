# Waver

Fast, dependency-free waveform display and interaction component. Core is a framework-agnostic
custom element (`<wave-r>`), with thin wrappers for React and Vue that just forward props/events —
no logic duplication.

- Zoom (100% down to single samples), Ctrl+wheel to scroll, Ctrl+Shift+wheel to scroll faster
- Click-drag to create a selection; drag edges to resize, drag body to move, double-click to clear
- Dedicated seek ruler strip for repositioning the cursor without touching selection
- Minimap with viewport overlay; click/drag to pan
- Playback via the native Web Audio API, with an optional external-node hook for inserting your own
  effects chain (EQ, convolution, etc.)
- Themeable (colors, font, optional Google Font loading, rounded corners)

## Install

```bash
npm install waver
```

React and Vue are optional peer dependencies — only needed if you use `waver/react` or `waver/vue`.

## Vanilla usage

```ts
import { defineWaverElement, type WaverElement } from "waver";

defineWaverElement(); // registers <wave-r> (no-op if already registered)

const waver = document.querySelector("wave-r") as WaverElement;
waver.configure({ height: 260, showZeroLine: true, showMinimap: true });

const audioContext = new AudioContext();
const arrayBuffer = await file.arrayBuffer();
const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
waver.loadAudioBuffer(audioBuffer, audioContext);

waver.addEventListener("waver:cursorchange", (e) => {
  console.log("cursor", (e as CustomEvent).detail.positionSample);
});
```

```html
<wave-r></wave-r>
```

`defineWaverElement(tagName?)` accepts a custom tag name (default `"wave-r"`) if you need to avoid
collisions.

## React usage

```tsx
import { useRef } from "react";
import { Waver, type WaverHandle } from "waver/react";

function App() {
  const waverRef = useRef<WaverHandle>(null);

  return (
    <Waver
      ref={waverRef}
      height={260}
      showZeroLine
      showMinimap
      onCursorChange={(pos) => console.log("cursor", pos)}
      onSelectionChange={(sel) => console.log("selection", sel)}
    />
  );
}

// later, e.g. after decoding a file:
waverRef.current?.loadAudioBuffer(audioBuffer, audioContext);
waverRef.current?.play();
```

All `WaverOptions` (see below) are accepted as props, plus `className`, `style`, and `on*` event
callbacks. Imperative methods are exposed via the ref (`WaverHandle`).

## Vue usage

```vue
<template>
  <Waver
    ref="waverRef"
    :height="260"
    show-zero-line
    show-minimap
    @cursorchange="onCursorChange"
    @selectionchange="onSelectionChange"
  />
</template>

<script setup lang="ts">
import { ref } from "vue";
import { Waver } from "waver/vue";

const waverRef = ref();

function onCursorChange(pos: number) {
  console.log("cursor", pos);
}
function onSelectionChange(sel: { startSample: number; endSample: number } | null) {
  console.log("selection", sel);
}

// later:
waverRef.value?.loadAudioBuffer(audioBuffer, audioContext);
waverRef.value?.play();
</script>
```

Note: the Vue wrapper exposes every `WaverOptions` prop directly (`height`, `minimapHeightRatio`,
`theme`, `showZeroLine`, `roundedCorners`, `showMinimap`, `showRuler`, `rulerTimeFormat`,
`rulerHeight`, `viewMode`, `spectrogramFftSize`, `spectrogramHop`, `spectrogramFreqBins`) — or set
any of them imperatively via `element.value?.configure({ showRuler: false })`.

## Configurable options (`WaverOptions`)

Pass as a partial object to `configure()` (vanilla), as props (React/Vue), or via `defineWaverElement`
defaults.

| Option | Type | Default | Description |
|---|---|---|---|
| `height` | `number` | `200` | Total component height in px (ruler + waveform + minimap). |
| `minimapHeightRatio` | `number` | `0.2` | Fraction of the (post-ruler) height given to the minimap. |
| `theme` | `Partial<WaverTheme>` | `{}` | Theme overrides, merged onto the base dark theme (see below). |
| `showZeroLine` | `boolean` | `false` | Draw a faint horizontal zero line over the waveform. |
| `roundedCorners` | `boolean` | `true` | Round the component's outer corners. |
| `showMinimap` | `boolean` | `true` | Show/hide the minimap strip. |
| `showRuler` | `boolean` | `true` | Show/hide the seek ruler strip above the waveform. |
| `rulerTimeFormat` | `"time" \| "samples"` | `"time"` | Ruler labels as hh:mm:ss/mm:ss/ss or raw sample index. |
| `rulerHeight` | `number` | `20` | Height (px) of the ruler strip. |
| `viewMode` | `"waveform" \| "spectrogram"` | `"waveform"` | Main view content. The minimap always stays on waveform regardless of this. |
| `spectrogramFftSize` | `number` | `2048` | STFT window size in samples (power of two). Larger = finer frequency resolution, coarser time resolution. |
| `spectrogramHop` | `number` | `512` | STFT hop size in samples. Smaller = finer time resolution, more compute. |
| `spectrogramFreqBins` | `number` | `128` | Number of log-scaled frequency rows the spectrogram is bucketed down to for display. |

### Spectrogram view

Switch the main view between waveform and spectrogram with `setViewMode()` / `configure({ viewMode })`.
The minimap is unaffected and always shows the waveform. The spectrogram analysis (windowed FFT
across the whole loaded buffer) runs once per buffer/resolution in a background Web Worker, lazily
kicked off the first time you switch into spectrogram view — switching zoom/pan afterwards reuses
the cached analysis instead of recomputing it. Listen for `waver:spectrogramready` to know when a
newly kicked-off analysis has resolved (e.g. to hide a loading indicator).

### Theme (`WaverTheme`)

| Field | Type | Description |
|---|---|---|
| `waveformColor` | `string` | Waveform fill color. |
| `backgroundColor` | `string` | Component background. |
| `cursorColor` | `string` | Playhead color. |
| `selectionColor` | `string` | Selection overlay color (auto-derived from `waveformColor` if you only override that). |
| `minimapOverlayColor` | `string` | Minimap viewport overlay color. |
| `zeroLineColor` | `string` | Zero line color (when `showZeroLine` is on). |
| `rulerColor` | `string` | Ruler tick/label color. |
| `fontFamily` | `string` | CSS font-family for ruler/labels. |
| `googleFont` | `{ family: string; weights?: number[] }` | Optional — injects a Google Fonts stylesheet (deduped across instances). |
| `roundedCorners` | `boolean` | Theme-level corner rounding (see also the top-level `roundedCorners` option). |
| `borderRadius` | `number` | Corner radius in px when rounded. |
| `spectrogramColors` | `string[]` | Gradient stops (hex or rgb(a)), low intensity -> high intensity, used to colormap the spectrogram view. |

Built-in themes: `lightTheme`, `darkTheme` (exported from `waver`). Helpers: `resolveTheme(base, overrides)`,
`deriveSelectionColor(waveformColor, alpha?)`.

## Public API (element / ref / expose)

| Method | Description |
|---|---|
| `configure(options: Partial<WaverOptions>)` | Merge and apply new options. |
| `loadSamples(samples: Float32Array, sampleRate: number)` | Load raw mono samples (no playback engine). |
| `loadAudioBuffer(buffer: AudioBuffer, context: AudioContext)` | Load audio + set up playback via `AudioEngine`. |
| `connectExternalAudioNode(node: AudioNode \| null)` | Splice a custom `AudioNode` into the playback signal chain. |
| `play()` / `stop()` / `togglePlayback()` | Playback controls (host wires its own buttons/shortcuts). |
| `setZoom(zoom: Partial<ZoomState>)` | Set `{ samplesPerPixel, offsetSample }` (clamped to valid range). |
| `zoomToFull()` | Reset zoom to fit the whole waveform. |
| `setSelection(selection: SelectionRange \| null)` | Set/clear the selection (also used as the loop range). |
| `setCursorPosition(sample: number)` | Move the playhead without seeking playback. |
| `getSelection()` / `getCursorPosition()` / `getZoom()` / `getSampleRate()` | Getters. |
| `setViewMode(mode: "waveform" \| "spectrogram")` | Switch the main view (minimap stays waveform). |
| `getViewMode()` | Current main view mode. |

## Events

| Event | Detail | Fires on |
|---|---|---|
| `waver:cursorchange` | `{ positionSample: number }` | Cursor moved (click, ruler drag, or continuously during playback). |
| `waver:selectionchange` | `{ selection: SelectionRange \| null }` | Selection created, resized, moved, or cleared. |
| `waver:zoomchange` | `{ zoom: ZoomState }` | Zoom or pan changed (wheel, minimap drag). |
| `waver:play` | `{ positionSample: number }` | Playback started. |
| `waver:stop` | `{ positionSample: number }` | Playback stopped. |
| `waver:loop` | `{ positionSample: number }` | Playback looped back to the selection start. |
| `waver:viewmodechange` | `{ viewMode: "waveform" \| "spectrogram" }` | Main view mode switched. |
| `waver:spectrogramready` | `{}` | The background spectrogram analysis for the current buffer/resolution resolved. |

React: `onCursorChange` / `onSelectionChange` / `onZoomChange` / `onPlay` / `onStop` / `onLoop` /
`onViewModeChange` / `onSpectrogramReady` props.
Vue: `@cursorchange` / `@selectionchange` / `@zoomchange` / `@play` / `@stop` / `@loop` /
`@viewmodechange` / `@spectrogramready`.

## Interaction reference

- **Waveform body**: click-drag to create a selection; drag a selection edge to resize; drag the
  selection body to move it; double-click to clear it; plain click (no drag) moves the cursor (and
  seeks playback if already playing).
- **Ruler strip**: click/drag to move the cursor and, if already playing, seek playback there —
  without touching selection state.
- **Mouse wheel**: zoom in/out, pivoting on the cursor.
- **Ctrl + wheel**: scroll (pan) the waveform.
- **Ctrl + Shift + wheel**: scroll faster.
- **Minimap**: click/drag to pan the main viewport, centered on the pointer (animated).

## Development

```bash
npm run dev         # Vite dev server (demo app)
npm run build        # tsc + vite build (dist/ — core, react, vue entry points)
npm run test          # vitest run
npm run test:watch    # vitest watch mode
npm run coverage      # vitest with coverage
npm run typecheck     # tsc --noEmit
```
