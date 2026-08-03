# hideButtonLabels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reactive `hideButtonLabels: boolean` option that hides the text labels on the built-in Load File / Record buttons, leaving only their icons.

**Architecture:** Follows the exact existing pattern used by `loadButton`/`recordButton`: a new field on `WaverOptions`, applied in `WaverElement.updateOverlay()` by toggling a CSS class, exposed through the React (automatic, spread props) and Vue (explicit prop) wrappers, documented in the README.

**Tech Stack:** TypeScript, native Custom Elements (`src/waver-element.ts`), Vitest + jsdom for unit tests, Vue 3 wrapper with `@vue/test-utils`.

## Global Constraints

- Default value: `false` (must exactly preserve current rendered output when unset).
- Scope: only `loadButtonEl` / `recordButtonEl`. The Stop button in the recording bar is untouched.
- Single shared boolean — no per-button granularity.
- Both buttons must retain a static `aria-label` (`"Load File"` / `"Record"`) regardless of `hideButtonLabels` value, so screen readers always have a name.
- Spec: `docs/superpowers/specs/2026-08-03-button-label-visibility-design.md`.

---

### Task 1: Core option — type, default, CSS, and `updateOverlay()` wiring

**Files:**
- Modify: `src/core/types.ts` (add `hideButtonLabels` field to `WaverOptions`)
- Modify: `src/waver-element.ts` (`DEFAULT_OPTIONS`, constructor button setup, CSS, `updateOverlay()`)
- Test: `src/waver-element.test.ts`

**Interfaces:**
- Consumes: existing `WaverOptions` interface (`src/core/types.ts:58`), existing `updateOverlay()` method and `this.opts` field on `WaverElement` (`src/waver-element.ts`).
- Produces: `WaverOptions.hideButtonLabels: boolean`. CSS class `waver-action-btn--icon-only` toggled on `loadButtonEl` / `recordButtonEl`. Both buttons get `aria-label` set in the constructor.

- [ ] **Step 1: Write the failing tests**

Add this `describe` block to `src/waver-element.test.ts`, near the existing `"configure() — loadButton / recordButton ControlState"` block:

```ts
describe("configure() — hideButtonLabels", () => {
  it("defaults to visible labels (span present, no icon-only class)", () => {
    const el = mount();
    const shadow = el.shadowRoot!;
    const loadBtn = shadow.querySelector(".waver-action-btn:not(.waver-action-btn--record)") as HTMLButtonElement;
    const recordBtn = shadow.querySelector(".waver-action-btn--record") as HTMLButtonElement;
    expect(loadBtn.querySelector("span")).not.toBeNull();
    expect(recordBtn.querySelector("span")).not.toBeNull();
    expect(loadBtn.classList.contains("waver-action-btn--icon-only")).toBe(false);
    expect(recordBtn.classList.contains("waver-action-btn--icon-only")).toBe(false);
  });

  it("adds the icon-only class to both buttons when set to true", () => {
    const el = mount();
    el.configure({ hideButtonLabels: true });
    const shadow = el.shadowRoot!;
    const loadBtn = shadow.querySelector(".waver-action-btn:not(.waver-action-btn--record)") as HTMLButtonElement;
    const recordBtn = shadow.querySelector(".waver-action-btn--record") as HTMLButtonElement;
    expect(loadBtn.classList.contains("waver-action-btn--icon-only")).toBe(true);
    expect(recordBtn.classList.contains("waver-action-btn--icon-only")).toBe(true);
  });

  it("removes the icon-only class again when set back to false", () => {
    const el = mount();
    el.configure({ hideButtonLabels: true });
    el.configure({ hideButtonLabels: false });
    const shadow = el.shadowRoot!;
    const loadBtn = shadow.querySelector(".waver-action-btn:not(.waver-action-btn--record)") as HTMLButtonElement;
    expect(loadBtn.classList.contains("waver-action-btn--icon-only")).toBe(false);
  });

  it("keeps a static aria-label on both buttons regardless of hideButtonLabels", () => {
    const el = mount();
    const shadow = el.shadowRoot!;
    const loadBtn = shadow.querySelector(".waver-action-btn:not(.waver-action-btn--record)") as HTMLButtonElement;
    const recordBtn = shadow.querySelector(".waver-action-btn--record") as HTMLButtonElement;
    expect(loadBtn.getAttribute("aria-label")).toBe("Load File");
    expect(recordBtn.getAttribute("aria-label")).toBe("Record");

    el.configure({ hideButtonLabels: true });
    expect(loadBtn.getAttribute("aria-label")).toBe("Load File");
    expect(recordBtn.getAttribute("aria-label")).toBe("Record");
  });

  it("does not affect loadButton/recordButton enabled/disabled/hidden state", () => {
    const el = mount();
    el.configure({ hideButtonLabels: true, recordButton: "disabled" });
    const shadow = el.shadowRoot!;
    const recordBtn = shadow.querySelector(".waver-action-btn--record") as HTMLButtonElement;
    expect(recordBtn.disabled).toBe(true);
    expect(recordBtn.classList.contains("waver-action-btn--icon-only")).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/waver-element.test.ts -t "hideButtonLabels"`
