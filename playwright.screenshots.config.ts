import { defineConfig, devices } from "@playwright/test";

// Separate config for the one-off documentation screenshot capture script
// (scripts/take-screenshots.ts). Kept apart from playwright.config.ts so this script is never
// picked up by `npm run e2e` (that config's testDir is "./e2e"; this one points at "./scripts").
const PORT = 4173;

export default defineConfig({
  testDir: "./scripts",
  testMatch: /take-screenshots\.ts/,
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
  },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: true,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: [
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
            "--autoplay-policy=no-user-gesture-required",
          ],
        },
        permissions: ["microphone"],
      },
    },
  ],
});
