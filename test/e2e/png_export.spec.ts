/**
 * AC 21: PNG export — trigger from the studio, capture the blob via a
 * download handler, assert non-zero size with `image/png` MIME.
 */

import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo_root = join(here, '..', '..');

test('PNG export downloads a non-empty image/png blob', async ({ page }) => {
  await page.goto('/');
  const fixture = await readFile(
    join(repo_root, 'fixtures', 'simple_sequence.json'),
    'utf8',
  );
  await page.locator('textarea').fill(fixture);
  await page.getByRole('button', { name: 'load pasted JSON' }).click();
  await page.waitForSelector('[data-weft-kind="step"]', { timeout: 5000 });
  // Wait for layout to settle so html-to-image has stable bounds.
  await page.waitForTimeout(500);
  const download_promise = page.waitForEvent('download', { timeout: 15_000 });
  await page.locator('[data-weft-png-export="true"]').click();
  const download = await download_promise;
  const downloaded_path = await download.path();
  expect(downloaded_path).not.toBeNull();
  if (downloaded_path !== null) {
    const buf = await readFile(downloaded_path);
    expect(buf.length).toBeGreaterThan(0);
    // PNG magic number: 89 50 4E 47
    expect(buf[0]).toBe(0x89);
    expect(buf[1]).toBe(0x50);
    expect(buf[2]).toBe(0x4e);
    expect(buf[3]).toBe(0x47);
  }
  expect(download.suggestedFilename()).toMatch(/\.png$/);
});
