import { expect, test } from "@playwright/test";
import { loadTone } from "./helpers";

test.describe("spectrogram during recording", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });
  test("spectrogram can be viewed during recording with flat mode", async ({ page }) => {
    const waver = page.locator("wave-r");

    // Set record mode to flat and switch to spectrogram
    await page.evaluate(() => {
      (document.getElementById("waver") as any).configure({
        recordViewMode: "flat",
        viewMode: "spectrogram",
      });
    });

    // Start recording
    await waver.locator(".waver-empty-overlay .waver-action-btn--record").click();
    await expect(waver.locator(".waver-recording-bar")).toBeVisible();

    // Wait for spectrogram to render
    await page.waitForTimeout(1000);

    // Stop recording
    await waver.locator(".waver-action-btn--stop").click();

    // Spectrogram should still be visible with captured audio
    await expect(waver.locator(".waver-empty-overlay")).toBeHidden();
  });

  test("spectrogram analysis fires spectrogramready event", async ({ page }) => {
    const waver = page.locator("wave-r");
    await loadTone(page);

    let spectrogramReady = false;
    await page.evaluate(() => {
      (window as any).spectrogramReady = false;
      document.getElementById("waver")?.addEventListener("waver:spectrogramready", () => {
        (window as any).spectrogramReady = true;
      });
    });

    // Switch to spectrogram
    await page.evaluate(() => {
      (document.getElementById("waver") as any).setViewMode("spectrogram");
    });

    // Wait for spectrogram analysis to complete
    await page.waitForTimeout(2000);

    spectrogramReady = await page.evaluate(() => (window as any).spectrogramReady);
    expect(spectrogramReady).toBe(true);
  });

  test("spectrogram respects configuration changes", async ({ page }) => {
    const waver = page.locator("wave-r");
    await loadTone(page);

    await page.evaluate(() => {
      (document.getElementById("waver") as any).configure({
        spectrogramFftSize: 4096,
        spectrogramHop: 512,
      });
    });

    const opts = await page.evaluate(() => {
      const el = document.getElementById("waver") as any;
      return {
        fft: el.opts.spectrogramFftSize,
        hop: el.opts.spectrogramHop,
      };
    });

    expect(opts.fft).toBe(4096);
    expect(opts.hop).toBe(512);
  });

  test("switching from waveform to spectrogram fires viewmodechange", async ({ page }) => {
    const waver = page.locator("wave-r");
    await loadTone(page);

    let viewModeChanged = false;
    await page.evaluate(() => {
      (window as any).viewModeChanged = false;
      document.getElementById("waver")?.addEventListener("waver:viewmodechange", () => {
        (window as any).viewModeChanged = true;
      });
    });

    await page.evaluate(() => {
      (document.getElementById("waver") as any).setViewMode("spectrogram");
    });

    viewModeChanged = await page.evaluate(() => (window as any).viewModeChanged);
    expect(viewModeChanged).toBe(true);
  });

  test("minimap stays on waveform view regardless of main view", async ({ page }) => {
    const waver = page.locator("wave-r");
    await loadTone(page);

    // Switch main view to spectrogram
    await page.evaluate(() => {
      (document.getElementById("waver") as any).setViewMode("spectrogram");
    });

    // Minimap should still exist and be in waveform mode internally
    const minimap = waver.locator(".waver-minimap");
    await expect(minimap).toBeVisible();
  });
});
