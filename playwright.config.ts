import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  // Each test launches a full Electron process; running many in parallel on
  // a loaded dev machine was causing spurious afterEach-hook timeouts
  // (resource contention, not real failures). One retry absorbs that
  // without masking a genuinely-broken test, which fails the same way twice.
  workers: 2,
  retries: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    screenshot: 'only-on-failure'
  }
})
