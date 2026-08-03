import type { Page } from "@playwright/test";

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
