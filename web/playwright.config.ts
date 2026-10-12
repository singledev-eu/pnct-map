import { defineConfig, devices } from "@playwright/test";

// Browsers live in node_modules (PLAYWRIGHT_BROWSERS_PATH=0, set by `npm run test:e2e`).
// E2E_BASE_URL runs the suite against a deployed site instead of the local preview server.
const remote = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  // One retry, so a one-off timeout doesn't block a deploy. A test that passes only on the retry is
  // reported as "flaky": the list reporter counts it, and scripts/e2e-flaky-report.mjs (run after
  // the tests by npm run test:e2e / test:e2e:remote / deploy) prints a warning with its trace.
  // A test that fails both attempts still fails the run. (--fail-on-flaky-tests would also fail on
  // flaky tests; deliberately not used.)
  retries: 1,
  reporter: [["list"], ["json", { outputFile: "playwright-report/e2e-results.json" }]],
  use: {
    baseURL: remote ?? "http://localhost:4173/",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], channel: "chromium", viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: remote
    ? undefined
    : {
        command: "npm run preview",
        url: "http://localhost:4173/",
        reuseExistingServer: false,
        timeout: 30_000,
      },
});
