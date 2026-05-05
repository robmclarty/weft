import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const smoke_url = `file://${join(here, 'smoke.html')}`;

test('smoke: page renders, button toggles state, screenshot captured', async ({ page }, test_info) => {
  await page.goto(smoke_url);

  await expect(page).toHaveTitle('weft e2e smoke');
  await expect(page.locator('#hello')).toHaveText('Hello, weft.');
  await expect(page.locator('#pong')).toHaveAttribute('data-state', 'idle');

  await page.locator('#ping').click();

  await expect(page.locator('#pong')).toHaveAttribute('data-state', 'pinged');
  await expect(page.locator('#pong')).toHaveText('pong');

  const screenshot = await page.screenshot({ fullPage: true });
  await test_info.attach('smoke.png', { body: screenshot, contentType: 'image/png' });
});
