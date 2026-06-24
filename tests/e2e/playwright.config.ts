import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for FreshCart E2E.
 *
 * Requires the app running locally (frontend on 5173, backend on 8000).
 * Start them with the `start-ecommerce-services` skill, or point BASE_URL at a
 * staging deployment for release-gate runs.
 */
export default defineConfig({
  testDir: ".",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
