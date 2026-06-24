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
  // In CI, let Playwright own the lifecycle of both services so they stay up for
  // the full test run. Locally we leave this undefined and expect the app to be
  // started separately (see start-ecommerce-services skill).
  webServer: process.env.CI
    ? [
        {
          command: "uvicorn main:app --port 8000",
          cwd: "../../backend",
          url: "http://127.0.0.1:8000/api/health",
          timeout: 120_000,
          reuseExistingServer: false,
          stdout: "pipe",
          stderr: "pipe",
        },
        {
          command: "npm run dev",
          cwd: "../../frontend",
          url: "http://localhost:5173",
          timeout: 120_000,
          reuseExistingServer: false,
          stdout: "pipe",
          stderr: "pipe",
        },
      ]
    : undefined,
});
