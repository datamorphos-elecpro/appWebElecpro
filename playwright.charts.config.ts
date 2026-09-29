import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/charts',
  workers: 2,
  use: { baseURL: 'http://127.0.0.1:3100', browserName: 'chromium', trace: 'retain-on-failure' },
  webServer: { command: 'npx vite --config tests/fixtures/vite.config.ts', url: 'http://127.0.0.1:3100/tests/fixtures/', reuseExistingServer: false },
});
