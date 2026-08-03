# Load/Record Button Label Visibility

## Problem

The built-in "Load File" and "Record" buttons (empty-state overlay) always render
an icon plus a text label. There is no way for an embedder to switch to a
compact, icon-only presentation — useful for narrow layouts or a denser UI.

## Goals

Add one reactive, configurable option that hides the text labels on both
buttons, leaving only their icons.

## Non-Goals

- The Stop button in the recording bar is untouched by this option.
- No per-button granularity — both buttons toggle together.
- No icon changes, no new icons.

## API

New field on `WaverOptions` in `src/core/types.ts`:

```ts
/** When true, the built-in "Load File" / "Record" buttons hide their text label, showing only the icon. */
hideButtonLabels: boolean;
```

Default: `false` (current behavior, added to `DEFAULT_OPTIONS`).

## Behavior

- Reactive: settable at init and via `configure({ hideButtonLabels: true })` at
  any time, same mechanism as `loadButton`/`recordButton`.
- Applied in `updateOverlay()` (`src/waver-element.ts`): toggles a
  `waver-action-btn--icon-only` class on both `loadButtonEl` and
  `recordButtonEl` based on `this.opts.hideButtonLabels`.
- CSS: `.waver-action-btn--icon-only` collapses padding to a circular
  icon-button shape (equal padding, `border-radius: 50%`, fixed width/height)
  and hides the `<span>` label (`display: none` on the span, or simply let the
  class control padding while the span is hidden via a descendant selector).
- Accessibility: since the visible text can disappear, both buttons get a
  static `aria-label` set once at construction (`"Load File"` / `"Record"`),
  independent of `hideButtonLabels` state, so screen readers always have a
  name.

## Wrappers

- `src/react/Waver.tsx`: add optional `hideButtonLabels?: boolean` prop,
  passed through like `loadButton`/`recordButton`.
- `src/vue/Waver.ts`: add `hideButtonLabels` prop
  (`{ type: Boolean, default: undefined }`), forwarded into `opts` when
  defined, same pattern as the existing two.

## Docs

- Add `hideButtonLabels` to the options table in `README.md` and to the
  option-name list mentioned near `rulerHeight`/`loadButton`/`recordButton`.

## Testing

- Unit/DOM test: `configure({ hideButtonLabels: true })` removes label text
  (or hides span) on both buttons and does not affect `loadButton`/
  `recordButton` enabled/disabled/hidden state.
- Verify `aria-label` present regardless of `hideButtonLabels` value.
- Verify default (`false`) preserves existing rendered output exactly (no
  visual regression for embedders who don't set the option).
