import { expect, test } from "@playwright/test";
import { loadTone } from "./helpers";

test.describe("reset and cancel dialog", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });
  test("reset() erases audio and returns to empty state", async ({ page }) => {
    const waver = page.locator("wave-r");
    await loadTone(page);

    await expect(waver.locator(".waver-empty-overlay")).toBeHidden();

    await page.evaluate(() => {
      (document.getElementById("waver") as any).reset();
    });

    await expect(waver.locator(".waver-empty-overlay")).toBeVisible();

    const hasAudio = await page.evaluate(() => {
      return (document.getElementById("waver") as any).hasAudio();
    });
    expect(hasAudio).toBe(false);
  });

  test("reset() emits waver:reset event", async ({ page }) => {
    const waver = page.locator("wave-r");
    await loadTone(page);

    let resetFired = false;
    await page.evaluate(() => {
      (window as any).resetFired = false;
      document.getElementById("waver")?.addEventListener("waver:reset", () => {
        (window as any).resetFired = true;
      });
    });

    await page.evaluate(() => {
      (document.getElementById("waver") as any).reset();
    });

    resetFired = await page.evaluate(() => (window as any).resetFired);
    expect(resetFired).toBe(true);
  });

  test("clicking Cancel (X) button opens confirmation dialog", async ({ page }) => {
    const waver = page.locator("wave-r");
    await loadTone(page);

    const cancelBtn = waver.locator(".waver-cancel-btn");
    await cancelBtn.click();

    await expect(waver.locator(".waver-confirm-overlay")).toBeVisible();
    await expect(waver.locator(".waver-confirm-message")).toContainText("Clear waveform?");
  });

  test("confirmation dialog has Keep and Clear buttons", async ({ page }) => {
    const waver = page.locator("wave-r");
    await loadTone(page);

    const cancelBtn = waver.locator(".waver-cancel-btn");
    await cancelBtn.click();

    await expect(waver.locator(".waver-confirm-keep")).toBeVisible();
    await expect(waver.locator(".waver-confirm-clear")).toBeVisible();
  });

  test("clicking Keep in dialog closes it without resetting", async ({ page }) => {
    const waver = page.locator("wave-r");
    await loadTone(page);

    const cancelBtn = waver.locator(".waver-cancel-btn");
    await cancelBtn.click();

    const keepBtn = waver.locator(".waver-confirm-keep");
    await keepBtn.click();

    await expect(waver.locator(".waver-confirm-overlay")).not.toBeVisible();
    await expect(waver.locator(".waver-empty-overlay")).toBeHidden();
  });

  test("clicking Clear in dialog resets the audio", async ({ page }) => {
    const waver = page.locator("wave-r");
    await loadTone(page);

    const cancelBtn = waver.locator(".waver-cancel-btn");
    await cancelBtn.click();

    const clearBtn = waver.locator(".waver-confirm-clear");
    await clearBtn.click();

    await expect(waver.locator(".waver-confirm-overlay")).not.toBeVisible();
    await expect(waver.locator(".waver-empty-overlay")).toBeVisible();
  });

  test("clicking outside dialog (overlay) closes it", async ({ page }) => {
    const waver = page.locator("wave-r");
    await loadTone(page);

    const cancelBtn = waver.locator(".waver-cancel-btn");
    await cancelBtn.click();

    await expect(waver.locator(".waver-confirm-overlay")).toBeVisible();

    // Click on the overlay background (outside the card)
    const overlay = waver.locator(".waver-confirm-overlay");
    const box = await overlay.boundingBox();
    if (!box) throw new Error("overlay has no layout box");

    // Click at the very edge of the overlay
    await page.click({ x: box.x + 5, y: box.y + 5 });

    await expect(waver.locator(".waver-confirm-overlay")).not.toBeVisible();
  });

  test("reset() during recording cancels capture and returns to empty state", async ({ page }) => {
    const waver = page.locator("wave-r");

    // Start recording
    await waver.locator(".waver-empty-overlay .waver-action-btn--record").click();
    await expect(waver.locator(".waver-recording-bar")).toBeVisible();

    // Call reset
    await page.evaluate(() => {
      (document.getElementById("waver") as any).reset();
    });

    // Should stop recording and show empty state
    await expect(waver.locator(".waver-recording-bar")).toBeHidden();
    await expect(waver.locator(".waver-empty-overlay")).toBeVisible();
  });

  test("Cancel button is only visible when audio is loaded", async ({ page }) => {
    const waver = page.locator("wave-r");
    const cancelBtn = waver.locator(".waver-cancel-btn");

    // No audio loaded yet
    await expect(cancelBtn).not.toBeVisible();

    await loadTone(page);

    // Audio loaded, cancel should be visible
    await expect(cancelBtn).toBeVisible();
  });

  test("Cancel button is hidden during recording", async ({ page }) => {
    const waver = page.locator("wave-r");

    // Start recording
    await waver.locator(".waver-empty-overlay .waver-action-btn--record").click();
    await expect(waver.locator(".waver-recording-bar")).toBeVisible();

    const cancelBtn = waver.locator(".waver-cancel-btn");
    await expect(cancelBtn).not.toBeVisible();

    // Stop recording
    await waver.locator(".waver-action-btn--stop").click();

    // Wait for audio to load and cancel to reappear
    await expect(cancelBtn).toBeVisible();
  });

  test("Escape closes confirmation dialog without affecting other state", async ({ page }) => {
    const waver = page.locator("wave-r");
    await loadTone(page);

    const cancelBtn = waver.locator(".waver-cancel-btn");
    await cancelBtn.click();

    await expect(waver.locator(".waver-confirm-overlay")).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(waver.locator(".waver-confirm-overlay")).not.toBeVisible();
    // Audio should still be loaded
    await expect(waver.locator(".waver-empty-overlay")).toBeHidden();
  });
});
