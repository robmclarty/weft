import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo_root = join(here, '..', '..');

const STUDIO_PORT = 4173;

/**
 * The Playwright e2e suite is invoked via scripts/run-e2e.mjs, which
 * probes Chromium availability and exits 0 cleanly when the sandbox
 * blocks the browser. This config therefore assumes the suite is
 * runnable when reached.
 */
export default defineConfig({
  testDir: here,
  fullyParallel: false,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 2 : 0,
  reporter: [
    ['list'],
    ['json', { outputFile: join(repo_root, '.check', 'e2e.json') }],
  ],
  outputDir: join(repo_root, '.check', 'e2e-artifacts'),
  ...(process.env['WEFT_E2E_NO_WEBSERVER'] === '1'
    ? {}
    : {
        webServer: {
          command:
            'pnpm --filter @repo/studio build && pnpm --filter @repo/studio preview',
          url: `http://127.0.0.1:${String(STUDIO_PORT)}`,
          reuseExistingServer: !process.env['CI'],
          timeout: 180_000,
          stdout: 'ignore' as const,
          stderr: 'pipe' as const,
        },
      }),
  use: {
    baseURL: `http://127.0.0.1:${String(STUDIO_PORT)}`,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
