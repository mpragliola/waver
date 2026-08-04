import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TONE_WAV = path.join(__dirname, "fixtures", "tone.wav");
const CORRUPT_WAV = path.join(__dirname, "fixtures", "corrupt.wav");

test.describe("loading a file via the built-in Load button", () => {
  test("renders a waveform and clears the status line", async ({ page }) => {
    await page.goto("/");
    const waver = page.locator("wave-r");
    const fileInput = waver.locator(".waver-file-input");

    await fileInput.setInputFiles(TONE_WAV);

    // The Load/Record overlay buttons and the empty state disappear once samples decode.
    await expect(waver.locator(".waver-empty-overlay")).toBeHidden();
    await expect(page.locator("#status")).toHaveText("");
  });

  test("shows a decode error in the status line for an invalid file", async ({ page }) => {
    await page.goto("/");
    const waver = page.locator("wave-r");
    const fileInput = waver.locator(".waver-file-input");

    await fileInput.setInputFiles(CORRUPT_WAV);

    await expect(page.locator("#status")).toContainText("Failed to decode audio");
  });
});
