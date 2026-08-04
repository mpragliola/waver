import { expect, test } from "@playwright/test";

// Fake mic support (--use-fake-device-for-media-stream + the microphone permission grant) is wired
// up chromium-only in playwright.config.ts; these specs never run under firefox/webkit projects.

test("recording lifecycle: start shows the timer/stop UI, stop loads captured audio", async ({ page }) => {
  await page.goto("/");
  const waver = page.locator("wave-r");

  await waver.locator(".waver-empty-overlay .waver-action-btn--record").click();

  await expect(page.locator("#status")).toContainText("Recording");
  await expect(waver.locator(".waver-recording-bar")).toBeVisible();
  await expect(waver.locator(".waver-recording-time")).toBeVisible();

  // Let a little real audio accumulate (the fake device streams silence/tone) before stopping.
  await page.waitForTimeout(1500);
  await expect(waver.locator(".waver-recording-time")).toHaveText(/0:0[01]/);

  await waver.locator(".waver-action-btn--stop").click();

  await expect(waver.locator(".waver-recording-bar")).toBeHidden();
  await expect(page.locator("#status")).toHaveText("");
  // A successful stop with captured audio hides the empty-state Load/Record buttons entirely.
  await expect(waver.locator(".waver-empty-overlay")).toBeHidden();
});

test("interaction is locked on the waveform while recording", async ({ page }) => {
  await page.goto("/");
  const waver = page.locator("wave-r");
  await waver.locator(".waver-empty-overlay .waver-action-btn--record").click();
  await expect(waver.locator(".waver-recording-bar")).toBeVisible();

  const waveform = waver.locator(".waver-waveform");
  const box = await waveform.boundingBox();
  if (!box) throw new Error("waveform canvas has no layout box");

  // A click during recording must not move the cursor or otherwise fight the auto-follow viewport.
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  // Still recording, no crash, no stray selection UI.
  await expect(waver.locator(".waver-recording-bar")).toBeVisible();

  await waver.locator(".waver-action-btn--stop").click();
});

test("Monitor button opens the mic and shows the VU meter without recording", async ({ page }) => {
  await page.goto("/");
  const waver = page.locator("wave-r");

  await page.click("#monitor");

  await expect(waver.locator(".waver-vu-meter")).toBeVisible();
  await expect(waver.locator(".waver-recording-bar")).toBeHidden();
  await expect(page.locator("#status")).toContainText("Monitoring");

  await page.click("#monitor");

  await expect(waver.locator(".waver-vu-meter")).toBeHidden();
  await expect(page.locator("#status")).toHaveText("");
});

test("clicking Record while monitoring transitions straight to recording", async ({ page }) => {
  await page.goto("/");
  const waver = page.locator("wave-r");

  await page.click("#monitor");
  await expect(waver.locator(".waver-vu-meter")).toBeVisible();

  await waver.locator(".waver-empty-overlay .waver-action-btn--record").click();

  await expect(waver.locator(".waver-vu-meter")).toBeHidden();
  await expect(waver.locator(".waver-recording-bar")).toBeVisible();

  await waver.locator(".waver-action-btn--stop").click();
});

test("recordButton: 'disabled' via configure() prevents starting a recording from the UI", async ({ page }) => {
  await page.goto("/");
  const waver = page.locator("wave-r");

  await page.evaluate(() => {
    (document.getElementById("waver") as import("../src/waver-element").WaverElement).configure({
      recordButton: "disabled",
    });
  });

  const recordBtn = waver.locator(".waver-empty-overlay .waver-action-btn--record");
  await expect(recordBtn).toBeVisible();
  await expect(recordBtn).toBeDisabled();

  await recordBtn.click({ force: true });
  await expect(waver.locator(".waver-recording-bar")).toBeHidden();
});
