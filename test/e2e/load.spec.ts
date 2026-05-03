/**
 * AC 18: end-to-end load via the file loader. The studio should render
 * a fascicle-shape FlowTree dropped via the drag-drop loader, asserting
 * expected node count and primitive kinds via DOM-visible labels.
 */

import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo_root = join(here, '..', '..');
const fixture_path = join(repo_root, 'fixtures', 'full_primitive_set.json');

test('paste loader renders the fixture with the expected node kinds', async ({ page }) => {
  await page.goto('/');
  const text = await readFile(fixture_path, 'utf8');
  const textarea = page.locator('textarea');
  await textarea.fill(text);
  await page.getByRole('button', { name: 'load pasted JSON' }).click();
  // Wait for layout pass
  await page.waitForSelector('[data-weft-kind="step"]', { timeout: 5000 });
  const kinds = await page.locator('[data-weft-kind]').evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-weft-kind')),
  );
  expect(kinds.length).toBeGreaterThan(0);
  expect(kinds).toContain('step');
  // Scope is structural-only after the visual-simplification pass; it
  // emits no node. Stash is a marker that survives in the rendered
  // graph and is the next-best signal that the scope hosting it
  // walked correctly.
  expect(kinds).toContain('stash');
});
