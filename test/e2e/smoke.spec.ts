import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const fixture_url = `file://${join(here, 'fixtures', 'blank.html')}`;

test('smoke: fixture renders, button toggles state, screenshot captured', async ({ page }, test_info) => {
  await page.goto(fixture_url);

  await expect(page).toHaveTitle('weft e2e smoke');
  await expect(page.locator('#hello')).toHaveText('Hello, weft.');
  await expect(page.locator('#pong')).toHaveAttribute('data-state', 'idle');

  await page.locator('#ping').click();

  await expect(page.locator('#pong')).toHaveAttribute('data-state', 'pinged');
  await expect(page.locator('#pong')).toHaveText('pong');

  const screenshot = await page.screenshot({ fullPage: true });
  await test_info.attach('smoke.png', { body: screenshot, contentType: 'image/png' });
});
