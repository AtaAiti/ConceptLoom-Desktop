import { defineConfig } from '@playwright/test';
const preview = process.env.PLAYWRIGHT_PREVIEW === '1';
const baseURL = preview ? 'http://127.0.0.1:1421' : 'http://127.0.0.1:1420';
export default defineConfig({
  timeout: 120000,
  testDir: './e2e',
  use: { baseURL, viewport: { width: 1366, height: 768 } },
  webServer: {
    command: preview ? 'npx vite preview --host 127.0.0.1 --port 1421 --strictPort' : 'npm run dev',
    url: baseURL,
    reuseExistingServer: true,
  },
});
