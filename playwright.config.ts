import { defineConfig, devices } from '@playwright/test'
import { E2E_BASE_URL } from './e2e/fixtures/settings'

const SERVER_START_TIMEOUT_MS = 5 * 60 * 1000

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  outputDir: './test-results',
  globalSetup: './e2e/setup/globalSetup.ts',
  forbidOnly: true,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: 'list',
  use: {
    baseURL: E2E_BASE_URL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm exec tsx e2e/setup/startServer.ts',
    url: `${E2E_BASE_URL}/sign-in`,
    reuseExistingServer: false,
    timeout: SERVER_START_TIMEOUT_MS,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
