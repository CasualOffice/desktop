import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E config for the Casual Office launcher.
 *
 * Tests run against Vite's dev server, NOT the Tauri binary itself.
 * The launcher's Tauri dependencies (every `invoke()` call) are mocked
 * inside `tests/_setup.ts` via `page.addInitScript`, so the wizard /
 * launcher / settings / open-where flows can be exercised end-to-end
 * without booting Tauri.
 *
 * To run:
 *   pnpm test:e2e             (headless)
 *   pnpm test:e2e -- --ui     (Playwright inspector)
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:5170',
    trace: 'on-first-retry',
    actionTimeout: 5000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5170',
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe',
    timeout: 30_000,
  },
});
