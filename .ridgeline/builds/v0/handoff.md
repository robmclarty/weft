## Phase 1: Workspace + Check Pipeline Foundation

### What was built

- **Workspace audit (no churn).** The four package manifests, tsconfigs, and existing scaffolding were already aligned to spec §10 / constraints §1-§3 from the prior `chore(v0): align workspace packages to v0 spec naming` commit. Verified intact and left alone:
  - `packages/core` (`@repo/core`), `packages/weft` (`@repo/weft` → publishes `@robmclarty/weft`), `packages/studio` (`@repo/studio`, unpublished), `packages/watch` (`@repo/watch` → publishes `@robmclarty/weft-watch`, with `bin: weft-watch`).
  - All `"type": "module"`. Workspace deps: weft→core, studio→weft, watch→neither.
  - `tsconfig.base.json` already has strict, NodeNext, verbatimModuleSyntax, noUncheckedIndexedAccess, exactOptionalPropertyTypes, target ES2022.
  - Placeholder `src/index.ts` + `version.ts` + `version.test.ts` exist in core/studio/watch; `weft/src/index.ts` is a `export { version } from '@repo/core'` re-export. Coverage floors are met by the trivial version tests.
- **`fixtures/` directory** at the repo root with the five v0 fixtures (`simple_sequence.json`, `nested_parallel.json`, `full_primitive_set.json`, `cycle_bug.json`, `parallel_ordering.json`). Each is a valid `flow_tree` envelope (`{ version: 1, root }`); shapes follow spec §3 (flat positional `children`, `config.keys` for `parallel`, `<cycle>` sentinel for the cycle fixture, `stash` / `use` inside `scope` for `full_primitive_set`).
- **`scripts/check-invariants.mjs`** — a single procedural Node script enforcing the constraints §7 invariants ast-grep does not already cover, plus the spec §9 unsafe-eval guard:
  - §7.3 no `process.env` reads in `packages/*/src/`
  - §7.4 snake_case (or SCREAMING_SNAKE_CASE) for exported value symbols; PascalCase for exported type aliases / interfaces; PascalCase tolerated for exported components in `.tsx`
  - §7.5 `packages/weft/src/` non-test files contain only `export ... from '...'` re-exports
  - §7.6 `packages/core/src/` has no value imports from `@robmclarty/fascicle` (`import type` is allowed)
  - §7.7 `packages/watch/src/` does not import `react`, `react-dom`, `@xyflow/react`, or `elkjs`
  - §7.8 `packages/studio/src/` does not import `@repo/core` directly
  - spec §9 `unsafe-eval` literal and `eval(` calls forbidden anywhere in package source
- **`invariants` step wired into `scripts/check.mjs`** between `dead` and `test` (so it runs *before* the test suite, matching constraints §9). Output goes to `.check/invariants.json`. `pnpm check` now runs 9 checks and exits 0.
- **`rules/no-default-export.yml`** widened to also match `.tsx` files (was previously `.ts` only) so future React components can't sneak in default exports.
- **README** updated: added `fixtures/` to the layout tree, added the `invariants` row to the check table, and added a "phase 1 of 5" pointer at `.ridgeline/builds/v0/phases/`.

### Decisions

- **Hybrid invariant enforcement**: ast-grep rules for §7.1 (`no-class.yml`) and §7.2 (`no-default-export.yml`); a single Node script (`check-invariants.mjs`) for §7.3-§7.8 + the unsafe-eval guard. Reason: ast-grep is great at AST-pattern matching but ergonomically painful for "import-from-X-but-not-as-type" and "this directory contains only re-exports" — a small text-scanning script with explicit comment stripping is cheaper to write, easier to read, and easier to extend. The script is procedural with no classes (constraints §2) and emits both stderr and a structured `.check/invariants.json` report so agents can parse it.
- **Comment stripping in the invariants script**: a tiny inline state machine handles `//`, `/* ... */`, and string literals (single, double, backtick) so the regex sweeps don't false-positive on commented-out code or string contents. Preserves line numbers by replacing block-comment characters with spaces / newlines.
- **Test files excluded from invariant 5** (`weft/src/` re-exports only). The intent is to gate production source, not test setup. `weft/src/index.test.ts` is allowed to import vitest helpers and call `expect`. The script's `TEST_FILE = /\.(test|spec)\.tsx?$/` filter applies uniformly.
- **`ast-grep` rule scoping**: `no-class.yml` is unscoped (applies to all TypeScript ast-grep finds via `sgconfig.yml`); `no-default-export.yml` is scoped to `packages/*/src/**/*.{ts,tsx}`. In practice both are equivalent here because TypeScript only lives under `packages/*/src/`.
- **Smoke-tested**, not committed as standing fixtures: I wrote temporary violation files for every invariant (each under `__tmp_*.ts`), confirmed each fired with the correct rule id and message, then deleted them. ast-grep caught `class` and `export default` (exit 1); the invariants script caught the other 6 + `eval(` (exit 1, 8 violations reported).

### Deviations

- **None of substance.** The phase spec says "implementation choice (ast-grep rule, dependency-cruiser, package-graph script, custom node script) belongs to the builder; the requirement is that the check is wired now". I picked the custom node script. It runs in 36 ms.
- The phase spec acceptance criterion 7 mentions "verified by a temporary fixture or equivalent self-check" — I did the self-check inline at build time and reverted, rather than committing fixture files. There are no `__test_violation__` files in the tree.

### Notes for next phase

- **Fixtures are committed and stable.** Phase 2's `tree_to_graph` regression tests can reference `fixtures/*.json` directly. Spec §3 cites them by name; shapes match. The `parallel_ordering.json` fixture is in place *before* the code it regresses against (per research F15 / spec §9).
- **The invariant script is forward-compatible.** As phase 2 onward adds real source, the same rules apply. If a phase needs to relax one (e.g., introduce typed errors that need `class extends Error`, per constraints §2), the change goes into `rules/no-class.yml` *ignores* AND a corresponding update to `check-invariants.mjs` if it ever extends to class detection. Today neither needs edits.
- **`.check/invariants.json`** is the structured output. Failure shape: `{ ok: false, violations: [{ file, line, rule, message }, ...] }`. Per-rule ids are stable: `no-process-env`, `no-unsafe-eval`, `naming`, `weft-reexport-only`, `no-fascicle-value-import`, `no-watch-react-imports`, `no-studio-core-import`.
- **The check pipeline order** is: types → lint → struct (ast-grep) → dead (fallow) → **invariants** → test → docs → links → spell. Invariants run before test, as constraints §9 mandates.
- **Coverage floor** is 70% across the workspace via `vitest.config.ts`. Today every package's stub `version.ts` has a passing test that hits the threshold trivially. Phase 2+ tests will start covering real code.
- **No new dependencies were added** in phase 1. Everything ran on the existing root devDeps. Phase 3 (layout/canvas) introduces `@xyflow/react`, `elkjs`, `zod`, `html-to-image@1.11.11`; phase 4 introduces chokidar/ws/commander; phase 5 introduces React Router and Tailwind. Watch the spec §7 pin on `html-to-image` (exact `1.11.11`, no caret) when it lands.
- **Stryker incremental cache** stays under `.check/` (already in `.gitignore`). I did not touch `stryker.config.mjs`, `cspell.json`, `fallow.toml`, `sgconfig.yml`, or `vitest.config.ts`; all already cover `packages/*/src/**`.
