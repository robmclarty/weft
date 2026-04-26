import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo_root = join(here, '..', '..');

export default defineConfig({
  testDir: here,
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 2 : 0,
  reporter: [
    ['list'],
    ['json', { outputFile: join(repo_root, '.check', 'e2e.json') }],
  ],
  outputDir: join(repo_root, '.check', 'e2e-artifacts'),
  use: {
    baseURL: `file://${join(here, 'fixtures')}/`,
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
