#!/usr/bin/env node
/**
 * Visual snapshots of the studio for design iteration.
 *
 * Boots the dev server (or expects one on :5173), drives Playwright through
 * the canonical fixture scenarios, and writes PNGs into `.screenshots/`.
 * Run after a CSS or rendering change to compare side-by-side.
 *
 *   pnpm screenshots                    # all scenarios at default zoom
 *   pnpm screenshots --keep-server      # leave the dev server running
 *
 * Output: `.screenshots/<scenario>.png`. The directory is gitignored.
 */

import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const here = dirname(fileURLToPath(import.meta.url));
const repo_root = join(here, '..');
const out_dir = join(repo_root, '.screenshots');

const VIEWPORT = { width: 1440, height: 900 };

const SCENARIOS = [
  { name: 'empty', path: '/' },
  {
    name: 'simple_sequence',
    path: '/view?src=http://127.0.0.1:5173/fixtures/simple_sequence.json',
  },
  {
    name: 'all_primitives',
    path: '/view?src=http://127.0.0.1:5173/fixtures/all_primitives.json',
  },
  {
    name: 'full_primitive_set',
    path: '/view?src=http://127.0.0.1:5173/fixtures/full_primitive_set.json',
  },
];

async function ensure_server_up(url, max_attempts = 40) {
  for (let i = 0; i < max_attempts; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not yet
    }
    await sleep(250);
  }
  throw new Error(`dev server never came up at ${url}`);
}

function copy_fixtures_to_public() {
  // Cheap: rely on the public/fixtures path the studio's vite serves.
  // Nothing to do here at runtime — this script assumes copies exist.
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const keep_server = args.has('--keep-server');

  await mkdir(out_dir, { recursive: true });
  copy_fixtures_to_public();

  const dev = spawn(
    'pnpm',
    ['--filter', '@repo/studio', 'dev', '--', '--port', '5173', '--strictPort'],
    { cwd: repo_root, stdio: 'pipe' },
  );
  // Drain stdout so the buffer never fills.
  dev.stdout.on('data', () => undefined);
  dev.stderr.on('data', () => undefined);

  let browser;
  try {
    await ensure_server_up('http://127.0.0.1:5173/');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();

    const manifest = [];
    for (const scenario of SCENARIOS) {
      // Clear localStorage so persistence does not skip auto-fit.
      await page.goto('http://127.0.0.1:5173/');
      await page.evaluate(() => {
        try {
          localStorage.clear();
        } catch {
          // ignore
        }
      });
      await page.goto(`http://127.0.0.1:5173${scenario.path}`);
      if (scenario.name !== 'empty') {
        await page.waitForSelector('.react-flow__node', { timeout: 10_000 });
      }
      // Give the layout + auto-fit chain time to land.
      await sleep(900);
      // Compose nodes mount collapsed (in-memory state in WeftCanvas.tsx);
      // the screenshots are meant to mirror the `pnpm metrics` view, which
      // is the *expanded* subgraph the user complains about. Click every
      // collapsed compose, re-settle, and repeat until none remain.
      let expand_passes = 0;
      while (expand_passes < 20) {
        const collapsed = await page.$$('.weft-node-compose-collapsed');
        if (collapsed.length === 0) break;
        for (const handle of collapsed) {
          await handle.click({ force: true }).catch(() => undefined);
        }
        await sleep(600);
        expand_passes += 1;
      }
      // Re-fit so the final framing matches what `pnpm metrics` captures.
      await page.locator('.react-flow__controls-fitview').click().catch(() => undefined);
      await sleep(400);
      const out_path = join(out_dir, `${scenario.name}.png`);
      await page.screenshot({ path: out_path, fullPage: false });
      manifest.push({ name: scenario.name, file: out_path });
      process.stdout.write(`✓ ${scenario.name}\n`);
    }
    await writeFile(join(out_dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    process.stdout.write(`\nwrote ${manifest.length} screenshots to ${out_dir}\n`);
  } finally {
    if (browser) await browser.close();
    if (!keep_server) {
      dev.kill('SIGTERM');
    }
  }
}

main().catch((err) => {
  process.stderr.write(`screenshot-scenarios failed: ${String(err)}\n`);
  process.exit(1);
});
