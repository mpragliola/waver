# Cancel Button

## Problem

Once a waveform is loaded (via Load File or Record), there's no built-in way
for the end user to discard it and return to the empty-button state without
host-app code calling `reset()` itself. Embedders that want a self-service
"start over" affordance have to build their own UI for it.

## Goals

Add a small built-in "Cancel" (X) control that appears once audio is loaded,
with a confirmation step before it discards anything.

## Non-Goals

- No undo after confirming — same irreversibility as calling `reset()` directly.
- Not shown during active recording (Stop already serves that role there).
- No new event type — reuses the existing `waver:reset` event.

## API

New field on `WaverOptions` in `src/core/types.ts`, following the existing
`loadButton`/`recordButton` pattern:

```ts
/** State of the built-in "Cancel" (X) button shown top-right once audio is loaded. Confirms before discarding via reset(). */
cancelButton: ControlState;
```

Default: `"enabled"`, added to `DEFAULT_OPTIONS`.

No new events. No new public methods. No wrapper prop needed for React (it
already spreads `Partial<WaverOptions>` through `WaverProps`); Vue needs one
new prop line (see Wrappers).

## Behavior

### Visibility

- Cancel button element (`cancelButtonEl`) is shown when `hasAudio()` is true
  **and** `recordingState !== "recording"` — i.e. the mirror-opposite
  condition of the existing `showButtons` (Load/Record) logic. It never
  overlaps with Load/Record or with the recording bar.
- Hidden when `this.opts.cancelButton === "hidden"`; `disabled` attribute set
  when `"disabled"`.
- Computed in `updateOverlay()` alongside the existing Load/Record/recording-bar
  visibility logic.

### Styling & placement

- Positioned absolutely at the top-right corner of `.waver-container`
  (`position: absolute; top: 8px; right: 8px; z-index: 6` — above the empty
  overlay/recording bar's `z-index: 5`, though in practice they're mutually
  exclusive with Cancel's visibility).
- Simple X glyph (new SVG icon in `src/core/icons.ts`, stroke = currentColor,
  matching the existing 16x16-viewBox icon style).
- Transparent background, circular icon-only button: reuses the shape from
  the `.waver-action-btn--icon-only` class introduced for `hideButtonLabels`
  (equal padding, `border-radius: 50%`, fixed width/height) but as its own
  class (`.waver-cancel-btn`) since it's not a labeled action button and has
  no `<span>`.
- Semi-transparent at rest (`opacity: 0.5`), transitions to `opacity: 1` plus
  a faint circular hover background (`rgba(127, 127, 127, 0.15)`) on hover,
  and `transform: scale(0.96)` on active press — consistent with
  `.waver-action-btn`'s existing hover/active treatment.
- Static `aria-label="Cancel"` set at construction (icon-only, no visible text).

### Confirmation modal

- Clicking Cancel opens a centered confirmation overlay
  (`.waver-confirm-overlay`), absolutely positioned over the whole
  `.waver-container` (same layering approach as `.waver-empty-overlay` /
  `.waver-recording-bar`), with a dimmed backdrop (e.g.
  `background: rgba(0, 0, 0, 0.5)`) and a centered card containing:
  - Message text: `"Clear waveform?"`
  - Two buttons: **Keep** (dismiss, no-op) and **Clear** (confirm, destructive
    — styled red like `.waver-action-btn--record`).
- Dismissing (Keep button, Escape key, or click on the backdrop outside the
  card) closes the overlay with no state change.
- Confirming (Clear button) calls `this.reset()` directly — no new method,
  no new event. `reset()` already stops any in-progress recording, clears
  samples/selection/zoom, re-shows Load/Record, and emits `waver:reset`.
- Accessibility: the modal card gets `role="dialog"` and `aria-modal="true"`.
  On open, focus moves to the Clear or Keep button (Keep, as the non-destructive
  default); Escape is bound while the modal is open and closes it the same as
  clicking Keep. Since the Cancel button itself disappears after a successful
  Clear (audio is gone), no explicit focus-return handling is needed for that
  path; for a Keep/Escape/backdrop dismissal, focus returns to the Cancel
  button.
- The overlay is a plain `<div>` toggled via `style.display`, matching the
  existing `emptyOverlay`/`recordingBar` approach — not a native `<dialog>`
  element, for consistency with the rest of the component's DOM structure.

## Wrappers

- `src/react/Waver.tsx`: no changes needed — `WaverProps extends
  Partial<WaverOptions>` already forwards any new option, including
  `cancelButton`, via the existing `...options` spread into `configure()`.
- `src/vue/Waver.ts`: add `cancelButton: { type: String as PropType<ControlState>, default: undefined }`
  and forward it into `opts` when defined, same pattern as `loadButton`/`recordButton`.

## Docs

- Add `cancelButton` to the options table in `README.md`, alongside
  `loadButton`/`recordButton`/`hideButtonLabels`.

## Testing

- Unit/DOM test: with audio loaded and not recording, Cancel button is
  visible; hidden while `recordingState === "recording"`; hidden entirely
  when `cancelButton: "hidden"`; `disabled` attribute set when `"disabled"`.
- Clicking Cancel opens the confirm overlay; overlay is not shown initially.
- Clicking Keep, pressing Escape, and clicking the backdrop all close the
  overlay without changing `hasAudio()`/samples.
- Clicking Clear calls `reset()` behavior: `hasAudio()` becomes false,
  Load/Record buttons reappear, `waver:reset` event fires, confirm overlay
  closes.
- Verify `aria-label="Cancel"` is present on the button.
- Verify default (`cancelButton: "enabled"`, unset by embedder) shows the
  button once audio is loaded — no visual regression for embedders is
  possible here since this is new UI, but confirm it doesn't appear before
  any audio is loaded.
