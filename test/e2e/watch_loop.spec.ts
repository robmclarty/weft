/**
 * AC 19/20: spawn the real weft-watch CLI against a fixture, point the
 * studio at /watch?ws=PORT, modify the file and assert update within
 * 500ms; kill+restart and assert reconnect.
 */

import { expect, test } from '@playwright/test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn_watch, type WatchProcess } from './lib/spawn_watch.js';

const SEQ_TREE = {
  version: 1,
  root: {
    kind: 'sequence',
    id: 'seq:root',
    children: [
      { kind: 'step', id: 'step:a' },
      { kind: 'step', id: 'step:b' },
    ],
  },
};

const SEQ_TREE_PLUS = {
  version: 1,
  root: {
    kind: 'sequence',
    id: 'seq:root',
    children: [
      { kind: 'step', id: 'step:a' },
      { kind: 'step', id: 'step:b' },
      { kind: 'step', id: 'step:c' },
    ],
  },
};

test.describe('watch loop', () => {
  let dir: string;
  let path: string;
  let watch_proc: WatchProcess | null = null;

  test.beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'weft-e2e-'));
    path = join(dir, 'flow.json');
    await writeFile(path, JSON.stringify(SEQ_TREE), 'utf8');
  });

  test.afterEach(async () => {
    if (watch_proc !== null) {
      await watch_proc.close();
      watch_proc = null;
    }
    await rm(dir, { recursive: true, force: true });
  });

  test('AC 19: studio updates within 500ms of file change', async ({ page }) => {
    watch_proc = await spawn_watch(path);
    await page.goto(`/watch?ws=${String(watch_proc.port)}`);
    await page.waitForSelector('[data-weft-kind="step"]', { timeout: 10_000 });
    const before = await page.locator('[data-weft-kind="step"]').count();
    expect(before).toBe(2);
    await writeFile(path, JSON.stringify(SEQ_TREE_PLUS), 'utf8');
    await expect.poll(
      async () => page.locator('[data-weft-kind="step"]').count(),
      { timeout: 5000, intervals: [50, 100, 100, 200] },
    ).toBe(3);
  });

  test('AC 20: studio surfaces disconnect banner on CLI kill', async ({ page }) => {
    watch_proc = await spawn_watch(path);
    await page.goto(`/watch?ws=${String(watch_proc.port)}`);
    await page.waitForSelector('[data-weft-kind="step"]', { timeout: 10_000 });
    await watch_proc.close();
    watch_proc = null;
    await expect(page.locator('text=reconnecting')).toBeVisible({ timeout: 10_000 });
  });
});
