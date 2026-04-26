/**
 * AC 23: 200-node threshold engages OnlyRenderVisibleElements and the
 * minimap-while-pan toggle. We assert the canvas annotates `data-weft-large`
 * after loading a >200-node fixture.
 */

import { expect, test } from '@playwright/test';

function make_big_sequence(n: number): unknown {
  const children = Array.from({ length: n }, (_, i) => ({
    kind: 'step',
    id: `s:${String(i)}`,
  }));
  return {
    version: 1,
    root: { kind: 'sequence', id: 'big', children },
  };
}

test('large fixture engages perf hardening (AC 23)', async ({ page }) => {
  await page.goto('/');
  const fixture = JSON.stringify(make_big_sequence(220));
  await page.locator('textarea').fill(fixture);
  await page.getByRole('button', { name: 'load pasted JSON' }).click();
  await page.waitForSelector('[data-weft-canvas="true"]', { timeout: 30_000 });
  await expect(page.locator('[data-weft-canvas="true"]')).toHaveAttribute(
    'data-weft-large',
    'true',
  );
});
