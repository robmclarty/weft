/**
 * Topology assertions for the rendered canvas.
 *
 * These pin the visual-simplification acceptance criteria the user
 * called out 2026-05-03: only `compose` produces a visible outer box,
 * composites mount expanded by default, and every step is connected
 * (no floating nodes). The unit tests in
 * `packages/core/src/transform/__tests__/visual_simplification.test.ts`
 * cover the same criteria at the data-structure level; this spec
 * pins the actual rendered DOM so we catch integration regressions
 * (loader, layout, persistence) the unit suite would miss.
 */

import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo_root = join(here, '..', '..');
const fixtures_dir = join(repo_root, 'fixtures');

const VIEWPORT = { width: 1440, height: 900 } as const;
// React Flow's auto-fit + ELK layout settle inside ~900ms; pad to 1500
// for slower CI workers. The goal is a stable DOM, not the fastest
// possible settle.
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

async function load_fixture_via_paste(page: import('@playwright/test').Page, name: string): Promise<void> {
  const text = await readFile(join(fixtures_dir, name), 'utf8');
  await page.locator('textarea').fill(text);
  await page.getByRole('button', { name: 'load pasted JSON' }).click();
  await page.waitForSelector('[data-weft-kind]', { timeout: 5000 });
  await page.waitForTimeout(SETTLE_MS);
}

test('all_primitives: no sequence or scope chrome appears in the DOM', async ({ page }) => {
  await load_fixture_via_paste(page, 'all_primitives.json');
  const sequences = await page.locator('[data-weft-kind="sequence"]').count();
  const scopes = await page.locator('[data-weft-kind="scope"]').count();
  expect(sequences).toBe(0);
  expect(scopes).toBe(0);
});

test('all_primitives: every compose mounts expanded by default', async ({ page }) => {
  await load_fixture_via_paste(page, 'all_primitives.json');
  const composes = page.locator('[data-weft-kind="compose"]');
  const total = await composes.count();
  expect(total).toBeGreaterThanOrEqual(1);
  // Every compose should advertise expanded state on first mount —
  // the user opted into seeing the full machine, not a buried
  // collapsed block.
  for (let i = 0; i < total; i += 1) {
    const expanded = await composes.nth(i).getAttribute('data-weft-expanded');
    expect(expanded).toBe('true');
  }
});

test('all_primitives: every step is connected to the edge graph', async ({ page }) => {
  await load_fixture_via_paste(page, 'all_primitives.json');
  // Every visible step node must appear as the source or target of at
  // least one rendered edge. React Flow tags edges with
  // `data-source` / `data-target` on the .react-flow__edge wrapper.
  const orphans = await page.evaluate(() => {
    const edges = Array.from(document.querySelectorAll('.react-flow__edge'));
    const referenced = new Set<string>();
    for (const e of edges) {
      const s = e.getAttribute('data-source');
      const t = e.getAttribute('data-target');
      if (s !== null) referenced.add(s);
      if (t !== null) referenced.add(t);
    }
    const steps = Array.from(
      document.querySelectorAll<HTMLElement>(
        '.react-flow__node[data-weft-kind="step"]',
      ),
    );
    const out: string[] = [];
    for (const node of steps) {
      const id = node.getAttribute('data-id');
      if (id === null) continue;
      if (!referenced.has(id)) out.push(id);
    }
    return out;
  });
  expect(orphans, `floating step nodes: ${orphans.join(', ')}`).toEqual([]);
});
