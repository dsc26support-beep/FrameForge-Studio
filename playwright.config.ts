import { defineConfig } from '@playwright/test';
import { findChromium } from './packages/render-adapter/src/tools';

const executablePath = findChromium() ?? undefined;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    launchOptions: { executablePath, args: executablePath && process.getuid?.() === 0 ? ['--no-sandbox'] : [] },
  },
  webServer: {
    command: 'npm run build && npx vite preview apps/web --port 4173 --host 127.0.0.1 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: 'electron', testMatch: /desktop\.spec\.ts/ },
    { name: 'desktop', testIgnore: /desktop\.spec\.ts/, use: { viewport: { width: 1280, height: 800 } } },
    { name: 'phone', testIgnore: /desktop\.spec\.ts/, use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } },
    { name: 'tablet', testIgnore: /desktop\.spec\.ts/, use: { viewport: { width: 820, height: 1180 }, hasTouch: true } },
  ],
});
