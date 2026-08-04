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

test("click-drag on the waveform creates a selection", async ({ page }) => {
  await captureWaverEvents(page, ["waver:selectionchanged"]);
  await loadTone(page);

  const waveform = page.locator("wave-r").locator(".waver-waveform");
  const box = await waveform.boundingBox();
  if (!box) throw new Error("waveform canvas has no layout box");

  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();

  await expect.poll(() => getCapturedEvents(page, "waver:selectionchanged")).toHaveLength(1);
  const [detail] = await getCapturedEvents<{ selection: { startSample: number; endSample: number } | null }>(
    page,
    "waver:selectionchanged"
  );
  expect(detail.selection).not.toBeNull();
  expect(detail.selection!.endSample).toBeGreaterThan(detail.selection!.startSample);
});

test("clicking the ruler seeks the cursor without creating a selection", async ({ page }) => {
  await captureWaverEvents(page, ["waver:cursorchange", "waver:selectionchanged"]);
  await loadTone(page);

  const ruler = page.locator("wave-r").locator(".waver-ruler");
  const box = await ruler.boundingBox();
  if (!box) throw new Error("ruler canvas has no layout box");

  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height / 2);

  await expect.poll(() => getCapturedEvents(page, "waver:cursorchange")).not.toHaveLength(0);
  expect(await getCapturedEvents(page, "waver:selectionchanged")).toHaveLength(0);
});

test("double-click clears an existing selection", async ({ page }) => {
  await captureWaverEvents(page, ["waver:selectionreset"]);
  await loadTone(page);

  const waveform = page.locator("wave-r").locator(".waver-waveform");
  const box = await waveform.boundingBox();
  if (!box) throw new Error("waveform canvas has no layout box");

  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();

  await page.mouse.dblclick(box.x + box.width * 0.4, box.y + box.height / 2);

  await expect.poll(() => getCapturedEvents(page, "waver:selectionreset")).toHaveLength(1);
});
