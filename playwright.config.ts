import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure'
  },
  projects: [
    { name: 'iphone-13', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
    { name: 'iphone-13-landscape', use: { ...devices['iPhone 13 landscape'], browserName: 'chromium' } },
    { name: 'pixel-7', use: { ...devices['Pixel 7'] } },
    { name: 'ipad-mini', use: { ...devices['iPad Mini'], browserName: 'chromium' } },
    { name: 'android-tablet', use: { ...devices['Galaxy Tab S9'], browserName: 'chromium' } }
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
