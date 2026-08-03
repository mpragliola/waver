# Cancel Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a built-in Cancel (X) button that appears once audio is loaded, opening a confirmation overlay before discarding via the existing `reset()`.

**Architecture:** One new `ControlState` option (`cancelButton`), one new icon, one new button element + confirm-overlay element added to `WaverElement`'s shadow DOM, visibility driven from the existing `updateOverlay()` method. No new public methods or events — the confirm flow's "Clear" action calls the existing `reset()`.

**Tech Stack:** TypeScript custom element (Shadow DOM, no framework), Vitest + jsdom for tests, thin React/Vue wrappers.

## Global Constraints

- New option name: `cancelButton`, type `ControlState` (`"enabled" | "disabled" | "hidden"`), default `"enabled"`.
- No new events — reuse `waver:reset`.
- No new public methods on `WaverElement`.
- Cancel button visible only when `hasAudio() === true` and `recordingState !== "recording"`.
- Confirm overlay copy: message `"Clear waveform?"`, buttons labeled `"Keep"` (dismiss) and `"Clear"` (confirm, destructive/red styling).
- Dismiss paths: Keep button, Escape key, backdrop click — all three are no-ops (no state change).
- Confirm path: calls `this.reset()` directly.
- Accessibility: Cancel button gets `aria-label="Cancel"`; confirm overlay card gets `role="dialog"` and `aria-modal="true"`; on open, focus moves to the Keep button; Escape closes while open.
- React wrapper needs **no changes** (already spreads `Partial<WaverOptions>`).
- Vue wrapper needs one new prop line, following the exact pattern of `loadButton`/`recordButton`.

---

### Task 1: Add `cancelButton` option to `WaverOptions` and `DEFAULT_OPTIONS`

**Files:**
- Modify: `src/core/types.ts:70-76` (WaverOptions interface, next to `loadButton`/`recordButton`)
- Modify: `src/waver-element.ts:46-47` (DEFAULT_OPTIONS)
- Test: `src/waver-element.test.ts`

**Interfaces:**
- Produces: `WaverOptions.cancelButton: ControlState`, default `"enabled"` in `DEFAULT_OPTIONS`.

- [ ] **Step 1: Write the failing test**

Add to `src/waver-element.test.ts`, inside a new `describe` block placed right after the existing `describe("configure() — loadButton / recordButton ControlState", ...)` block (after line 102, before `describe("loadSamples / loadAudioBuffer", ...)`):

```ts
  describe("configure() — cancelButton ControlState", () => {
    it("defaults to 'enabled': cancel button hidden with no audio, visible once loaded", () => {
      const el = mount();
      const shadow = el.shadowRoot!;
      const cancelBtn = shadow.querySelector(".waver-cancel-btn") as HTMLButtonElement;
      expect(cancelBtn.style.display).toBe("none");

      el.loadSamples(new Float32Array(1000), 44100);
      expect(cancelBtn.style.display).not.toBe("none");
      expect(cancelBtn.disabled).toBe(false);
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run -t "cancelButton ControlState"`
Expected: FAIL — `.waver-cancel-btn` doesn't exist yet (`cancelBtn` is `null`, so `.style` access throws).

- [ ] **Step 3: Add the option**

In `src/core/types.ts`, right after the `recordButton` field (after line 76, before `channelIndex`):

```ts
  /** State of the built-in "Cancel" (X) button shown top-right once audio is loaded. Confirms before discarding via reset(). */
  cancelButton: ControlState;
```

In `src/waver-element.ts`, in `DEFAULT_OPTIONS` (line 46-47), add after `recordButton: "enabled",`:

```ts
  cancelButton: "enabled",
```

This step alone won't make the test pass yet — the button element doesn't exist. That lands in Task 2. Leave the test red for now and proceed; Task 2's steps will turn it green.

- [ ] **Step 4: Commit**

```bash
git add src/core/types.ts src/waver-element.ts src/waver-element.test.ts
git commit -m "feat: add cancelButton option (WaverOptions)"
```

---

### Task 2: Add the X icon and the Cancel button element