Expected: FAIL — `hideButtonLabels` is not a valid option (TS error) and/or `aria-label` assertions fail (attribute doesn't exist yet) and/or `waver-action-btn--icon-only` never gets applied.

- [ ] **Step 3: Add the type field**

In `src/core/types.ts`, inside the `WaverOptions` interface, directly below the `recordButton` field (after line 76's closing `;`):

```ts
  /** When true, the built-in "Load File" / "Record" buttons hide their text label, showing only the icon. */
  hideButtonLabels: boolean;
```

- [ ] **Step 4: Add the default**

In `src/waver-element.ts`, in `DEFAULT_OPTIONS` (around line 46-47), add after `recordButton: "enabled",`:

```ts
  hideButtonLabels: false,
```

- [ ] **Step 5: Add static `aria-label`s to the buttons**

In `src/waver-element.ts`, in the constructor, update the button setup (around lines 170-177):

```ts
    this.loadButtonEl = document.createElement("button");
    this.loadButtonEl.type = "button";
    this.loadButtonEl.className = "waver-action-btn";
    this.loadButtonEl.setAttribute("aria-label", "Load File");
    this.loadButtonEl.innerHTML = `${uploadIcon}<span>Load File</span>`;
    this.recordButtonEl = document.createElement("button");
    this.recordButtonEl.type = "button";
    this.recordButtonEl.className = "waver-action-btn waver-action-btn--record";
    this.recordButtonEl.setAttribute("aria-label", "Record");
    this.recordButtonEl.innerHTML = `${micIcon}<span>Record</span>`;
```

- [ ] **Step 6: Add the CSS class**

In `src/waver-element.ts`, in the stylesheet template string, directly below the existing `.waver-action-btn:disabled` rule (around line 983):

```css
    .waver-action-btn--icon-only { padding: 8px; border-radius: 50%; }
    .waver-action-btn--icon-only span { display: none; }
```

- [ ] **Step 7: Apply the class in `updateOverlay()`**

In `src/waver-element.ts`, in `updateOverlay()` (around lines 469-474), add after the existing `disabled` assignments:

```ts
    this.loadButtonEl.classList.toggle("waver-action-btn--icon-only", this.opts.hideButtonLabels);
    this.recordButtonEl.classList.toggle("waver-action-btn--icon-only", this.opts.hideButtonLabels);
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run src/waver-element.test.ts -t "hideButtonLabels"`
Expected: PASS (all 5 new tests)

- [ ] **Step 9: Run the full test file to check for regressions**

Run: `npx vitest run src/waver-element.test.ts`
Expected: PASS (all tests, including the pre-existing `loadButton / recordButton ControlState` block)

- [ ] **Step 10: Commit**

```bash
git add src/core/types.ts src/waver-element.ts src/waver-element.test.ts
git commit -m "feat: add hideButtonLabels option to suppress Load File/Record button text"
```

---

### Task 2: Vue wrapper prop

**Files:**
- Modify: `src/vue/Waver.ts`
- Test: `src/vue/Waver.test.ts`

**Interfaces:**
- Consumes: `WaverOptions.hideButtonLabels: boolean` (Task 1). Existing `collectOptions()` function and `props`/`watch` pattern in `src/vue/Waver.ts`.
- Produces: `hideButtonLabels` Vue prop, forwarded into `configure()` exactly like `loadButton`/`recordButton`.

- [ ] **Step 1: Write the failing tests**

Add to `src/vue/Waver.test.ts`, near the existing `loadButton`/`recordButton` prop tests:

```ts
it("configures hideButtonLabels from props on mount", async () => {
  const wrapper = mount(Waver, { props: { hideButtonLabels: true } });
  await wrapper.vm.$nextTick();
  const el = wrapper.find("wave-r").element as WaverElement;
  const loadBtn = el.shadowRoot!.querySelector(".waver-action-btn:not(.waver-action-btn--record)") as HTMLButtonElement;
  expect(loadBtn.classList.contains("waver-action-btn--icon-only")).toBe(true);
});

it("re-configures hideButtonLabels reactively when the prop changes", async () => {
  const wrapper = mount(Waver, { props: { hideButtonLabels: false } });
  const el = wrapper.find("wave-r").element as WaverElement;
  const configureSpy = vi.spyOn(el, "configure");

  await wrapper.setProps({ hideButtonLabels: true });
  await wrapper.vm.$nextTick();

  expect(configureSpy).toHaveBeenCalledWith(expect.objectContaining({ hideButtonLabels: true }));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/vue/Waver.test.ts -t "hideButtonLabels"`
Expected: FAIL — `hideButtonLabels` prop doesn't exist yet, so it's never passed to `configure()`.

- [ ] **Step 3: Add the prop declaration**

In `src/vue/Waver.ts`, in the `props` object, directly below `recordButton` (line 29):

```ts
    hideButtonLabels: { type: Boolean as PropType<boolean>, default: undefined },
```

- [ ] **Step 4: Forward it in `collectOptions()`**

In `src/vue/Waver.ts`, in `collectOptions()`, directly below the `recordButton` line (line 102):

```ts
      if (props.hideButtonLabels !== undefined) opts.hideButtonLabels = props.hideButtonLabels;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/vue/Waver.test.ts -t "hideButtonLabels"`
Expected: PASS

- [ ] **Step 6: Run the full Vue test file to check for regressions**

Run: `npx vitest run src/vue/Waver.test.ts`
Expected: PASS (all tests)

- [ ] **Step 7: Commit**

```bash
git add src/vue/Waver.ts src/vue/Waver.test.ts
git commit -m "feat: expose hideButtonLabels prop in Vue wrapper"
```

---

### Task 3: React wrapper verification + README docs

React's `WaverProps extends Partial<WaverOptions>` and spreads all unrecognized props straight into `configure()` (`src/react/Waver.tsx:34,75,110`), so `hideButtonLabels` is automatically supported once Task 1 lands — no code change needed there. This task adds a regression test proving that, plus README documentation.

**Files:**
- Test: `src/react/Waver.test.tsx` (confirm this file exists; if the extension differs, e.g. `.test.tsx` vs colocated elsewhere, use the existing convention)
- Modify: `README.md`

**Interfaces:**
- Consumes: `WaverOptions.hideButtonLabels` (Task 1), existing React `Waver` component's automatic options spread.
- Produces: no new production code; a passing test confirming pass-through, and updated docs.

- [ ] **Step 1: Locate the existing React test file's pattern for an existing boolean/enum option**

Run: `grep -n "loadButton\|recordButton\|showRuler" src/react/Waver.test.tsx`

Use whatever pattern that search reveals (prop name passed to `render`/mount helper, then assert on the resulting DOM inside `shadowRoot`) to write the new test in the same style. If no such option is currently tested in this file, model the new test on the Vue test added in Task 2, adapted to this file's React Testing Library setup (render, find the custom element, read `.shadowRoot`).

- [ ] **Step 2: Write the failing test**

Add a test asserting that passing `hideButtonLabels` as a prop results in the `waver-action-btn--icon-only` class being present on both buttons' shadow DOM, following the exact render/query helpers already used in this file (do not introduce a new rendering utility).

- [ ] **Step 3: Run the test to verify it fails or passes**

Run: `npx vitest run src/react/Waver.test.tsx -t "hideButtonLabels"`
Expected: Likely PASSES immediately since props are spread automatically — this test is a regression guard, not a feature implementation. If it fails, that indicates the spread-props assumption above is wrong; stop and re-examine `src/react/Waver.tsx` before proceeding (do not add special-case code without understanding why the generic spread didn't cover it).

- [ ] **Step 4: Update README options table**

In `README.md`, in the options table (around line 138-140), add a new row directly below the `recordButton` row:

```markdown
| `hideButtonLabels` | `boolean` | `false` | Hide the text label on the built-in "Load File" / "Record" buttons, showing only the icon. Both buttons keep a static `aria-label` for accessibility regardless of this setting. |
```

- [ ] **Step 5: Update the Vue prop list note**

In `README.md`, in the "Note: the Vue wrapper exposes every `WaverOptions` prop directly" sentence (around line 115-120), add `hideButtonLabels` to the parenthetical list, e.g. directly after `recordButton`:

```
`rulerHeight`, `loadButton`, `recordButton`, `hideButtonLabels`, `channelIndex`, `viewMode`, `recordViewMode`,
```

- [ ] **Step 6: Run the full test suite to check for regressions**

Run: `npx vitest run`
Expected: PASS (all tests across the project)

- [ ] **Step 7: Commit**

```bash
git add src/react/Waver.test.tsx README.md
git commit -m "test: verify hideButtonLabels passthrough in React wrapper, document option"
```
