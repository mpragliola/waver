import { expect, test } from "@playwright/test";
import { loadTone } from "./helpers";

test.describe("keyboard interaction", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });
  test("Escape key closes confirmation dialog when open", async ({ page }) => {
    const waver = page.locator("wave-r");
    await loadTone(page);

    // Open the confirmation dialog via the cancel button
    const cancelBtn = waver.locator(".waver-cancel-btn");
    await cancelBtn.click();

    await expect(waver.locator(".waver-confirm-overlay")).toBeVisible();

    // Press Escape
    await page.keyboard.press("Escape");

    await expect(waver.locator(".waver-confirm-overlay")).not.toBeVisible();
  });

  test("Escape key stops monitoring when active", async ({ page }) => {
    const waver = page.locator("wave-r");

    // Start monitoring
    await page.click("#monitor");
    await expect(waver.locator(".waver-vu-meter")).toBeVisible();

    // Press Escape
    await page.keyboard.press("Escape");

    await expect(waver.locator(".waver-vu-meter")).toBeHidden();
    await expect(page.locator("#status")).toHaveText("");
  });

  test("Escape does nothing when no dialog or monitoring", async ({ page }) => {
    const waver = page.locator("wave-r");
    await loadTone(page);

    // Escape should not crash or do anything unexpected
    await page.keyboard.press("Escape");

    // Component should still be functional
    await expect(waver.locator(".waver-waveform")).toBeVisible();
  });

  test("Escape prioritizes closing confirmation over stopping monitor", async ({ page }) => {
    const waver = page.locator("wave-r");
    await loadTone(page);

    // Start monitoring
    await page.click("#monitor");
    await expect(waver.locator(".waver-vu-meter")).toBeVisible();

    // Open confirmation dialog
    const cancelBtn = waver.locator(".waver-cancel-btn");
    await cancelBtn.click();
    await expect(waver.locator(".waver-confirm-overlay")).toBeVisible();

    // Press Escape — should close confirmation first, not stop monitoring
    await page.keyboard.press("Escape");

    await expect(waver.locator(".waver-confirm-overlay")).not.toBeVisible();
    // Monitor should still be running
    await expect(waver.locator(".waver-vu-meter")).toBeVisible();
  });
});
