import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const TONE_WAV = path.join(__dirname, "fixtures", "tone.wav");

/**
 * Registers listeners for the given `waver:*` events on `#waver` and stashes each detail in
 * `window.__waverEvents[type]` (array, push order). The demo app doesn't reflect every event into
 * the DOM (e.g. play/stop/viewmodechange only log to console), so specs that need to assert on
 * those read this capture instead of scraping UI text.
 */
export async function captureWaverEvents(page: Page, types: string[]): Promise<void> {
  await page.evaluate((eventTypes) => {
    const w = window as unknown as { __waverEvents: Record<string, unknown[]> };
    w.__waverEvents = {};
    const waver = document.getElementById("waver")!;
    for (const type of eventTypes) {
      w.__waverEvents[type] = [];
      waver.addEventListener(type, (e) => {
        w.__waverEvents[type].push((e as CustomEvent).detail);
      });
    }
  }, types);
}

export async function getCapturedEvents<T = unknown>(page: Page, type: string): Promise<T[]> {
  return page.evaluate((eventType) => {
    const w = window as unknown as { __waverEvents: Record<string, unknown[]> };
    return w.__waverEvents?.[eventType] ?? [];
  }, type) as Promise<T[]>;
}

export async function loadTone(page: Page): Promise<void> {
  const waver = page.locator("wave-r");
  await waver.locator(".waver-file-input").setInputFiles(TONE_WAV);
  // #status has no waver:loadsuccess handler clearing it, so it's not a reliable decode-complete
  // signal (it's often already "" before decode finishes). Poll the element's own sample buffer,
  // which loadAudioBuffer() populates synchronously once decodeAudioData() resolves.
  await expect
    .poll(() => page.evaluate(() => (document.getElementById("waver") as any).getSamples().length))
    .toBeGreaterThan(0);
}

export async function configureWaver(page: Page, options: Record<string, any>): Promise<void> {
  await page.evaluate((opts) => {
    (document.getElementById("waver") as any).configure(opts);
  }, options);
}
