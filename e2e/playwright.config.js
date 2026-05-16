const path = require('node:path');
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
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
    env: Object.assign({}, process.env, {
      STATIC_DIR: path.join(__dirname, '..', 'client', 'dist'),
      PORT: '3000',
    }),
    port: 3000,
    reuseExistingServer: !process.env.CI,
  },
});
