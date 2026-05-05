/**
 * v1 success criterion: spawn weft-watch with --events, append synthetic
 * trajectory JSONL lines, and assert per-step runtime overlay markers
 * (active class, error tag) appear on the canvas in near real-time.
 *
 * The synthetic JSONL mirrors fascicle's wire format (verified by the
 * drift-detector fixture in @repo/core/__tests__/fixtures); this test does
 * not depend on a fascicle install.
 */

import { expect, test } from '@playwright/test';
import { appendFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn_watch, type WatchProcess } from './lib/spawn_watch.js';

const TREE = {
  version: 1,
  root: {
    kind: 'sequence',
    id: 'seq:root',
    children: [
      { kind: 'step', id: 'fetch' },
      { kind: 'step', id: 'parse' },
    ],
  },
};

const span_start = (span_id: string, id: string): string =>
  `${JSON.stringify({ kind: 'span_start', span_id, name: 'step', id, run_id: 'run_001' })}\n`;

const span_end = (span_id: string, error?: string): string =>
  `${JSON.stringify(
    error === undefined
      ? { kind: 'span_end', span_id, run_id: 'run_001' }
      : { kind: 'span_end', span_id, run_id: 'run_001', error },
  )}\n`;

test.describe('live overlay (v1)', () => {
  let dir: string;
  let tree_path: string;
  let events_path: string;
  let watch_proc: WatchProcess | null = null;

  test.beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'weft-live-overlay-'));
    tree_path = join(dir, 'flow.json');
    events_path = join(dir, 'trajectory.jsonl');
    await writeFile(tree_path, JSON.stringify(TREE), 'utf8');
    await writeFile(events_path, '', 'utf8');
  });

  test.afterEach(async () => {
    if (watch_proc !== null) {
      await watch_proc.close();
      watch_proc = null;
    }
    await rm(dir, { recursive: true, force: true });
  });

  test('paints an active span as ochre and a closed-with-error span as a scar', async ({ page }) => {
    watch_proc = await spawn_watch(tree_path, ['--events', events_path]);
    await page.goto(`/watch?ws=${String(watch_proc.port)}`);
    // tree_to_graph composes node ids as `<parent_path>/<flow_id>`, so the
    // leaf `fetch` lives at `seq:root/fetch` in the React Flow `data-id`.
    const fetch_node = page.locator('.react-flow__node[data-id$="/fetch"] [data-weft-kind="step"]');
    const parse_node = page.locator('.react-flow__node[data-id$="/parse"] [data-weft-kind="step"]');
    await fetch_node.waitFor({ state: 'visible', timeout: 10_000 });

    // Open a span on `fetch` → its chrome should pick up `weft-runtime-active`.
    await appendFile(events_path, span_start('s1', 'fetch'));
    await expect.poll(
      async () => fetch_node.evaluate((el) => el.classList.contains('weft-runtime-active')),
      { timeout: 5000, intervals: [50, 100, 200, 200] },
    ).toBe(true);

    // Close it cleanly → `active` clears.
    await appendFile(events_path, span_end('s1'));
    await expect.poll(
      async () => fetch_node.evaluate((el) => el.classList.contains('weft-runtime-active')),
      { timeout: 5000, intervals: [50, 100, 200, 200] },
    ).toBe(false);

    // Open + close `parse` with an error → the error tag appears.
    await appendFile(events_path, span_start('s2', 'parse'));
    await appendFile(events_path, span_end('s2', 'network down'));
    await parse_node
      .locator('[data-weft-runtime-error="true"]')
      .waitFor({ state: 'visible', timeout: 5000 });
  });
});
