# Waver

Fast, dependency-free waveform display and interaction component. Core is a framework-agnostic
custom element (`<wave-r>`), with thin wrappers for React and Vue that just forward props/events —
no logic duplication.

## What it does

- Zoom (100% down to single samples), Ctrl+wheel to scroll, Ctrl+Shift+wheel to scroll faster
- Touch support: two-finger pinch to zoom, two-finger swipe to pan
- Click-drag to create a selection; drag edges to resize, drag body to move, double-click to clear
- Dedicated seek ruler strip for repositioning the cursor without touching selection
- Minimap with viewport overlay; click/drag to pan
- Playback via the native Web Audio API, with an optional external-node hook for inserting your own
  effects chain (EQ, convolution, etc.)
- Built-in mic recording (with waveform/spectrogram view while capturing) alongside file loading
- Spectrogram view as an alternative to the waveform, computed off the main thread
- Themeable (colors, font, optional Google Font loading, rounded corners)

## Tech stack

- **Core**: TypeScript, compiled to a zero-dependency [Custom Element](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_custom_elements) (`<wave-r>`), rendered with Canvas 2D. No runtime dependencies.
- **Audio**: native [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) for decoding/playback/recording; spectrogram FFT analysis runs off the main thread in Web Workers.
- **Framework wrappers**: thin React and Vue 3 adapters (optional peer dependencies) that forward props/events to the underlying element — no duplicated logic.
- **Build**: [Vite](https://vitejs.dev/) (library mode, ES modules only) + `tsc` for declaration files; three entry points (`waver`, `waver/react`, `waver/vue`).
- **Testing**: [Vitest](https://vitest.dev/) (unit/integration, jsdom) and [Playwright](https://playwright.dev/) (end-to-end, Chromium) against a Vite-served demo app.
- **CI**: GitHub Actions — typecheck, unit tests, build, and the Playwright e2e suite on every push/PR to `main`.

## Install

```bash
npm install waver
```

React and Vue are optional peer dependencies — only needed if you use `waver/react` or `waver/vue`.

## Quick start

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
collisions. For React and Vue prop/ref/emit reference, see the [API reference](docs/api.md#react-api).

## Documentation

This README covers install and a minimal example. For everything else:

- **[Usage manual](docs/manual.md)** — guided walkthrough of every feature (loading, recording, zoom/pan,
  selection, playback, view modes, theming, built-in buttons, error states), illustrated with
  screenshots.
- **[API reference](docs/api.md)** — full `WaverOptions`/`WaverTheme` tables, every `WaverElement`
  method, every event, and the complete React/Vue props/emits/ref surface.

## Development

```bash
npm run dev         # Vite dev server (demo app)
npm run build        # tsc + vite build (dist/ — core, react, vue entry points)
npm run test          # vitest run
npm run test:watch    # vitest watch mode
npm run coverage      # vitest with coverage
npm run typecheck     # tsc --noEmit
npm run e2e           # Playwright end-to-end suite against the demo app (chromium)
npm run e2e:ui         # Playwright UI mode
```

CI (`.github/workflows/ci.yml`) runs typecheck, unit/integration tests, the build, and the e2e
suite on every push/PR to `main`.
