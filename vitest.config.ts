import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    // e2e/**/*.spec.ts are Playwright specs (run via `npm run e2e`), not vitest — Playwright's
    // test() throws when invoked outside its own runner, so they must never match vitest's glob.
    exclude: ["**/node_modules/**", "**/dist/**", "e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      exclude: ["src/react/**", "src/vue/**", "src/demo/**"],
    },
  },
});
