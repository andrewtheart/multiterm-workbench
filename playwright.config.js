const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 15000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3199",
    headless: true,
    trace: "off"
  },
  webServer: {
    command: "node tests/support/bridge-supervisor.js",
    port: 3199,
    env: { PORT: "3199", HOST: "127.0.0.1" },
    reuseExistingServer: false,
    stdout: "ignore",
    stderr: "pipe",
    timeout: 30000
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }]
});
