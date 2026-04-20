import { defineConfig } from "vitest/config";

// Vitest configuration. We run most tests in jsdom so pure-logic modules
// that touch `localStorage` (persistence.js) work without mocking.
export default defineConfig({
  test: {
    environment: "jsdom",
    // Only pick up files under src/__tests__/ so we don't accidentally
    // try to test the canvas / audio modules that require a real browser.
    include: ["src/__tests__/**/*.test.{js,jsx}"],
  },
});
