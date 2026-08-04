// Documentation screenshot capture for docs/manual.md.
//
// This is NOT a test file — no assertions, just reliable capture of every user-facing
// feature/state of the <wave-r> demo app. Run with:
//   npx playwright test scripts/take-screenshots.ts --project=chromium
// (kept outside e2e/ so playwright.config.ts's testDir: "./e2e" never picks it up via `npm run e2e`)
//
// Reuses the same webServer/baseURL (port 4173) as playwright.config.ts, and the same fake mic
// device flags/permission grant so the recording overlay shot uses a real synthetic audio stream.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, type Page } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(REPO_ROOT, "docs", "screenshots");
const TONE_WAV = path.join(REPO_ROOT, "e2e", "fixtures", "tone.wav");
const CORRUPT_WAV = path.join(REPO_ROOT, "e2e", "fixtures", "corrupt.wav");

// Known dark/light theme literals mirrored from src/core/theme.ts (avoids fragile dynamic
// import() of a src module from inside page.evaluate — these are stable public API values).
const LIGHT_THEME = {
  waveformColor: "#2B6CB0",
  backgroundColor: "#FFFFFF",
  cursorColor: "#1A202C",
  selectionColor: "rgba(43, 108, 176, 0.45)",
  minimapOverlayColor: "rgba(0, 0, 0, 0.15)",
  zeroLineColor: "rgba(226, 232, 240, 0.25)",
  rulerColor: "rgba(26, 32, 44, 0.55)",
};

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

// Clean output dir on each run, but keep PLAN.md (traceability doc, not a generated artifact).
function cleanOutputDir(): void {
  if (fs.existsSync(OUTPUT_DIR)) {
    for (const entry of fs.readdirSync(OUTPUT_DIR)) {
      if (entry === "PLAN.md") continue;
      fs.rmSync(path.join(OUTPUT_DIR, entry), { recursive: true, force: true });
    }
  }
  ensureDir(OUTPUT_DIR);
}

async function shotPath(...segments: string[]): Promise<string> {
  const full = path.join(OUTPUT_DIR, ...segments);
  ensureDir(path.dirname(full));
  return full;
}

async function loadTone(page: Page): Promise<void> {
  const waver = page.locator("wave-r");
  await waver.locator(".waver-file-input").setInputFiles(TONE_WAV);
  await page.locator("#status").waitFor({ state: "attached" });
  await page.waitForFunction(() => {
    const el = document.getElementById("status");
    return el !== null && el.textContent === "";
  });
  // Empty-state buttons disappear once samples decode — wait for that as the real "loaded" signal.
  await waver.locator(".waver-empty-overlay .waver-action-btn--record").waitFor({ state: "hidden" });
}

async function freshPage(page: Page): Promise<void> {
  await page.goto("/");
  // Initial getUserMedia() call in main.ts (for device labels) needs a beat to resolve under the
  // fake device; wait for either the record button (idle) which is present regardless.
  await page.locator("wave-r").locator(".waver-empty-overlay .waver-action-btn--record").waitFor({ state: "visible" });
}

test.beforeAll(() => {
  cleanOutputDir();
});

test.describe.configure({ mode: "serial" });

test("empty state — full page + labeled/icon-only buttons", async ({ page }) => {
  await freshPage(page);

  // 01 — whole demo page on first load: buttons, controls row, status line. Orientation shot.
  // Cropped to #app (not fullPage) so it's tight around the actual content, not the empty viewport below it.
  await page.locator("#app").screenshot({ path: await shotPath("empty-state", "01-full-page-default.png") });

  // 02 — close crop of the empty overlay with text labels (default hideButtonLabels: false).
  await page.locator("wave-r").screenshot({ path: await shotPath("empty-state", "02-buttons-with-labels.png") });

  // 03 — same overlay after toggling hideButtonLabels: true (icon-only buttons).
  await page.click("#toggleButtonLabels");
  await page
    .locator("wave-r .waver-empty-overlay .waver-action-btn--record.waver-action-btn--icon-only")
    .waitFor({ state: "visible" });
  await page.locator("wave-r").screenshot({ path: await shotPath("empty-state", "03-buttons-icon-only.png") });
});

test("loading — waveform loaded + load error", async ({ page }) => {
  await freshPage(page);

  // 01 — tone.wav loaded, default view: ruler + waveform + zero line + minimap.
  await loadTone(page);
  await page.locator("wave-r").screenshot({ path: await shotPath("loading", "01-waveform-loaded-default.png") });

  // 02 — corrupt.wav produces a decode error surfaced in the status line. Fresh page so the
  // earlier successful load doesn't interfere with the empty-state file input.
  await freshPage(page);
  await page.locator("wave-r .waver-file-input").setInputFiles(CORRUPT_WAV);
  await page.locator("#status").filter({ hasText: "Failed to decode audio" }).waitFor({ state: "visible" });
  await page.locator("#app").screenshot({ path: await shotPath("loading", "02-load-error.png") });
});

test("selection — click-drag creates a selection", async ({ page }) => {
  await freshPage(page);
  await loadTone(page);

  const waveform = page.locator("wave-r .waver-waveform");
  const box = await waveform.boundingBox();
  if (!box) throw new Error("waveform canvas has no layout box — cannot capture selection screenshot");

  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();

  // Let the selection overlay settle a frame before capture.
  await page.waitForTimeout(100);
  await page.locator("wave-r").screenshot({ path: await shotPath("selection", "01-click-drag-selection.png") });
});

test("playback — cursor mid-waveform while playing", async ({ page }) => {
  await freshPage(page);
  await loadTone(page);

  await page.click("#play");
  // Give the playhead time to move visibly off sample 0.
  await page.waitForTimeout(400);
  await page.locator("wave-r").screenshot({ path: await shotPath("playback", "01-playback-in-progress.png") });
  await page.click("#play"); // stop cleanly
});

