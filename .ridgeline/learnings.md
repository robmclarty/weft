# Learnings

Durable, cross-build observations about this repo. Append entries; do not rewrite history.

## Tooling

### `pnpm add -Dw` does not always relink workspace symlinks (2026-04-25)

After running `pnpm add -Dw <pkg>` (or other root-level dep mutations) in this workspace, the per-package `node_modules/@repo/*` symlinks may not be recreated. The next `pnpm check` then fails on `tsc` and `vitest` with `Cannot find module '@repo/core'` (or similar) even though the workspace package exists. A second `pnpm install` recreates the symlinks and the check goes green.

**Reproduction:** during the visual-testing scaffolding (April 2026), `pnpm add -Dw @playwright/test` and `pnpm add -Dw agent-browser` both reported success but left `packages/weft/node_modules/@repo/` empty. A follow-up `pnpm install` restored the links. Likely a pnpm v10.33 + workspace interaction; not the fault of any code in the repo.

**Apply:** Whenever a phase adds, removes, or upgrades a root-level dependency (`pnpm add -Dw`, `pnpm remove -w`, etc.), run a follow-up `pnpm install` before declaring the change done. If `pnpm check` reports `Cannot find module '@repo/<name>'` after a root-dep mutation, do not chase a `tsconfig` or import-path fix — run `pnpm install` first.
