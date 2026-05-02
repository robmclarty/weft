import { spawnSync } from 'node:child_process';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';

/**
 * Probe whether headless Chromium can launch in this environment.
 *
 * Some sandboxed harnesses block Chromium's mach-port server even with
 * `--no-sandbox`, which makes any browser-mode test fail at launch rather
 * than at assertion time. When that happens we drop the `browser` project
 * from the Vitest run and surface a stderr notice; the other projects
 * always run and provide coverage. On a normal dev machine the probe
 * succeeds and the browser project runs as part of `pnpm check`.
 *
 * Bypass with `WEFT_FORCE_BROWSER=1` (e.g., in CI where the launch shape
 * differs and the probe is unreliable).
 */
function chromium_available(): boolean {
  if (process.env['WEFT_FORCE_BROWSER'] === '1') return true;
  if (process.env['WEFT_SKIP_BROWSER'] === '1') return false;
  const result = spawnSync('node', ['scripts/detect-chromium.mjs'], {
    encoding: 'utf8',
    timeout: 30_000,
  });
  if (result.status === 0) return true;
  process.stderr.write(
    '[vitest.config] Chromium unavailable in this environment; ' +
      'browser-mode tests will be skipped (see scripts/detect-chromium.mjs).\n',
  );
  return false;
}

/**
 * Probe whether outbound 127.0.0.1 connect is permitted. Some sandboxes
 * (notably macOS sandboxed harnesses) bind sockets fine but reject
 * connect() with EPERM, so the watch CLI's ws-client integration tests
 * cannot run. Tests inside packages/watch/src/ read this env var and skip
 * the connect-dependent describe blocks when it is `0`. The watch CLI
 * itself still runs in production; this is a test-environment limitation.
 */
function loopback_available(): boolean {
  if (process.env['WEFT_FORCE_LOOPBACK'] === '1') return true;
  if (process.env['WEFT_SKIP_LOOPBACK'] === '1') return false;
  const result = spawnSync('node', ['scripts/detect-loopback.mjs'], {
    encoding: 'utf8',
    timeout: 10_000,
  });
  if (result.status === 0) return true;
  process.stderr.write(
    '[vitest.config] Loopback TCP connect is blocked in this environment; ' +
      'watch-CLI ws-client tests will be skipped (see scripts/detect-loopback.mjs).\n',
  );
  return false;
}

const include_browser = chromium_available();
const loopback_ok = loopback_available();
process.env['WEFT_LOOPBACK_AVAILABLE'] = loopback_ok ? '1' : '0';

const projects: NonNullable<NonNullable<Parameters<typeof defineConfig>[0]['test']>['projects']> = [
  {
    extends: true,
    test: {
      name: 'unit',
      include: [
        'packages/*/src/**/*.{test,spec}.ts',
        'test/integration/**/*.{test,spec}.ts',
      ],
      // Component-level tests (.tsx) need a DOM and run in the react-jsdom
      // and (when chromium is available) browser projects. .ts files in
      // canvas/nodes/ — pure helpers like node_helpers.test.ts — stay here.
      exclude: [
        'packages/core/src/canvas/**/*.{test,spec}.tsx',
        'packages/core/src/nodes/**/*.{test,spec}.tsx',
        'packages/core/src/edges/**/*.{test,spec}.tsx',
        'packages/studio/src/**/*.{test,spec}.tsx',
        'packages/studio/src/state/**/use_*.{test,spec}.{ts,tsx}',
      ],
      environment: 'node',
    },
  },
  {
    extends: true,
    test: {
      name: 'react-jsdom',
      include: [
        'packages/core/src/canvas/**/*.{test,spec}.tsx',
        'packages/core/src/nodes/**/*.{test,spec}.tsx',
        'packages/core/src/edges/**/*.{test,spec}.tsx',
        'packages/studio/src/**/*.{test,spec}.tsx',
        'packages/studio/src/state/**/use_*.{test,spec}.{ts,tsx}',
      ],
      environment: 'jsdom',
      setupFiles: ['packages/core/test/setup_jsdom.ts'],
    },
  },
];

if (include_browser) {
  projects.push({
    extends: true,
    test: {
      name: 'browser',
      include: [
        'packages/core/src/canvas/**/*.{test,spec}.tsx',
        'packages/core/src/nodes/**/*.{test,spec}.tsx',
        'packages/core/src/edges/**/*.{test,spec}.tsx',
      ],
      browser: {
        enabled: true,
        provider: playwright(),
        headless: true,
        instances: [{ browser: 'chromium' }],
      },
    },
  });
}

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.{ts,tsx}'],
      exclude: [
        'packages/*/src/**/*.{test,spec}.{ts,tsx}',
        'packages/*/src/**/*.d.ts',
        'packages/*/src/test_helpers.ts',
        'packages/*/src/nodes/render_helpers.ts',
        'packages/studio/src/main.tsx',
      ],
      reporter: ['text', 'json-summary', 'json'],
      reportsDirectory: '.check/coverage',
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
      },
    },
    projects,
  },
});
