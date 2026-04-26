#!/usr/bin/env node
/**
 * agent-browser smoke test.
 *
 * Exercises the full open → snapshot → click → eval → screenshot loop against
 * the same fixture used by the Playwright smoke spec. Proves the CLI, browser
 * binary, and screenshot capture are all wired up before the builder needs to
 * rely on them in phase 03 (layout-and-canvas).
 *
 * Output:
 *   .check/screenshots/agent-browser-smoke.png    annotated screenshot
 *   .check/agent-browser-smoke.json               machine-readable result
 *
 * Exit codes:
 *   0  smoke passed
 *   1  smoke failed (a step exited non-zero or an assertion did not hold)
 *   2  orchestrator error (IO failure)
 */

import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo_root = join(here, '..');
const fixture_url = `file://${join(repo_root, 'test', 'e2e', 'fixtures', 'blank.html')}`;
const screenshots_dir = join(repo_root, '.check', 'screenshots');
const screenshot_path = join(screenshots_dir, 'agent-browser-smoke.png');
const result_path = join(repo_root, '.check', 'agent-browser-smoke.json');

const SESSION = 'weft-smoke';

function run(args, label) {
  const start = Date.now();
  const result = spawnSync('pnpm', ['exec', 'agent-browser', ...args, '--session', SESSION], {
    cwd: repo_root,
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
  });
  return {
    label,
    args,
    exit_code: result.status ?? -1,
    duration_ms: Date.now() - start,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function fail(steps, reason) {
  return { ok: false, reason, steps };
}

function ok(steps) {
  return { ok: true, steps };
}

async function main() {
  await mkdir(screenshots_dir, { recursive: true });

  const steps = [];

  const open_step = run(['open', fixture_url], 'open');
  steps.push(open_step);
  if (open_step.exit_code !== 0) {
    return fail(steps, 'open failed');
  }

  const snapshot_step = run(['snapshot', '-i'], 'snapshot');
  steps.push(snapshot_step);
  if (snapshot_step.exit_code !== 0) {
    return fail(steps, 'snapshot failed');
  }
  if (!/\bref=e\d+/.test(snapshot_step.stdout)) {
    return fail(steps, 'snapshot did not return any ref=eN entries');
  }

  const click_step = run(['click', '#ping'], 'click');
  steps.push(click_step);
  if (click_step.exit_code !== 0) {
    return fail(steps, 'click failed');
  }

  const eval_step = run([
    'eval',
    "document.querySelector('#pong').getAttribute('data-state')",
  ], 'eval');
  steps.push(eval_step);
  if (eval_step.exit_code !== 0) {
    return fail(steps, 'eval failed');
  }
  if (!eval_step.stdout.includes('pinged')) {
    return fail(steps, `expected pong[data-state]=pinged, got: ${eval_step.stdout.trim()}`);
  }

  const screenshot_step = run(['screenshot', '--annotate', screenshot_path], 'screenshot');
  steps.push(screenshot_step);
  if (screenshot_step.exit_code !== 0) {
    return fail(steps, 'screenshot failed');
  }

  return ok(steps);
}

async function cleanup() {
  spawnSync('pnpm', ['exec', 'agent-browser', 'close', '--session', SESSION], {
    cwd: repo_root,
    encoding: 'utf8',
    stdio: 'ignore',
  });
}

try {
  const result = await main();
  await cleanup();

  const report = {
    timestamp: new Date().toISOString(),
    fixture: fixture_url,
    screenshot: result.ok ? screenshot_path : null,
    ...result,
  };
  await writeFile(result_path, `${JSON.stringify(report, null, 2)}\n`);

  if (result.ok) {
    process.stderr.write(`agent-browser smoke: ok (${result.steps.length} steps)\n`);
    process.exit(0);
  }

  process.stderr.write(`agent-browser smoke: FAIL — ${result.reason}\n`);
  for (const step of result.steps) {
    const mark = step.exit_code === 0 ? '✔' : '✘';
    process.stderr.write(`  ${mark} ${step.label}  exit=${step.exit_code}  ${step.duration_ms}ms\n`);
    if (step.exit_code !== 0 && step.stderr.trim()) {
      process.stderr.write(`    stderr: ${step.stderr.trim()}\n`);
    }
  }
  process.exit(1);
} catch (err) {
  await cleanup();
  process.stderr.write(`agent-browser-smoke: orchestrator error: ${err.message}\n`);
  process.exit(2);
}