test("zoom — deep zoom vs zoomed-to-full", async ({ page }) => {
  await freshPage(page);
  await loadTone(page);

  // 01 — deterministic deep zoom via the public API (precise, no fragile wheel-gesture math).
  await page.evaluate(() => {
    const waver = document.getElementById("waver") as unknown as {
      setZoom: (z: { samplesPerPixel: number; offsetSample?: number }, animate?: boolean) => void;
    };
    waver.setZoom({ samplesPerPixel: 1, offsetSample: 0 }, false);
  });
  await page.waitForTimeout(100);
  await page.locator("wave-r").screenshot({ path: await shotPath("zoom", "01-zoomed-in-samples.png") });

  // 02 — zoom back out to fit the whole buffer, for contrast.
  await page.click("#zoomFull");
  await page.waitForTimeout(400); // zoomToFull animates by default
  await page.locator("wave-r").screenshot({ path: await shotPath("zoom", "02-zoomed-to-full.png") });
});

test("view modes — spectrogram", async ({ page }) => {
  await freshPage(page);
  await loadTone(page);

  await page.evaluate(() => {
    const w = window as unknown as { __waverEvents: Record<string, unknown[]> };
    w.__waverEvents = { "waver:spectrogramready": [] };
    document.getElementById("waver")!.addEventListener("waver:spectrogramready", () => {
      w.__waverEvents["waver:spectrogramready"].push({});
    });
  });

  await page.click("#viewMode");

  await page.waitForFunction(
    () => {
      const w = window as unknown as { __waverEvents: Record<string, unknown[]> };
      return (w.__waverEvents?.["waver:spectrogramready"]?.length ?? 0) > 0;
    },
    { timeout: 10_000 }
  );
  await page.locator("wave-r").screenshot({ path: await shotPath("view-modes", "01-spectrogram-view.png") });
});

test("minimap — close-up with partial viewport overlay", async ({ page }) => {
  await freshPage(page);
  await loadTone(page);

  await page.evaluate(() => {
    const waver = document.getElementById("waver") as unknown as {
      setZoom: (z: { samplesPerPixel: number; offsetSample?: number }, animate?: boolean) => void;
    };
    waver.setZoom({ samplesPerPixel: 20, offsetSample: 0 }, false);
  });
  await page.waitForTimeout(100);
  await page.locator("wave-r .waver-minimap").screenshot({ path: await shotPath("minimap", "01-minimap-closeup.png") });
});

test("recording — live overlay in default scroll mode", async ({ page }) => {
  await freshPage(page);

  const waver = page.locator("wave-r");
  await waver.locator(".waver-empty-overlay .waver-action-btn--record").click();
  await waver.locator(".waver-recording-bar").waitFor({ state: "visible" });
  await waver.locator(".waver-recording-time").waitFor({ state: "visible" });

  // Let real (fake-device) audio accumulate so the waveform/timer aren't at a blank 0:00 frame.
  await page.waitForTimeout(1500);
  await waver.screenshot({ path: await shotPath("recording", "01-recording-overlay-scroll.png") });

  // Stop cleanly so the mic stream doesn't leak state into whatever runs after this test.
  await waver.locator(".waver-action-btn--stop").click();
  await waver.locator(".waver-recording-bar").waitFor({ state: "hidden" });
});

test("cancel — confirmation overlay", async ({ page }) => {
  await freshPage(page);
  await loadTone(page);

  const waver = page.locator("wave-r");
  await waver.locator(".waver-cancel-btn").click();
  await waver.locator(".waver-confirm-overlay").waitFor({ state: "visible" });
  await waver.screenshot({ path: await shotPath("cancel", "01-cancel-confirm-overlay.png") });

  // Dismiss via "Keep" (not "Clear") — this test doesn't need the audio gone afterward, and
  // "Keep" is the non-destructive choice.
  await waver.locator(".waver-confirm-keep").click();
  await waver.locator(".waver-confirm-overlay").waitFor({ state: "hidden" });
});

test("ruler — time format vs samples format", async ({ page }) => {
  await freshPage(page);
  await loadTone(page);

  // 01 — default rulerTimeFormat: "time" (mm:ss labels).
  await page.locator("wave-r .waver-ruler").screenshot({ path: await shotPath("ruler", "01-ruler-time-format.png") });

  // 02 — switched to raw sample-index labels.
  await page.evaluate(() => {
    (document.getElementById("waver") as unknown as { configure: (o: Record<string, unknown>) => void }).configure({
      rulerTimeFormat: "samples",
    });
  });
  await page.waitForTimeout(100);
  await page.locator("wave-r .waver-ruler").screenshot({ path: await shotPath("ruler", "02-ruler-samples-format.png") });
});

test("theming — dark (default) vs light", async ({ page }) => {
  await freshPage(page);
  await loadTone(page);

  // 01 — default dark theme (no override — this is what the demo ships with).
  await page.locator("wave-r").screenshot({ path: await shotPath("theming", "01-dark-theme.png") });

  // 02 — light theme applied via configure({ theme }). Values mirror src/core/theme.ts's
  // exported `lightTheme` (hardcoded here rather than importing the src module into page
  // context, which isn't a reliable path from a Vite-served demo page).
  await page.evaluate((lightTheme) => {
    (document.getElementById("waver") as unknown as { configure: (o: Record<string, unknown>) => void }).configure({
      theme: lightTheme,
    });
  }, LIGHT_THEME);
  await page.waitForTimeout(100);
  await page.locator("wave-r").screenshot({ path: await shotPath("theming", "02-light-theme.png") });
});
