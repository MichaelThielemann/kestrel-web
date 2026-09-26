import { defineConfig, devices } from "@playwright/test";
import { BASE_URL, PORT, WORK_DIR } from "./support/env.ts";

process.env.KESTREL_E2E_PORT = String(PORT);
process.env.KESTREL_E2E_WORK_DIR = WORK_DIR;

export default defineConfig({
  testDir: "./specs",
  outputDir: "./test-results",
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFilePath}/{arg}{ext}",
  fullyParallel: false,
  workers: 1,
  forbidOnly: process.env.CI !== undefined,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000, toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: "disabled", caret: "hide", stylePath: "./support/screenshot.css" } },
  reporter: process.env.CI === undefined ? [["list"]] : [["list"], ["html", { outputFolder: "./playwright-report", open: "never" }]],
  globalSetup: "./support/global-setup.ts",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: BASE_URL,
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "fresh", testMatch: /fresh\/.*\.spec\.ts$/ },
    { name: "flows", testMatch: /flows\/.*\.spec\.ts$/, dependencies: ["fresh"] },
  ],
  webServer: {
    command: "node e2e/serve.ts",
    cwd: "..",
    url: `${BASE_URL}/api/ready`,
    reuseExistingServer: false,
    timeout: 600_000,
    stdout: "pipe",
    stderr: "pipe",
    gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
  },
});
