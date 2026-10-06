import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  workers: 2,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:4186',
    channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    {
      name: 'mobile',
      use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' },
    },
  ],
  webServer: [
    {
      command: 'npm run preview -- --port 4186 --strictPort',
      url: 'http://127.0.0.1:4186/amuwiki/',
      reuseExistingServer: false,
    },
    {
      command: 'node tests/serve-parent.mjs',
      url: 'http://127.0.0.1:4187/',
      reuseExistingServer: false,
    },
  ],
});
