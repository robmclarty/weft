/**
 * Stryker mutation testing config.
 *
 * Invoked by the opt-in `mutation` step of `scripts/check.mjs` (and directly via
 * `pnpm check:mutation`). Incremental mode keeps re-runs cheap — the cache at
 * `.check/mutation.incremental.json` is gitignored and rebuilt locally per
 * contributor (cheap at current codebase size; revisit if cold runs grow long).
 */
export default {
  packageManager: 'pnpm',
  testRunner: 'vitest',
  plugins: ['@stryker-mutator/vitest-runner'],
  reporters: ['clear-text', 'html', 'json'],
  htmlReporter: { fileName: '.check/mutation/report.html' },
  jsonReporter: { fileName: '.check/mutation.json' },
  mutate: ['packages/*/src/**/*.ts', '!packages/*/src/**/*.test.ts', '!packages/*/src/**/*.spec.ts'],
  coverageAnalysis: 'perTest',
  incremental: true,
  incrementalFile: '.check/mutation.incremental.json',
  thresholds: {
    high: 80,
    low: 60,
    break: 50,
  },
  tempDirName: '.stryker-tmp',
  cleanTempDir: true,
};
