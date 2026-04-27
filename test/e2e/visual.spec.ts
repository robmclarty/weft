/**
 * Visual regression: pin the studio's surface against committed snapshots so
 * the design language captured by the v0 re-evaluation does not silently
 * regress. Snapshots are pinned to a fixed viewport and a fixed fixture so
 * the comparison is meaningful in CI.
 *
 * Snapshots live in `test/e2e/visual.spec.ts-snapshots/`. To refresh after
 * an intentional design change, run with `--update-snapshots`. Cross-OS
 * pixel drift is the known footgun; CI runs on Linux Chromium and these
 * baselines are pinned to that environment.
 */

import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo_root = join(here, '..', '..');
const fixtures = join(repo_root, 'fixtures');

const VIEWPORT = { width: 1280, height: 720 } as const;
// React Flow's auto-fit kicks in via two requestAnimationFrame ticks after
// layout settles. 1500ms is comfortably past both for the small fixtures
// these specs use; the goal is a stable image, not the fastest possible
// settle.
const SETTLE_MS = 1500;

test.use({ viewport: VIEWPORT });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    try {
      window.localStorage.clear();
    } catch {
      // ignore — Safari quota / private mode
    }
  });
  await page.goto('/');
});

test('empty state is glanceable and guides the user to the loader', async ({
  page,
}) => {
  await expect(page).toHaveScreenshot('01-empty-state.png');
});

test('full primitive set loads with kind-aware visual encoding', async ({
  page,
}) => {
  const text = await readFile(join(fixtures, 'full_primitive_set.json'), 'utf8');
  await page.locator('textarea').fill(text);
  await page.getByRole('button', { name: 'load pasted JSON' }).click();
  await page.waitForSelector('[data-weft-kind="step"]');
  await page.waitForTimeout(SETTLE_MS);
  await expect(page).toHaveScreenshot('02-full-primitive-set.png');
});

test('inspector renders kind-aware retry summary and selection ring', async ({
  page,
}) => {
  const text = await readFile(join(fixtures, 'full_primitive_set.json'), 'utf8');
  await page.locator('textarea').fill(text);
  await page.getByRole('button', { name: 'load pasted JSON' }).click();
  await page.waitForSelector('[data-weft-kind="step"]');
  await page.waitForTimeout(SETTLE_MS);
  await page.evaluate(() => {
    const node = document.querySelector<HTMLElement>(
      '.react-flow__node[data-id="seq:everything/retry:flaky"]',
    );
    node?.click();
  });
  await page.waitForTimeout(200);
  await expect(page).toHaveScreenshot('03-inspector-retry.png');
});

test('search filter dims non-matching nodes and reports count', async ({
  page,
}) => {
  const text = await readFile(join(fixtures, 'full_primitive_set.json'), 'utf8');
  await page.locator('textarea').fill(text);
  await page.getByRole('button', { name: 'load pasted JSON' }).click();
  await page.waitForSelector('[data-weft-kind="step"]');
  await page.waitForTimeout(SETTLE_MS);
  await page.locator('#weft-search-input').fill('step');
  await page.waitForTimeout(200);
  await expect(page).toHaveScreenshot('04-search-step.png');
});

test('parse error shows distinct validation chrome', async ({ page }) => {
  await page.locator('textarea').fill('{not valid json');
  await page.getByRole('button', { name: 'load pasted JSON' }).click();
  await page.waitForSelector('[data-weft-loader-error="true"]');
  await expect(page).toHaveScreenshot('05-parse-error.png');
});

test('shortcuts modal is reachable via the help pill', async ({ page }) => {
  await page.locator('.weft-help-pill').click();
  await page.waitForSelector('[data-weft-shortcuts-modal="true"]');
  await expect(page).toHaveScreenshot('06-shortcuts-modal.png');
});

test('watch route surfaces disconnect banner and offers loader fallback', async ({
  page,
}) => {
  // Use a port no one is listening on. The studio will surface a banner.
  await page.goto('/watch?ws=9999');
  // Settle long enough to see the reconnecting banner (one retry cycle).
  await page.waitForTimeout(2200);
  await expect(page).toHaveScreenshot('07-watch-disconnected.png');
});
