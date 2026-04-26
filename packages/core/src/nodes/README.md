# Node components

One file per primitive — the dispatch table in `registry.ts` is the only place
that maps `kind` → component.

## Test split

- **`*.test.tsx` in `nodes/` and `canvas/`** run under `@vitest/browser` (real
  Chromium). Anything that asserts on measured DOM, handle positions, or React
  Flow's runtime layout belongs here. jsdom would silently pass with bogus
  geometry.
- **Pure prop-or-DOM-tree tests** (no measurement, no React Flow layout) can
  stay in `vitest run` Node mode under the default `unit` project.

The split is configured in the repo-root `vitest.config.ts` via a
`projects: [...]` array. Both projects feed coverage and run under one
`pnpm test` invocation.
