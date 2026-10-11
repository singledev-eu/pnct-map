import { defineConfig, devices } from "@playwright/test";

// Browsers live in node_modules (PLAYWRIGHT_BROWSERS_PATH=0, set by `npm run test:e2e`).
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:4173/",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], channel: "chromium", viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: "npm run preview",
    url: "http://localhost:4173/",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
