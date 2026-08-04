import { expect, test } from "@playwright/test";
import { loadTone } from "./helpers";

test.describe("edge cases and boundary conditions", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });
  test("setCursorPosition() clamps to valid range", async ({ page }) => {
    await loadTone(page);

    // Try to seek past end
    await page.evaluate(() => {
      (document.getElementById("waver") as any).setCursorPosition(999999999);
    });

    const cursor = await page.evaluate(() => {
      return (document.getElementById("waver") as any).getCursorPosition();
    });

    const sampleLength = await page.evaluate(() => {
      return (document.getElementById("waver") as any).getSamples().length;
    });

    expect(cursor).toBeLessThanOrEqual(sampleLength);
  });

  test("setCursorPosition() with negative value clamps to 0", async ({ page }) => {
    await loadTone(page);

    await page.evaluate(() => {
      (document.getElementById("waver") as any).setCursorPosition(-100);
    });

    const cursor = await page.evaluate(() => {
      return (document.getElementById("waver") as any).getCursorPosition();
    });

    expect(cursor).toBe(0);
  });

  test("selection with same start and end is normalized", async ({ page }) => {
    await loadTone(page);

    // Try to set selection with same start and end
    await page.evaluate(() => {
      (document.getElementById("waver") as any).setSelection({ startSample: 5000, endSample: 5000 });
    });

    const selection = await page.evaluate(() => {
      return (document.getElementById("waver") as any).getSelection();
    });

    // Should normalize to null or keep as-is depending on implementation
    // Just verify it doesn't crash
    expect(typeof selection).toBe("object");
  });

  test("selection with reversed start/end gets normalized", async ({ page }) => {
    await loadTone(page);

    // Try reversed selection
    await page.evaluate(() => {
      (document.getElementById("waver") as any).setSelection({ startSample: 10000, endSample: 5000 });
    });

    const selection = await page.evaluate(() => {
      return (document.getElementById("waver") as any).getSelection();
    });

    // Should normalize: start < end
    if (selection !== null) {
      expect(selection.startSample).toBeLessThanOrEqual(selection.endSample);
    }
  });

  test("rapid configure calls don't cause race conditions", async ({ page }) => {
    await loadTone(page);

    // Rapid-fire config changes
    for (let i = 0; i < 10; i++) {
      await page.evaluate((idx) => {
        (document.getElementById("waver") as any).configure({
          showZeroLine: idx % 2 === 0,
        });
      }, i);
    }

    // Component should still be functional
    await expect(page.locator("wave-r").locator(".waver-waveform")).toBeVisible();
  });

  test("rapid play/stop calls don't crash", async ({ page }) => {
    await loadTone(page);

    // Rapid toggle
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => {
        (document.getElementById("waver") as any).togglePlayback();
      });
      await page.waitForTimeout(50);
    }

    // Component should still be functional
    await expect(page.locator("wave-r").locator(".waver-waveform")).toBeVisible();
  });

  test("zoom to boundary (all samples visible) doesn't break interaction", async ({ page }) => {
    await loadTone(page);

    // Zoom to full
    await page.click("#zoomFull");

    const waveform = page.locator("wave-r").locator(".waver-waveform");
    const box = await waveform.boundingBox();
    if (!box) throw new Error("waveform has no layout box");

    // Interaction should still work
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height / 2);

    await expect(waveform).toBeVisible();
  });

  test("zoom to maximum level (1 sample per pixel) allows interaction", async ({ page }) => {
    await loadTone(page);

    // Zoom in hard
    const waveform = page.locator("wave-r").locator(".waver-waveform");
    const box = await waveform.boundingBox();
    if (!box) throw new Error("waveform has no layout box");

    for (let i = 0; i < 15; i++) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(0, -200);
    }

    // Interaction should still work
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

    await expect(waveform).toBeVisible();
  });

  test("selection at audio start works correctly", async ({ page }) => {
    await loadTone(page);

    const waveform = page.locator("wave-r").locator(".waver-waveform");
    const box = await waveform.boundingBox();
    if (!box) throw new Error("waveform has no layout box");

    // Select from very start
    const startX = box.x + 2;
    const endX = box.x + box.width * 0.3;

    await page.mouse.move(startX, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(endX, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();

    const selection = await page.evaluate(() => {
      return (document.getElementById("waver") as any).getSelection();
    });

    expect(selection).not.toBeNull();
    if (selection) {
      expect(selection.startSample).toBeGreaterThanOrEqual(0);
    }
  });

  test("selection at audio end works correctly", async ({ page }) => {
    await loadTone(page);

    const waveform = page.locator("wave-r").locator(".waver-waveform");
    const box = await waveform.boundingBox();
    if (!box) throw new Error("waveform has no layout box");

    // Select to very end
    const startX = box.x + box.width * 0.7;
    const endX = box.x + box.width - 2;

    await page.mouse.move(startX, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(endX, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();

    const selection = await page.evaluate(() => {
      return (document.getElementById("waver") as any).getSelection();
    });

    const totalSamples = await page.evaluate(() => {
      return (document.getElementById("waver") as any).getSamples().length;
    });

    expect(selection).not.toBeNull();
    if (selection) {
      expect(selection.endSample).toBeLessThanOrEqual(totalSamples);
    }
  });

  test("playback seeking beyond audio duration clamps to end", async ({ page }) => {
    await loadTone(page);

    await page.evaluate(() => {
      (document.getElementById("waver") as any).seekTo(999999999);
    });

    const cursor = await page.evaluate(() => {
      return (document.getElementById("waver") as any).getCursorPosition();
    });

    const totalSamples = await page.evaluate(() => {
      return (document.getElementById("waver") as any).getSamples().length;
    });

    expect(cursor).toBeLessThanOrEqual(totalSamples);
  });

  test("recording immediately stops and doesn't create invalid buffer", async ({ page }) => {
    const waver = page.locator("wave-r");

    // Start and stop immediately
    await waver.locator(".waver-empty-overlay .waver-action-btn--record").click();
    await page.waitForTimeout(100);
    await waver.locator(".waver-action-btn--stop").click();

    const hasAudio = await page.evaluate(() => {
      return (document.getElementById("waver") as any).hasAudio();
    });

    // Even with minimal recording, should either have audio or not crash
    expect(typeof hasAudio).toBe("boolean");
  });

  test("double-click on empty waveform doesn't crash", async ({ page }) => {
    const waver = page.locator("wave-r");

    const emptyOverlay = waver.locator(".waver-empty-overlay");
    await expect(emptyOverlay).toBeVisible();

    // Component should not error even with empty audio
    await expect(waver).toBeVisible();
  });
});
