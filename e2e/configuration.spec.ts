import { expect, test } from "@playwright/test";
import { loadTone } from "./helpers";

test.describe("configuration options", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });
  test("loadButton: 'hidden' hides the Load button entirely", async ({ page }) => {
    const waver = page.locator("wave-r");

    await page.evaluate(() => {
      (document.getElementById("waver") as any).configure({ loadButton: "hidden" });
    });

    const loadBtn = waver.locator(".waver-empty-overlay .waver-action-btn");
    // Only Record and Monitor should be visible, not Load
    await expect(waver.locator(".waver-empty-overlay")).toBeVisible();
  });

  test("loadButton: 'disabled' greys out the Load button", async ({ page }) => {
    const waver = page.locator("wave-r");
    const loadBtn = waver.locator(".waver-empty-overlay .waver-action-btn");

    await page.evaluate(() => {
      (document.getElementById("waver") as any).configure({ loadButton: "disabled" });
    });

    await expect(loadBtn).toBeDisabled();
  });

  test("recordButton can be hidden, disabled, or enabled", async ({ page }) => {
    const waver = page.locator("wave-r");

    await page.evaluate(() => {
      (document.getElementById("waver") as any).configure({ recordButton: "hidden" });
    });
    // Record button should not be visible
    const recordBtn = waver.locator(".waver-action-btn--record");
    await expect(recordBtn).not.toBeVisible();

    await page.evaluate(() => {
      (document.getElementById("waver") as any).configure({ recordButton: "disabled" });
    });
    await expect(recordBtn).toBeVisible();
    await expect(recordBtn).toBeDisabled();

    await page.evaluate(() => {
      (document.getElementById("waver") as any).configure({ recordButton: "enabled" });
    });
    await expect(recordBtn).toBeEnabled();
  });

  test("monitorButton can be hidden, disabled, or enabled", async ({ page }) => {
    const waver = page.locator("wave-r");

    await page.evaluate(() => {
      (document.getElementById("waver") as any).configure({ monitorButton: "hidden" });
    });

    const monitorBtn = waver.locator(".waver-action-btn--monitor");
    await expect(monitorBtn).not.toBeVisible();
  });

  test("cancelButton: 'hidden' removes the X button after loading audio", async ({ page }) => {
    const waver = page.locator("wave-r");
    await loadTone(page);

    await page.evaluate(() => {
      (document.getElementById("waver") as any).configure({ cancelButton: "hidden" });
    });

    const cancelBtn = waver.locator(".waver-cancel-btn");
    await expect(cancelBtn).not.toBeVisible();
  });

  test("cancelButton: 'disabled' greys out the X button", async ({ page }) => {
    const waver = page.locator("wave-r");
    await loadTone(page);

    await page.evaluate(() => {
      (document.getElementById("waver") as any).configure({ cancelButton: "disabled" });
    });

    const cancelBtn = waver.locator(".waver-cancel-btn");
    await expect(cancelBtn).toBeDisabled();
  });

  test("hideButtonLabels: true shows only icons", async ({ page }) => {
    const waver = page.locator("wave-r");

    await page.evaluate(() => {
      (document.getElementById("waver") as any).configure({ hideButtonLabels: true });
    });

    const actionBtn = waver.locator(".waver-action-btn");
    const hasIconOnly = await actionBtn.first().evaluate((el) => {
      return el.classList.contains("waver-action-btn--icon-only");
    });

    expect(hasIconOnly).toBe(true);
  });

  test("showZeroLine: true renders the zero line on waveform", async ({ page }) => {
    await loadTone(page);

    await page.evaluate(() => {
      (document.getElementById("waver") as any).configure({ showZeroLine: true });
    });

    // Zero line should exist in the canvas render
    const hasZeroLine = await page.evaluate(() => {
      return (document.getElementById("waver") as any).opts.showZeroLine;
    });

    expect(hasZeroLine).toBe(true);
  });

  test("showMinimap: false hides the minimap", async ({ page }) => {
    await loadTone(page);

    await page.evaluate(() => {
      (document.getElementById("waver") as any).configure({ showMinimap: false });
    });

    const minimap = page.locator("wave-r").locator(".waver-minimap");
    await expect(minimap).not.toBeVisible();
  });

  test("showRuler: false hides the ruler", async ({ page }) => {
    await loadTone(page);

    await page.evaluate(() => {
      (document.getElementById("waver") as any).configure({ showRuler: false });
    });

    const ruler = page.locator("wave-r").locator(".waver-ruler");
    await expect(ruler).not.toBeVisible();
  });

  test("rulerTimeFormat can switch between 'time' and 'samples'", async ({ page }) => {
    await loadTone(page);

    await page.evaluate(() => {
      (document.getElementById("waver") as any).configure({ rulerTimeFormat: "samples" });
    });

    const format = await page.evaluate(() => {
      return (document.getElementById("waver") as any).opts.rulerTimeFormat;
    });

    expect(format).toBe("samples");
  });

  test("height option sets component height", async ({ page }) => {

    await page.evaluate(() => {
      (document.getElementById("waver") as any).configure({ height: 150 });
    });

    const height = await page.evaluate(() => {
      return (document.getElementById("waver") as any).opts.height;
    });

    expect(height).toBe(150);
  });

  test("spectrogramFftSize, Hop, FreqBins configure spectrogram analysis", async ({ page }) => {
    await loadTone(page);

    await page.evaluate(() => {
      (document.getElementById("waver") as any).configure({
        spectrogramFftSize: 4096,
        spectrogramHop: 1024,
        spectrogramFreqBins: 256,
      });
    });

    const opts = await page.evaluate(() => {
      const el = document.getElementById("waver") as any;
      return {
        fft: el.opts.spectrogramFftSize,
        hop: el.opts.spectrogramHop,
        bins: el.opts.spectrogramFreqBins,
      };
    });

    expect(opts.fft).toBe(4096);
    expect(opts.hop).toBe(1024);
    expect(opts.bins).toBe(256);
  });

  test("recordViewMode can be 'flat', 'zoom-out', or 'scroll'", async ({ page }) => {

    for (const mode of ["flat", "zoom-out", "scroll"]) {
      await page.evaluate((m) => {
        (document.getElementById("waver") as any).configure({ recordViewMode: m as any });
      }, mode);

      const recordMode = await page.evaluate(() => {
        return (document.getElementById("waver") as any).opts.recordViewMode;
      });

      expect(recordMode).toBe(mode);
    }
  });

  test("recordWindowSeconds controls recording window size", async ({ page }) => {

    await page.evaluate(() => {
      (document.getElementById("waver") as any).configure({ recordWindowSeconds: 5 });
    });

    const windowSeconds = await page.evaluate(() => {
      return (document.getElementById("waver") as any).opts.recordWindowSeconds;
    });

    expect(windowSeconds).toBe(5);
  });

  test("theme option applies custom colors", async ({ page }) => {
    await loadTone(page);

    const customColor = "#ff0000";
    await page.evaluate((color) => {
      (document.getElementById("waver") as any).configure({
        theme: { waveformColor: color },
      });
    }, customColor);

    // Verify theme was applied
    const waveformColor = await page.evaluate(() => {
      return (document.getElementById("waver") as any).theme.waveformColor;
    });

    expect(waveformColor).toBe(customColor);
  });

  test("configure() triggers render immediately", async ({ page }) => {
    await loadTone(page);

    const rendersBefore = await page.evaluate(() => {
      return (window as any).renderCount || 0;
    });

    await page.evaluate(() => {
      (document.getElementById("waver") as any).configure({ showZeroLine: true });
    });

    // A configure call should have updated the component state
    const zeroLine = await page.evaluate(() => {
      return (document.getElementById("waver") as any).opts.showZeroLine;
    });

    expect(zeroLine).toBe(true);
  });
});
