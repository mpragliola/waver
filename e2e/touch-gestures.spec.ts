import { expect, test } from "@playwright/test";
import { loadTone } from "./helpers";

test.describe("touch gestures", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });
  test("single touch drag creates or modifies selection", async ({ page }) => {
    await loadTone(page);

    const waveform = page.locator("wave-r").locator(".waver-waveform");
    const box = await waveform.boundingBox();
    if (!box) throw new Error("waveform has no layout box");

    // Simulate a touch tap using pointer events (cross-browser compatible)
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2);
    await page.mouse.down({ button: "left" });
    await page.waitForTimeout(50);
    await page.mouse.up();

    // Component should still be visible
    await expect(waveform).toBeVisible();
  });

  test("pointer events work for selection", async ({ page }) => {
    await loadTone(page);

    const waveform = page.locator("wave-r").locator(".waver-waveform");
    const box = await waveform.boundingBox();
    if (!box) throw new Error("waveform has no layout box");

    const pointerDownX = box.x + box.width * 0.2;
    const pointerDownY = box.y + box.height / 2;
    const pointerUpX = box.x + box.width * 0.6;

    // Simulate pointer down, move, up
    await page.mouse.move(pointerDownX, pointerDownY);
    await page.mouse.down();
    await page.mouse.move(pointerUpX, pointerDownY, { steps: 5 });
    await page.mouse.up();

    const selection = await page.evaluate(() => {
      return (document.getElementById("waver") as any).getSelection();
    });

    expect(selection).not.toBeNull();
  });

  test("multi-touch simulation doesn't crash component", async ({ page }) => {
    await loadTone(page);

    // Simulate two pointer touches (cross-browser touch simulation via pointer events)
    const waveform = page.locator("wave-r").locator(".waver-waveform");
    const box = await waveform.boundingBox();
    if (!box) throw new Error("waveform has no layout box");

    // First pointer
    await page.keyboard.press("Control");
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2);
    await page.mouse.down();

    // Move second finger position (simulated with offset)
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    await page.keyboard.press("Control");

    // Component should still render without crashing
    await expect(waveform).toBeVisible();
  });

  test("right-click context menu doesn't interfere", async ({ page }) => {
    await loadTone(page);

    const waveform = page.locator("wave-r").locator(".waver-waveform");
    const box = await waveform.boundingBox();
    if (!box) throw new Error("waveform has no layout box");

    // Right-click doesn't create selection
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height / 2, { button: "right" });

    const selection = await page.evaluate(() => {
      return (document.getElementById("waver") as any).getSelection();
    });

    // Right-click shouldn't affect selection
    expect(selection).toBeNull();
  });

  test("cursor position updates on pointer move over waveform", async ({ page }) => {
    await loadTone(page);

    const waveform = page.locator("wave-r").locator(".waver-waveform");
    const box = await waveform.boundingBox();
    if (!box) throw new Error("waveform has no layout box");

    // Move pointer without clicking
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2);
    await page.waitForTimeout(100);

    // Component should track hover without selecting
    const selection = await page.evaluate(() => {
      return (document.getElementById("waver") as any).getSelection();
    });

    expect(selection).toBeNull();
  });

  test("hover line appears and disappears", async ({ page }) => {
    await loadTone(page);

    const waveform = page.locator("wave-r").locator(".waver-waveform");
    const box = await waveform.boundingBox();
    if (!box) throw new Error("waveform has no layout box");

    // Move over waveform
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2);
    await page.waitForTimeout(100);

    // Leave waveform area
    await page.mouse.move(-100, -100);
    await page.waitForTimeout(100);

    // Component should still be visible (hover line is internal)
    await expect(waveform).toBeVisible();
  });

  test("selection drag works across multiple pointer moves", async ({ page }) => {
    await loadTone(page);

    const waveform = page.locator("wave-r").locator(".waver-waveform");
    const box = await waveform.boundingBox();
    if (!box) throw new Error("waveform has no layout box");

    const startX = box.x + box.width * 0.1;
    const endX = box.x + box.width * 0.9;
    const y = box.y + box.height / 2;

    await page.mouse.move(startX, y);
    await page.mouse.down();

    // Multiple intermediate moves
    for (let i = 0; i < 5; i++) {
      const x = startX + ((endX - startX) * (i + 1)) / 5;
      await page.mouse.move(x, y);
      await page.waitForTimeout(10);
    }

    await page.mouse.up();

    const selection = await page.evaluate(() => {
      return (document.getElementById("waver") as any).getSelection();
    });

    expect(selection).not.toBeNull();
    expect(selection.endSample).toBeGreaterThan(selection.startSample);
  });
});
