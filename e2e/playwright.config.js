const path = require('node:path');
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  reporter: process.env.CI
    ? [['json', { outputFile: 'e2e-results.json' }], ['list']]
    : 'list',
  // Timer tests run sequentially on the same worker; after the first test waits
  // out a 5-second countdown the CI runner can be busy enough that the second
  // test's WebSocket handshake exceeds the 10 000 ms Leave Room guard. One
  // retry absorbs that scheduling noise without masking real failures.
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://localhost:3000',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'node index.js',
    cwd: path.join(__dirname, '..', 'server'),
    env: {
      ...process.env,
      STATIC_DIR: path.join(__dirname, '..', 'client', 'dist'),
      PORT: '3000',
      // E2E suite is intentionally API-heavy; default production limits can 429 later tests
      API_RATE_LIMIT_MAX: '500',
      ROOM_RATE_LIMIT_MAX: '100',
    },
    port: 3000,
    reuseExistingServer: !process.env.CI,
  },
});
