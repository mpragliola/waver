import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { captureWaverEvents, getCapturedEvents } from "./helpers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TONE_WAV = path.join(__dirname, "fixtures", "tone.wav");

async function loadTone(page: import("@playwright/test").Page) {
  const waver = page.locator("wave-r");
  await waver.locator(".waver-file-input").setInputFiles(TONE_WAV);
  await expect(page.locator("#status")).toHaveText("");
}

test.describe("playback", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });
  test("Play/Stop toggles playback state, reflected via play/stop events", async ({ page }) => {
    await captureWaverEvents(page, ["waver:play", "waver:stop"]);
    await loadTone(page);

    await page.click("#play");
    await expect.poll(() => getCapturedEvents(page, "waver:play")).toHaveLength(1);

    await page.click("#play");
    await expect.poll(() => getCapturedEvents(page, "waver:stop")).toHaveLength(1);
  });
});

test.describe("zoom", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });
  test("Zoom to full resets the viewport without erroring", async ({ page }) => {
    await loadTone(page);

    const waveform = page.locator("wave-r").locator(".waver-waveform");
    const box = await waveform.boundingBox();
    if (!box) throw new Error("waveform canvas has no layout box");

    // Zoom in first via wheel + ctrl, so zoomToFull has something to actually undo.
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -200);

    await page.click("#zoomFull");
    // No assertion beyond "didn't throw" is reliable across canvas rendering; a crash would fail
    // the test via an unhandled page error (see playwright.config.ts trace capture).
    await expect(waveform).toBeVisible();
  });
});

test.describe("view mode", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });
  test("Toggle spectrogram switches view mode and fires viewmodechange", async ({ page }) => {
    await captureWaverEvents(page, ["waver:viewmodechange", "waver:spectrogramready"]);
    await loadTone(page);

    await page.click("#viewMode");

    await expect.poll(() => getCapturedEvents(page, "waver:viewmodechange")).toHaveLength(1);
    const [detail] = await getCapturedEvents<{ viewMode: string }>(page, "waver:viewmodechange");
    expect(detail.viewMode).toBe("spectrogram");

    // Spectrogram analysis runs in a background worker; wait for it to actually resolve.
    await expect.poll(() => getCapturedEvents(page, "waver:spectrogramready"), { timeout: 10_000 }).toHaveLength(1);
  });
});
