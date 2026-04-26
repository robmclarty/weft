/**
 * AC 24: a11y baseline — scan the empty route with axe-core and assert
 * no `serious` or `critical` violations.
 */

import { expect, test } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo_root = join(here, '..', '..');

test('a11y: empty route has no critical/serious axe violations (AC 24)', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('[data-weft-route="empty"]');
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  // Persist the full report for moderate/minor findings (review only).
  await writeFile(
    join(repo_root, '.check', 'e2e-artifacts', 'a11y-empty.json'),
    JSON.stringify(results, null, 2),
  );
  const blocking = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious',
  );
  expect(blocking, JSON.stringify(blocking, null, 2)).toHaveLength(0);
});
