import { expect, test } from "@playwright/test";
import { loadTone } from "./helpers";

test.describe("zoom and pan", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });
  test("mouse wheel zooms in when scrolling up (ctrl + wheel)", async ({ page }) => {
    await loadTone(page);

    const waveform = page.locator("wave-r").locator(".waver-waveform");
    const box = await waveform.boundingBox();
    if (!box) throw new Error("waveform has no layout box");

    const initialZoom = await page.evaluate(() => {
      return (document.getElementById("waver") as any).getZoom();
    });

    // Zoom in
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -200);
    await page.waitForTimeout(300);

    const zoomedZoom = await page.evaluate(() => {
      return (document.getElementById("waver") as any).getZoom();
    });

    // samplesPerPixel should decrease (more detail)
    expect(zoomedZoom.samplesPerPixel).toBeLessThan(initialZoom.samplesPerPixel);
  });

  test("mouse wheel zooms out when scrolling down", async ({ page }) => {
    await loadTone(page);

    // First zoom in
    const waveform = page.locator("wave-r").locator(".waver-waveform");
    const box = await waveform.boundingBox();
    if (!box) throw new Error("waveform has no layout box");

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -200);
    await page.waitForTimeout(300);

    const zoomedZoom = await page.evaluate(() => {
      return (document.getElementById("waver") as any).getZoom();
    });

    // Now zoom out
    await page.mouse.wheel(0, 200);
    await page.waitForTimeout(300);

    const unzoomedZoom = await page.evaluate(() => {
      return (document.getElementById("waver") as any).getZoom();
    });

    // samplesPerPixel should increase (less detail)
    expect(unzoomedZoom.samplesPerPixel).toBeGreaterThan(zoomedZoom.samplesPerPixel);
  });

  test("horizontal panning shifts the viewport", async ({ page }) => {
    await loadTone(page);

    // Zoom in first
    const waveform = page.locator("wave-r").locator(".waver-waveform");
    const box = await waveform.boundingBox();
    if (!box) throw new Error("waveform has no layout box");

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(0, -100);
    }
    await page.waitForTimeout(300);

    const initialZoom = await page.evaluate(() => {
      return (document.getElementById("waver") as any).getZoom();
    });

    // Pan with shift+scroll or drag
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.keyboard.press("Shift");
    await page.mouse.wheel(200, 0);
    await page.keyboard.press("Shift");
    await page.waitForTimeout(300);

    const pannedZoom = await page.evaluate(() => {
      return (document.getElementById("waver") as any).getZoom();
    });

    // offsetSample should have changed (viewport shifted)
    // samplesPerPixel should stay the same (no zoom change)
    expect(pannedZoom.offsetSample).not.toBe(initialZoom.offsetSample);
  });

  test("drag on waveform pans the view when zoomed in", async ({ page }) => {
    await loadTone(page);

    const waveform = page.locator("wave-r").locator(".waver-waveform");
    const box = await waveform.boundingBox();
    if (!box) throw new Error("waveform has no layout box");

    // Zoom in significantly
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let i = 0; i < 8; i++) {
      await page.mouse.wheel(0, -150);
    }
    await page.waitForTimeout(300);

    const initialOffset = await page.evaluate(() => {
      return (document.getElementById("waver") as any).getZoom().offsetSample;
    });

    // Drag to pan
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    const panOffset = await page.evaluate(() => {
      return (document.getElementById("waver") as any).getZoom().offsetSample;
    });

    // Offset should have changed due to panning drag
    expect(panOffset).not.toBe(initialOffset);
  });

  test("setZoom() animates to target zoom level", async ({ page }) => {
    await loadTone(page);

    const initialZoom = await page.evaluate(() => {
      return (document.getElementById("waver") as any).getZoom();
    });

    const targetZoom = { samplesPerPixel: initialZoom.samplesPerPixel / 2, offsetSample: initialZoom.offsetSample };

    await page.evaluate((zoom) => {
      (document.getElementById("waver") as any).setZoom(zoom);
    }, targetZoom);

    // Wait for animation
    await page.waitForTimeout(300);

    const newZoom = await page.evaluate(() => {
      return (document.getElementById("waver") as any).getZoom();
    });

    expect(newZoom.samplesPerPixel).toBeLessThan(initialZoom.samplesPerPixel);
  });

  test("setZoom(animate:false) changes zoom immediately without easing", async ({ page }) => {
    await loadTone(page);

    const initialZoom = await page.evaluate(() => {
      return (document.getElementById("waver") as any).getZoom();
    });

    const targetZoom = { samplesPerPixel: initialZoom.samplesPerPixel / 2, offsetSample: initialZoom.offsetSample };

    await page.evaluate((zoom) => {
      (document.getElementById("waver") as any).setZoom(zoom, false);
    }, targetZoom);

    // Should be immediate (no animation)
    const newZoom = await page.evaluate(() => {
      return (document.getElementById("waver") as any).getZoom();
    });

    expect(newZoom.samplesPerPixel).toBe(targetZoom.samplesPerPixel);
  });

  test("zoomToFull() resets to full waveform view", async ({ page }) => {
    await loadTone(page);

    const waveform = page.locator("wave-r").locator(".waver-waveform");
    const box = await waveform.boundingBox();
    if (!box) throw new Error("waveform has no layout box");

    // Zoom in
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let i = 0; i < 8; i++) {
      await page.mouse.wheel(0, -150);
    }
    await page.waitForTimeout(300);

    const zoomedZoom = await page.evaluate(() => {
      return (document.getElementById("waver") as any).getZoom();
    });

    // Zoom to full
    await page.click("#zoomFull");
    await page.waitForTimeout(300);

    const fullZoom = await page.evaluate(() => {
      return (document.getElementById("waver") as any).getZoom();
    });

    // offsetSample should be 0 (start of audio)
    expect(fullZoom.offsetSample).toBe(0);

    // samplesPerPixel should be much larger (full view)
    expect(fullZoom.samplesPerPixel).toBeGreaterThan(zoomedZoom.samplesPerPixel);
  });

  test("zoomchange event fires when zoom changes", async ({ page }) => {
    await loadTone(page);

    let zoomChanged = false;
    await page.evaluate(() => {
      (window as any).zoomChanged = false;
      document.getElementById("waver")?.addEventListener("waver:zoomchange", () => {
        (window as any).zoomChanged = true;
      });
    });

    const waveform = page.locator("wave-r").locator(".waver-waveform");
    const box = await waveform.boundingBox();
    if (!box) throw new Error("waveform has no layout box");

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -200);
    await page.waitForTimeout(300);

    zoomChanged = await page.evaluate(() => (window as any).zoomChanged);
    expect(zoomChanged).toBe(true);
  });

  test("viewport stays within valid bounds after zoom", async ({ page }) => {
    await loadTone(page);

    const totalSamples = await page.evaluate(() => {
      return (document.getElementById("waver") as any).getSamples().length;
    });

    const waveform = page.locator("wave-r").locator(".waver-waveform");
    const box = await waveform.boundingBox();
    if (!box) throw new Error("waveform has no layout box");

    // Zoom in hard
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let i = 0; i < 15; i++) {
      await page.mouse.wheel(0, -200);
    }
    await page.waitForTimeout(300);

    const zoom = await page.evaluate(() => {
      return (document.getElementById("waver") as any).getZoom();
    });

    // offsetSample should be within bounds
    expect(zoom.offsetSample).toBeGreaterThanOrEqual(0);
    expect(zoom.offsetSample).toBeLessThanOrEqual(totalSamples);
  });
});
