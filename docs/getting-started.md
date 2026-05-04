# Getting started

weft is a TypeScript/Node pnpm workspace. Clone, install, verify, then load a fixture to see the canvas.

## Prerequisites

- Node `>=24.0.0`
- pnpm `>=9.0.0`

## Install and verify

```bash
pnpm install
pnpm check
```

`pnpm check` is the single source of truth for "done" (see [AGENTS.md](../AGENTS.md)). If it exits 0, the workspace is healthy. Output lands in `.check/` (`summary.json` aggregate, `<name>.json` per tool, `coverage/` from vitest).

## See it run

Boot the studio and load the kitchen-sink fixture:

```bash
pnpm --filter @repo/studio dev
# then open
# http://127.0.0.1:5173/view?src=http://127.0.0.1:5173/fixtures/all_primitives.json
```

Every fixture under `fixtures/` is served at `/fixtures/<name>.json` by the dev server. `all_primitives.json` and `the_loom.json` exercise every primitive.

For the live-watch loop, run [`@robmclarty/weft-watch`](../packages/watch/README.md) against a JSON file your fascicle test rewrites — see [docs/watch.md](./watch.md).

## Repo layout

```text
packages/
  core/     @repo/core   — schemas, transform, layout, canvas, node + edge renderers
  weft/     @repo/weft   — published as @robmclarty/weft (umbrella, re-exports only)
  studio/   @repo/studio — Vite SPA (unpublished)
  watch/    @repo/watch  — published as @robmclarty/weft-watch (Node CLI)
fixtures/   canonical FlowTree JSON used by the studio dev server and tests
rules/      ast-grep structural rules
scripts/    check orchestrator + screenshot/metrics tooling
test/       e2e specs (Playwright)
docs/       you are here
```

Source lives under `packages/<name>/src/`, never at the repo root. Cross-package imports use workspace names (`@repo/core`), not relative paths. Tests are colocated under `__tests__/` next to the file under test.

## Tight feedback loops

```bash
pnpm check --bail              # stop at first failure
pnpm check --only types,lint   # just the fast checks
pnpm test:watch                # watch-mode tests
pnpm exec tsc --noEmit         # types only
```

Run the full `pnpm check` once at the end.

## Adding a package

Create two files, then `pnpm install && pnpm check`:

```jsonc
// packages/<name>/package.json
{
  "name": "@repo/<name>",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" }
}
```

```ts
// packages/<name>/src/index.ts
export {};
```

Root configs already glob `packages/*/src/**`.

## What's next

- [`docs/architecture.md`](./architecture.md) — how a `FlowTree` becomes pixels.
- [`docs/primitives.md`](./primitives.md) — visual gallery of every primitive renderer.
- [`docs/studio.md`](./studio.md) — studio routes, loaders, inspector, shortcuts.
- [`docs/watch.md`](./watch.md) — the live-watch agent loop.
- [`docs/embedding.md`](./embedding.md) — mounting `<WeftCanvas>` in your own app.
- [`docs/layout.md`](./layout.md) — layout pipeline, metrics, libavoid spike.
- [`docs/visual-testing.md`](./visual-testing.md) — Playwright + agent-browser.
- [`AGENTS.md`](../AGENTS.md) — universal contract for coding agents.
- [`CLAUDE.md`](../CLAUDE.md) — Claude Code-specific notes.
