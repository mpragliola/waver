import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TONE_WAV = path.join(__dirname, "fixtures", "tone.wav");
const CORRUPT_WAV = path.join(__dirname, "fixtures", "corrupt.wav");

test.describe("loading a file via the built-in Load button", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });
  test("renders a waveform and clears the status line", async ({ page }) => {
    const waver = page.locator("wave-r");
    const fileInput = waver.locator(".waver-file-input");

    await fileInput.setInputFiles(TONE_WAV);

    // The Load/Record overlay buttons and the empty state disappear once samples decode.
    await expect(waver.locator(".waver-empty-overlay")).toBeHidden();
    await expect(page.locator("#status")).toHaveText("");
  });

  test("shows a decode error in the status line for an invalid file", async ({ page }) => {
    const waver = page.locator("wave-r");
    const fileInput = waver.locator(".waver-file-input");

    await fileInput.setInputFiles(CORRUPT_WAV);

    await expect(page.locator("#status")).toContainText("Failed to decode audio");
  });
});

test.describe("loading a file via drag-and-drop", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });
  const simulateDragDrop = async (page: any, fileToRead: string) => {
    const fs = await import("fs");
    const buffer = fs.readFileSync(fileToRead);
    const dataTransfer = await page.evaluateHandle(({ buffer }) => {
      const dt = new DataTransfer();
      const file = new File([new Uint8Array(buffer)], "test.wav", { type: "audio/wav" });
      dt.items.add(file);
      return dt;
    }, { buffer: Array.from(buffer) });

    const container = page.locator(".waver-container");
    await container.dispatchEvent("drop", { dataTransfer });
  };

  test("loads audio when dropping a single file on the empty component", async ({ page }) => {
    const waver = page.locator("wave-r");

    // Simulate drag-and-drop of audio file
    await simulateDragDrop(page, TONE_WAV);

    // The Load/Record overlay buttons and the empty state disappear once samples decode.
    await expect(waver.locator(".waver-empty-overlay")).toBeHidden();
    await expect(page.locator("#status")).toHaveText("");
  });

  test("shows confirmation dialog when dropping a file over existing audio", async ({ page }) => {
    const waver = page.locator("wave-r");

    // Load initial audio
    await simulateDragDrop(page, TONE_WAV);
    await expect(waver.locator(".waver-empty-overlay")).toBeHidden();

    // Drop another file — should show confirmation
    await simulateDragDrop(page, TONE_WAV);
    await expect(waver.locator(".waver-confirm-overlay")).toBeVisible();
  });

  test("clears and loads new file when clicking 'Clear' in confirmation", async ({ page }) => {
    const waver = page.locator("wave-r");

    // Load initial audio
    await simulateDragDrop(page, TONE_WAV);
    await expect(waver.locator(".waver-empty-overlay")).toBeHidden();

    // Drop another file
    await simulateDragDrop(page, TONE_WAV);
    await expect(waver.locator(".waver-confirm-overlay")).toBeVisible();

    // Click Clear button
    const clearBtn = waver.locator(".waver-confirm-clear");
    await clearBtn.click();

    // Confirmation should close and waveform should remain loaded
    await expect(waver.locator(".waver-confirm-overlay")).not.toBeVisible();
    await expect(waver.locator(".waver-empty-overlay")).toBeHidden();
  });

  test("keeps existing audio when clicking 'Keep' in confirmation", async ({ page }) => {
    const waver = page.locator("wave-r");

    // Load initial audio
    await simulateDragDrop(page, TONE_WAV);
    await expect(waver.locator(".waver-empty-overlay")).toBeHidden();

    // Drop another file
    await simulateDragDrop(page, TONE_WAV);
    await expect(waver.locator(".waver-confirm-overlay")).toBeVisible();

    // Click Keep button
    const keepBtn = waver.locator(".waver-confirm-keep");
    await keepBtn.click();

    // Confirmation should close and waveform should remain loaded
    await expect(waver.locator(".waver-confirm-overlay")).not.toBeVisible();
    await expect(waver.locator(".waver-empty-overlay")).toBeHidden();
  });

  test("shows decode error for invalid file dropped", async ({ page }) => {

    await simulateDragDrop(page, CORRUPT_WAV);

    await expect(page.locator("#status")).toContainText("Failed to decode audio");
  });
});
