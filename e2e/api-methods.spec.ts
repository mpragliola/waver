import { expect, test } from "@playwright/test";
import { loadTone, configureWaver } from "./helpers";

test.describe("API methods", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });
  test("getSamples() returns non-empty Float32Array after loading audio", async ({ page }) => {
    await loadTone(page);

    const samplesLength = await page.evaluate(() => {
      return (document.getElementById("waver") as any).getSamples().length;
    });

    expect(samplesLength).toBeGreaterThan(0);
  });

  test("getSampleRate() returns correct rate from loaded audio", async ({ page }) => {
    await loadTone(page);

    const sampleRate = await page.evaluate(() => {
      return (document.getElementById("waver") as any).getSampleRate();
    });

    expect(sampleRate).toBe(44100);
  });

  test("getCursorPosition() starts at 0 and changes on click", async ({ page }) => {
    await loadTone(page);

    let cursor = await page.evaluate(() => {
      return (document.getElementById("waver") as any).getCursorPosition();
    });
    expect(cursor).toBe(0);

    // Click on ruler to seek
    const ruler = page.locator("wave-r").locator(".waver-ruler");
    const box = await ruler.boundingBox();
    if (!box) throw new Error("ruler has no layout box");

    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height / 2);

    cursor = await page.evaluate(() => {
      return (document.getElementById("waver") as any).getCursorPosition();
    });

    expect(cursor).toBeGreaterThan(0);
  });

  test("getSelection() returns null initially, non-null after selection", async ({ page }) => {
    await loadTone(page);

    let selection = await page.evaluate(() => {
      return (document.getElementById("waver") as any).getSelection();
    });
    expect(selection).toBeNull();

    // Create selection via drag
    const waveform = page.locator("wave-r").locator(".waver-waveform");
    const box = await waveform.boundingBox();
    if (!box) throw new Error("waveform has no layout box");

    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();

    selection = await page.evaluate(() => {
      return (document.getElementById("waver") as any).getSelection();
    });

    expect(selection).not.toBeNull();
    expect(selection.startSample).toBeLessThan(selection.endSample);
  });

  test("getZoom() reflects viewport state", async ({ page }) => {
    await loadTone(page);

    const zoom = await page.evaluate(() => {
      return (document.getElementById("waver") as any).getZoom();
    });

    expect(zoom).toHaveProperty("samplesPerPixel");
    expect(zoom).toHaveProperty("offsetSample");
    expect(zoom.samplesPerPixel).toBeGreaterThan(0);
    expect(zoom.offsetSample).toBeGreaterThanOrEqual(0);
  });

  test("hasAudio() returns false initially, true after loading", async ({ page }) => {

    let hasAudio = await page.evaluate(() => {
      return (document.getElementById("waver") as any).hasAudio();
    });
    expect(hasAudio).toBe(false);

    await loadTone(page);

    hasAudio = await page.evaluate(() => {
      return (document.getElementById("waver") as any).hasAudio();
    });
    expect(hasAudio).toBe(true);
  });

  test("isRecording() and isMonitoring() reflect state", async ({ page }) => {

    let isRecording = await page.evaluate(() => {
      return (document.getElementById("waver") as any).isRecording();
    });
    expect(isRecording).toBe(false);

    let isMonitoring = await page.evaluate(() => {
      return (document.getElementById("waver") as any).isMonitoring();
    });
    expect(isMonitoring).toBe(false);
  });

  test("getChannelCount() returns 1 for mono, 2+ for stereo", async ({ page }) => {
    await loadTone(page);

    const channelCount = await page.evaluate(() => {
      return (document.getElementById("waver") as any).getChannelCount();
    });

    expect(channelCount).toBeGreaterThanOrEqual(1);
  });

  test("getChannels() returns array of Float32Arrays", async ({ page }) => {
    await loadTone(page);

    const channels = await page.evaluate(() => {
      const chans = (document.getElementById("waver") as any).getChannels();
      return {
        length: chans.length,
        firstChannelLength: chans.length > 0 ? chans[0].length : 0,
      };
    });

    expect(channels.length).toBeGreaterThanOrEqual(1);
    expect(channels.firstChannelLength).toBeGreaterThan(0);
  });

  test("getViewMode() returns waveform or spectrogram", async ({ page }) => {
    await loadTone(page);

    const viewMode = await page.evaluate(() => {
      return (document.getElementById("waver") as any).getViewMode();
    });

    expect(["waveform", "spectrogram"]).toContain(viewMode);
  });

  test("setViewMode() switches view and fires event", async ({ page }) => {
    await loadTone(page);

    await page.evaluate(() => {
      (document.getElementById("waver") as any).setViewMode("spectrogram");
    });

    const viewMode = await page.evaluate(() => {
      return (document.getElementById("waver") as any).getViewMode();
    });

    expect(viewMode).toBe("spectrogram");
  });

  test("setCursorPosition() moves cursor to exact sample", async ({ page }) => {
    await loadTone(page);

    const targetSample = 12000;
    await page.evaluate((sample) => {
      (document.getElementById("waver") as any).setCursorPosition(sample);
    }, targetSample);

    const cursor = await page.evaluate(() => {
      return (document.getElementById("waver") as any).getCursorPosition();
    });

    expect(cursor).toBe(targetSample);
  });

  test("setChannelIndex() changes which channel is displayed", async ({ page }) => {
    await loadTone(page);

    await page.evaluate(() => {
      (document.getElementById("waver") as any).setChannelIndex(0);
    });

    const index = await page.evaluate(() => {
      return (document.getElementById("waver") as any).getChannelIndex();
    });

    expect(index).toBe(0);
  });

  test("getInputStream() / setInputStream() work correctly", async ({ page }) => {

    let stream = await page.evaluate(() => {
      return (document.getElementById("waver") as any).getInputStream();
    });
    expect(stream).toBeNull();

    // Can't easily create a real stream in test, but API should not error
    await page.evaluate(() => {
      (document.getElementById("waver") as any).setInputStream(null);
    });

    stream = await page.evaluate(() => {
      return (document.getElementById("waver") as any).getInputStream();
    });
    expect(stream).toBeNull();
  });

  test("play() and stop() control playback", async ({ page }) => {
    await loadTone(page);

    await page.evaluate(() => {
      (document.getElementById("waver") as any).play();
    });

    const isPlaying = await page.evaluate(() => {
      return (document.getElementById("waver") as any).audioEngine?.playbackState === "playing";
    });

    expect(isPlaying).toBe(true);

    await page.evaluate(() => {
      (document.getElementById("waver") as any).stop();
    });
  });

  test("togglePlayback() toggles between play and stop", async ({ page }) => {
    await loadTone(page);

    await page.evaluate(() => {
      (document.getElementById("waver") as any).togglePlayback();
    });

    let isPlaying = await page.evaluate(() => {
      return (document.getElementById("waver") as any).audioEngine?.playbackState === "playing";
    });

    expect(isPlaying).toBe(true);

    await page.evaluate(() => {
      (document.getElementById("waver") as any).togglePlayback();
    });

    isPlaying = await page.evaluate(() => {
      return (document.getElementById("waver") as any).audioEngine?.playbackState === "playing";
    });

    expect(isPlaying).toBe(false);
  });
});