**Files:**
- Modify: `src/core/icons.ts` (add `closeIcon`)
- Modify: `src/waver-element.ts` (constructor: create `cancelButtonEl`; `updateOverlay()`: visibility logic; stylesheet: `.waver-cancel-btn`)
- Test: `src/waver-element.test.ts` (extends Task 1's test)

**Interfaces:**
- Consumes: `WaverOptions.cancelButton` (Task 1).
- Produces: `private cancelButtonEl: HTMLButtonElement` on `WaverElement`, DOM class `.waver-cancel-btn`, click handler that (for now, until Task 3) does nothing but exists and respects `disabled`.

- [ ] **Step 1: Run Task 1's test again to confirm it's still failing the same way**

Run: `npm test -- --run -t "cancelButton ControlState"`
Expected: FAIL (still no `.waver-cancel-btn` in the DOM).

- [ ] **Step 2: Add the close icon**

In `src/core/icons.ts`, append:

```ts
export const closeIcon =
  '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4L12 12"/><path d="M12 4L4 12"/></svg>';
```

- [ ] **Step 3: Import it and create the button in the constructor**

In `src/waver-element.ts`, update the icons import (line 5):

```ts
import { closeIcon, micIcon, stopIcon, uploadIcon } from "./core/icons";
```

Add a new private field near `recordButtonEl` (line 98):

```ts
  private recordButtonEl: HTMLButtonElement;
  private cancelButtonEl: HTMLButtonElement;
```

In the constructor, right after the `this.emptyOverlay.append(this.loadButtonEl, this.recordButtonEl);` line (line 178), add:

```ts
    this.cancelButtonEl = document.createElement("button");
    this.cancelButtonEl.type = "button";
    this.cancelButtonEl.className = "waver-cancel-btn";
    this.cancelButtonEl.innerHTML = closeIcon;
    this.cancelButtonEl.setAttribute("aria-label", "Cancel");
```

In the `this.container.append(...)` call (line 201), add `this.cancelButtonEl` to the list (placement doesn't matter for a `position: absolute` element, but keep it readable — add it right after `this.emptyOverlay`):

```ts
    this.container.append(
      this.rulerCanvas,
      this.waveStack,
      this.minimapCanvas,
      this.emptyOverlay,
      this.cancelButtonEl,
      this.recordingBar,
      this.fileInput
    );
```

Add a click listener alongside the other button listeners (after the `stopButton.addEventListener(...)` line, line 212):

```ts
    this.cancelButtonEl.addEventListener("click", () => {
      if (this.opts.cancelButton !== "enabled") return;
      this.openCancelConfirm();
    });
```

This calls `openCancelConfirm()`, which doesn't exist yet — add a temporary no-op private method right below `reset()` (it will be replaced with real logic in Task 3):

```ts
  private openCancelConfirm(): void {
    // implemented in Task 3
  }
```

- [ ] **Step 4: Wire visibility into `updateOverlay()`**

In `src/waver-element.ts`, in `updateOverlay()` (around line 467-477), add cancel-button visibility logic:

```ts
  private updateOverlay(): void {
    const showButtons = !this.hasAudio() && this.recordingState !== "recording";
    const loadVisible = showButtons && this.opts.loadButton !== "hidden";
    const recordVisible = showButtons && this.opts.recordButton !== "hidden";
    this.loadButtonEl.style.display = loadVisible ? "" : "none";
    this.recordButtonEl.style.display = recordVisible ? "" : "none";
    this.loadButtonEl.disabled = this.opts.loadButton === "disabled";
    this.recordButtonEl.disabled = this.opts.recordButton === "disabled";
    this.emptyOverlay.style.display = loadVisible || recordVisible ? "flex" : "none";
    this.recordingBar.style.display = this.recordingState === "recording" ? "flex" : "none";

    const cancelVisible = this.hasAudio() && this.recordingState !== "recording" && this.opts.cancelButton !== "hidden";
    this.cancelButtonEl.style.display = cancelVisible ? "" : "none";
    this.cancelButtonEl.disabled = this.opts.cancelButton === "disabled";
  }
```

- [ ] **Step 5: Add stylesheet rules**

In `src/waver-element.ts`, inside `styleSheet()`'s template literal, add after the `.waver-action-btn:disabled { ... }` rule (line 983):

```css
    .waver-cancel-btn {
      position: absolute; top: 8px; right: 8px; z-index: 6;
      display: inline-flex; align-items: center; justify-content: center;
      width: 28px; height: 28px; padding: 0; border-radius: 50%; border: none;
      background: transparent; color: inherit; opacity: 0.5; cursor: pointer;
      transition: opacity 120ms ease, background-color 120ms ease, transform 120ms ease;
    }
    .waver-cancel-btn:hover:not(:disabled) { opacity: 1; background: rgba(127, 127, 127, 0.15); }
    .waver-cancel-btn:active:not(:disabled) { transform: scale(0.96); }
    .waver-cancel-btn:disabled { opacity: 0.25; cursor: not-allowed; }
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- --run -t "cancelButton ControlState"`
Expected: PASS

- [ ] **Step 7: Write and run a `hidden`/`disabled` state test**

Add to the same `describe("configure() — cancelButton ControlState", ...)` block:

```ts
    it("hides the cancel button when set to 'hidden', even with audio loaded", () => {
      const el = mount();
      el.loadSamples(new Float32Array(1000), 44100);
      el.configure({ cancelButton: "hidden" });
      const cancelBtn = el.shadowRoot!.querySelector(".waver-cancel-btn") as HTMLButtonElement;
      expect(cancelBtn.style.display).toBe("none");
    });

    it("renders the cancel button disabled (visible, unclickable) when set to 'disabled'", () => {
      const el = mount();
      el.loadSamples(new Float32Array(1000), 44100);
      el.configure({ cancelButton: "disabled" });
      const cancelBtn = el.shadowRoot!.querySelector(".waver-cancel-btn") as HTMLButtonElement;
      expect(cancelBtn.style.display).not.toBe("none");
      expect(cancelBtn.disabled).toBe(true);
    });

    it("stays hidden while a recording is in progress even though hasAudio() may be false", async () => {
      const el = mount();
      vi.stubGlobal("navigator", {
        mediaDevices: { getUserMedia: vi.fn(async () => ({ getTracks: () => [] }) as unknown as MediaStream) },
      });
      vi.stubGlobal("AudioContext", vi.fn(function () {
        return makeFakeAudioContext();
      }));
      await el.startRecording();
      const cancelBtn = el.shadowRoot!.querySelector(".waver-cancel-btn") as HTMLButtonElement;
      expect(cancelBtn.style.display).toBe("none");
    });

    it("has a static aria-label regardless of state", () => {
      const el = mount();
      const cancelBtn = el.shadowRoot!.querySelector(".waver-cancel-btn") as HTMLButtonElement;
      expect(cancelBtn.getAttribute("aria-label")).toBe("Cancel");
    });
```

Run: `npm test -- --run -t "cancelButton ControlState"`
Expected: PASS (all 5 tests in the block)

- [ ] **Step 8: Commit**

```bash
git add src/core/icons.ts src/waver-element.ts src/waver-element.test.ts
git commit -m "feat: add Cancel button element, icon, and visibility logic"
```

---

### Task 3: Confirmation overlay + Clear/Keep behavior

**Files:**
- Modify: `src/waver-element.ts` (constructor: build confirm overlay DOM; `openCancelConfirm()`/`closeCancelConfirm()` methods; stylesheet)
- Test: `src/waver-element.test.ts`

**Interfaces:**
- Consumes: `this.reset()` (existing), `this.cancelButtonEl` (Task 2).
- Produces: `private confirmOverlayEl: HTMLDivElement`, `private openCancelConfirm(): void`, `private closeCancelConfirm(): void`. DOM classes: `.waver-confirm-overlay`, `.waver-confirm-card`.

- [ ] **Step 1: Write the failing tests**

Add a new `describe` block in `src/waver-element.test.ts`, placed after the `describe("configure() — cancelButton ControlState", ...)` block:

```ts
  describe("Cancel button confirmation flow", () => {
    function getConfirmParts(el: WaverElement) {
      const shadow = el.shadowRoot!;
      return {
        overlay: shadow.querySelector(".waver-confirm-overlay") as HTMLElement,
        keepBtn: shadow.querySelector(".waver-confirm-keep") as HTMLButtonElement,
        clearBtn: shadow.querySelector(".waver-confirm-clear") as HTMLButtonElement,
        cancelBtn: shadow.querySelector(".waver-cancel-btn") as HTMLButtonElement,
      };
    }

    it("is hidden until the Cancel button is clicked, then opens on click", () => {
      const el = mount();
      el.loadSamples(new Float32Array(1000), 44100);
      const { overlay, cancelBtn } = getConfirmParts(el);
      expect(overlay.style.display).toBe("none");

      cancelBtn.click();
      expect(overlay.style.display).not.toBe("none");
    });

    it("does not open when cancelButton is 'disabled'", () => {
      const el = mount();
      el.loadSamples(new Float32Array(1000), 44100);
      el.configure({ cancelButton: "disabled" });
      const { overlay, cancelBtn } = getConfirmParts(el);

      cancelBtn.click();
      expect(overlay.style.display).toBe("none");
    });

    it("Keep button closes the overlay without discarding audio", () => {
      const el = mount();
      el.loadSamples(new Float32Array(1000), 44100);
      const { overlay, keepBtn, cancelBtn } = getConfirmParts(el);
      cancelBtn.click();

      keepBtn.click();

      expect(overlay.style.display).toBe("none");
      expect(el.hasAudio()).toBe(true);
    });

    it("Escape key closes the overlay without discarding audio", () => {
      const el = mount();
      el.loadSamples(new Float32Array(1000), 44100);
      const { overlay, cancelBtn } = getConfirmParts(el);
      cancelBtn.click();

      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

      expect(overlay.style.display).toBe("none");
      expect(el.hasAudio()).toBe(true);
    });

    it("backdrop click closes the overlay without discarding audio", () => {
      const el = mount();
      el.loadSamples(new Float32Array(1000), 44100);
      const { overlay, cancelBtn } = getConfirmParts(el);
      cancelBtn.click();

      overlay.dispatchEvent(new Event("click", { bubbles: true }));

      expect(overlay.style.display).toBe("none");
      expect(el.hasAudio()).toBe(true);
    });

    it("Clear button calls reset(): erases audio, shows empty overlay, emits waver:reset, and closes the confirm overlay", () => {
      const el = mount();
      el.loadSamples(new Float32Array(1000), 44100);
      const onReset = vi.fn();
      el.addEventListener("waver:reset", onReset);
      const { overlay, clearBtn, cancelBtn } = getConfirmParts(el);
      cancelBtn.click();

      clearBtn.click();

      expect(el.hasAudio()).toBe(false);
      expect(overlay.style.display).toBe("none");
      expect(onReset).toHaveBeenCalledTimes(1);
      const emptyOverlay = el.shadowRoot!.querySelector(".waver-empty-overlay") as HTMLElement;
      expect(emptyOverlay.style.display).toBe("flex");
    });

    it("confirm card has dialog a11y attributes and moves focus to Keep on open", () => {
      const el = mount();
      el.loadSamples(new Float32Array(1000), 44100);
      const shadow = el.shadowRoot!;
      const card = shadow.querySelector(".waver-confirm-card") as HTMLElement;
      expect(card.getAttribute("role")).toBe("dialog");
      expect(card.getAttribute("aria-modal")).toBe("true");

      const { keepBtn, cancelBtn } = getConfirmParts(el);
      cancelBtn.click();
      expect(shadow.activeElement).toBe(keepBtn);
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run -t "Cancel button confirmation flow"`
Expected: FAIL — `.waver-confirm-overlay` etc. don't exist yet.

- [ ] **Step 3: Build the confirm overlay DOM in the constructor**

In `src/waver-element.ts`, add new private fields near `cancelButtonEl`:

```ts
  private cancelButtonEl: HTMLButtonElement;
  private confirmOverlayEl: HTMLDivElement;
  private confirmKeepBtn: HTMLButtonElement;
  private confirmClearBtn: HTMLButtonElement;
```

In the constructor, after the `cancelButtonEl` setup block from Task 2 (after the `setAttribute("aria-label", "Cancel")` line), add:

```ts
    this.confirmOverlayEl = document.createElement("div");
    this.confirmOverlayEl.className = "waver-confirm-overlay";
    const confirmCard = document.createElement("div");
    confirmCard.className = "waver-confirm-card";
    confirmCard.setAttribute("role", "dialog");
    confirmCard.setAttribute("aria-modal", "true");
    const confirmMessage = document.createElement("p");
    confirmMessage.className = "waver-confirm-message";
    confirmMessage.textContent = "Clear waveform?";
    this.confirmKeepBtn = document.createElement("button");
    this.confirmKeepBtn.type = "button";
    this.confirmKeepBtn.className = "waver-action-btn waver-confirm-keep";
    this.confirmKeepBtn.textContent = "Keep";
    this.confirmClearBtn = document.createElement("button");
    this.confirmClearBtn.type = "button";
    this.confirmClearBtn.className = "waver-action-btn waver-action-btn--record waver-confirm-clear";
    this.confirmClearBtn.textContent = "Clear";
    const confirmActions = document.createElement("div");
    confirmActions.className = "waver-confirm-actions";
    confirmActions.append(this.confirmKeepBtn, this.confirmClearBtn);
    confirmCard.append(confirmMessage, confirmActions);
    this.confirmOverlayEl.append(confirmCard);
```

Append it to the container (extend the `container.append(...)` call from Task 2 to also include `this.confirmOverlayEl`, placed after `this.cancelButtonEl`):

```ts
    this.container.append(
      this.rulerCanvas,
      this.waveStack,
      this.minimapCanvas,
      this.emptyOverlay,
      this.cancelButtonEl,
      this.confirmOverlayEl,
      this.recordingBar,
      this.fileInput
    );
```

Wire up the interaction listeners, right after the `this.cancelButtonEl.addEventListener(...)` block from Task 2:

```ts
    this.confirmKeepBtn.addEventListener("click", () => this.closeCancelConfirm());
    this.confirmClearBtn.addEventListener("click", () => {
      this.closeCancelConfirm();
      this.reset();
    });
    this.confirmOverlayEl.addEventListener("click", (e) => {
      if (e.target === this.confirmOverlayEl) this.closeCancelConfirm();
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.confirmOverlayEl.style.display !== "none") this.closeCancelConfirm();
    });
```

- [ ] **Step 4: Replace the Task-2 stub with real `openCancelConfirm()`/`closeCancelConfirm()`**

Replace the temporary stub method added in Task 2:

```ts
  private openCancelConfirm(): void {
    // implemented in Task 3
  }
```

with:

```ts
  private openCancelConfirm(): void {
    this.confirmOverlayEl.style.display = "flex";
    this.confirmKeepBtn.focus();
  }

  private closeCancelConfirm(): void {
    this.confirmOverlayEl.style.display = "none";
  }
```

Also set the overlay's initial display to `"none"` — add this line right after building `this.confirmOverlayEl` in the constructor (so it starts hidden before the first `updateOverlay()` call runs; `updateOverlay()` never touches it, only `open`/`closeCancelConfirm()` do):

```ts
    this.confirmOverlayEl.style.display = "none";
```

- [ ] **Step 5: Add stylesheet rules**

In `styleSheet()`, add after the `.waver-cancel-btn:disabled { ... }` rule:

```css
    .waver-confirm-overlay {
      position: absolute; inset: 0; z-index: 10; display: none;
      align-items: center; justify-content: center;
      background: rgba(0, 0, 0, 0.5);
    }
    .waver-confirm-card {
      display: flex; flex-direction: column; align-items: center; gap: 16px;
      padding: 20px 24px; border-radius: 12px; background: #1a1a1a; color: #fff;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
    }
    .waver-confirm-message { margin: 0; font: inherit; font-size: 14px; }
    .waver-confirm-actions { display: flex; gap: 12px; }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- --run -t "Cancel button confirmation flow"`
Expected: PASS (all 7 tests)

- [ ] **Step 7: Run the full test suite**

Run: `npm test -- --run`
Expected: PASS, all files (284 previous + new tests), 0 failures.

- [ ] **Step 8: Commit**

```bash
git add src/waver-element.ts src/waver-element.test.ts
git commit -m "feat: add Cancel confirmation overlay with Keep/Clear and dismiss handling"
```

---

### Task 4: Vue wrapper prop + README docs

**Files:**
- Modify: `src/vue/Waver.ts`
- Modify: `README.md`
- Test: `src/vue/Waver.test.ts`

**Interfaces:**
- Consumes: `WaverOptions.cancelButton` (Task 1).
- Produces: `cancelButton` prop on the Vue `Waver` component, forwarded into `opts` exactly like `loadButton`/`recordButton`.

- [ ] **Step 1: Write the failing test**

Add to `src/vue/Waver.test.ts`, right after the existing `it("re-configures the element reactively when a prop changes", ...)` test (after line 76):

```ts
  it("forwards the cancelButton prop on mount", async () => {
    const wrapper = mount(Waver, { props: { cancelButton: "hidden" } });
    await wrapper.vm.$nextTick();
    const el = wrapper.find("wave-r").element as WaverElement;
    el.loadSamples(new Float32Array(1000), 44100);
    const cancelBtn = el.shadowRoot!.querySelector(".waver-cancel-btn") as HTMLButtonElement;
    expect(cancelBtn.style.display).toBe("none");
  });

  it("re-configures cancelButton reactively when the prop changes", async () => {
    const wrapper = mount(Waver, { props: { cancelButton: "enabled" as const } });
    const el = wrapper.find("wave-r").element as WaverElement;
    const configureSpy = vi.spyOn(el, "configure");

    await wrapper.setProps({ cancelButton: "hidden" });
    await wrapper.vm.$nextTick();

    expect(configureSpy).toHaveBeenCalledWith(expect.objectContaining({ cancelButton: "hidden" }));
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run -t "cancelButton"`
Expected: FAIL — prop doesn't exist / isn't forwarded.

- [ ] **Step 3: Add the prop**

In `src/vue/Waver.ts`, in the `props` object, add right after `recordButton` (line 29):

```ts
    cancelButton: { type: String as PropType<ControlState>, default: undefined },
```

In `collectOptions()`, add right after the `recordButton` line (line 102):

```ts
      if (props.cancelButton !== undefined) opts.cancelButton = props.cancelButton;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run -t "cancelButton"`
Expected: PASS

- [ ] **Step 5: Update README**

In `README.md`:

1. Line 117, add `cancelButton` to the prop-name list, right after `recordButton`:
   ```
   `rulerHeight`, `loadButton`, `recordButton`, `cancelButton`, `channelIndex`, `viewMode`, `recordViewMode`,
   ```

2. In the options table, add a new row right after the `recordButton` row (after line 140):
   ```
   | `cancelButton` | `"enabled" \| "disabled" \| "hidden"` | `"enabled"` | State of the built-in "Cancel" (X) button shown top-right once audio is loaded. Clicking it opens a confirmation overlay before discarding via `reset()`. |
   ```

- [ ] **Step 6: Run full test suite**

Run: `npm test -- --run`
Expected: PASS, 0 failures.

- [ ] **Step 7: Commit**

```bash
git add src/vue/Waver.ts src/vue/Waver.test.ts README.md
git commit -m "feat: forward cancelButton to Vue wrapper, document in README"
```

---

### Task 5: Manual verification in the demo app

**Files:**
- None modified (verification only), reads `src/demo/main.ts` / `index.html` to know how to run the demo.

- [ ] **Step 1: Check how the demo app is started**

Run: `grep -n "\"dev\"\|\"demo\"" package.json`

- [ ] **Step 2: Start the dev server**

Run (background): `npm run dev`

- [ ] **Step 3: Manually verify in a browser**

Open the demo URL reported by the dev server. Verify:
- No Cancel button visible before any audio is loaded.
- Load a file (or record) — Cancel (X) appears top-right, semi-transparent, circular hover highlight on mouseover.
- Click Cancel — confirm overlay appears centered, dimmed backdrop, "Clear waveform?" with Keep/Clear buttons; focus is on Keep.
- Click Keep — overlay closes, waveform still loaded.
- Reopen, press Escape — overlay closes, waveform still loaded.
- Reopen, click the dimmed backdrop (outside the card) — overlay closes, waveform still loaded.
- Reopen, click Clear — overlay closes, waveform clears, Load/Record buttons reappear, Cancel button disappears.
- Start a recording — confirm Cancel button does NOT appear while recording (only Stop does).

- [ ] **Step 4: Stop the dev server**

Kill the background `npm run dev` process.

- [ ] **Step 5: Report results**

No commit for this task — verification only. If any check fails, fix the issue in the relevant earlier task's files, re-run that task's tests, then re-verify here.
