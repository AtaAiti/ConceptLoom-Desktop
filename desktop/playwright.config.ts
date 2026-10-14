import { defineConfig } from '@playwright/test';
export default defineConfig({
  timeout: 120000,
  testDir: './e2e',
  use: { baseURL: 'http://127.0.0.1:1420', viewport: { width: 1366, height: 768 } },
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:1420', reuseExistingServer: true },
});
