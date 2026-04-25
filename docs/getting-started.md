# Getting started

weft is a TypeScript/Node pnpm workspace with an agent-friendly `check` pipeline. Clone, install, verify.

## Prerequisites

- Node `>=24.0.0`
- pnpm `>=9.0.0`

## Install and verify

```bash
pnpm install
pnpm check
```

`pnpm check` is the single source of truth for "done". If it exits 0, the workspace is healthy. Output lands in `.check/` (`summary.json` aggregate, `<name>.json` per tool, `coverage/` from vitest).

## Repo layout

```text
packages/
  core/   @repo/core — pure library
  app/    @repo/app — depends on @repo/core
rules/    ast-grep structural rules
scripts/  check orchestrator
```

`core` and `app` are placeholder packages. The v0 build (`.ridgeline/builds/v0/spec.md`) replaces them with `@repo/core`, `@repo/weft`, `@repo/studio`, and `@repo/watch`.

Source lives under `packages/<name>/src/`, never at the repo root. Cross-package imports use workspace names (`@repo/core`), not relative paths. Tests are colocated: `foo.ts` next to `foo.test.ts`.

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

- [`README.md`](../README.md) — full reference, including the check matrix and release flow.
- [`AGENTS.md`](../AGENTS.md) — universal contract for coding agents.
- [`CLAUDE.md`](../CLAUDE.md) — Claude Code-specific notes.
