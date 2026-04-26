#!/usr/bin/env node
/**
 * Probe whether headless Chromium can launch in this environment.
 *
 * Used by the repo-root `vitest.config.ts` to decide whether to enable the
 * `browser` project (real Chromium under @vitest/browser-playwright) or to
 * skip it. Some sandboxes (notably macOS sandboxed harnesses) block
 * Chromium's mach-port server even with `--no-sandbox`, which makes any
 * browser-mode test fail at launch rather than at assertion time.
 *
 * Exit codes:
 *   0  Chromium launched and shut down cleanly.
 *   1  Chromium failed to launch.
 *
 * Stdout (single line):
 *   ok      Chromium is available.
 *   skip    Chromium is unavailable (with reason on stderr).
 */

import { chromium } from 'playwright';

async function main() {
  let browser = null;
  try {
    browser = await chromium.launch({ headless: true });
    await browser.close();
    process.stdout.write('ok\n');
    process.exit(0);
  } catch (err) {
    process.stderr.write(`skip: ${err.message}\n`);
    process.stdout.write('skip\n');
    process.exit(1);
  } finally {
    if (browser !== null) {
      try { await browser.close(); } catch { /* swallowed */ }
    }
  }
}

main().catch((err) => {
  process.stderr.write(`detect-chromium error: ${err.message}\n`);
  process.exit(1);
});
