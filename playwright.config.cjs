const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/browser',
  timeout: 30000,
  workers: 1,
  use: { baseURL: 'http://localhost:3000', channel: 'msedge', headless: true },
  webServer: { command: 'node server.js', url: 'http://localhost:3000', reuseExistingServer: true },
  reporter: 'list'
});
