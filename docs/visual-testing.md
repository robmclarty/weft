# Visual testing

Two browser automation tools are wired into this repo. They have different jobs.

## Playwright — deterministic e2e

Use for scripted regression and smoke tests. Specs live under `test/e2e/`.

```bash
pnpm test:e2e                    # run all e2e specs
pnpm check --include e2e         # run e2e as part of pnpm check
```

Config: [test/e2e/playwright.config.ts](../test/e2e/playwright.config.ts).
Default smoke spec: [test/e2e/smoke.spec.ts](../test/e2e/smoke.spec.ts).
Fixtures (static HTML): [test/e2e/fixtures/](../test/e2e/fixtures/).

The `e2e` check is opt-in (like `mutation`). It does not run in default
`pnpm check` because Playwright launches a browser and is slower than the
unit-test loop. Wire it into a phase build by passing `--include e2e`.

Output:

- `.check/e2e.json` — Playwright JSON reporter
- `.check/e2e-artifacts/` — traces and failure screenshots

The studio's dev server is auto-booted by Playwright's `webServer` block
(`pnpm --filter @repo/studio build && preview`, port 4173). Override with
`WEFT_E2E_NO_WEBSERVER=1` if you've already launched the studio yourself.

In sandboxed environments where Chromium can't launch (some macOS harnesses,
Linux containers without nested user namespaces), `scripts/run-e2e.mjs`
detects the failure and exits 0 with a notice. Override with `WEFT_FORCE_E2E=1`
to always run.

## agent-browser — exploratory verification

Use when the builder needs an LLM-friendly browser loop:
`open` → `snapshot` (returns `ref=eN` element refs) → `click @eN` /
`fill @eN`. Annotated screenshots overlay numbered labels matching the
snapshot refs, which is exactly what an agent wants to see.

```bash
pnpm exec agent-browser open https://example.com
pnpm exec agent-browser snapshot -i
pnpm exec agent-browser click @e1
pnpm exec agent-browser screenshot --annotate ./shot.png
pnpm exec agent-browser close
```

Or load the bundled skill for the full reference:

```bash
pnpm exec agent-browser skills get core --full
```

Smoke script: [scripts/agent-browser-smoke.mjs](../scripts/agent-browser-smoke.mjs).
Run it any time to confirm the CLI and Chrome binary are healthy:

```bash
pnpm test:agent-browser
```

Output:

- `.check/screenshots/agent-browser-smoke.png` — annotated screenshot
- `.check/agent-browser-smoke.json` — step-by-step result

## When to reach for which

- Writing a regression test that should pass on every build → **Playwright**.
- Asking "does this UI actually work, does it look right" mid-task → **agent-browser**.
- Need a screenshot to attach to a result for a human reviewer → either; agent-browser is faster from the command line, Playwright is better when you already have a spec context.
