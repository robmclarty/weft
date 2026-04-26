# Phase 1: Workspace + Check Pipeline Foundation

## Goal

Stand up the four-package pnpm workspace, the TypeScript and module-format conventions, the structural ast-grep rules, the mechanical CI checks for the architectural invariants in constraints.md §7, the Vitest harness with coverage thresholds, and the v0 fixtures. After this phase, `pnpm check` exits 0 against minimal placeholder source files in every package, every architectural-invariant check in constraints.md §7 is wired into the pipeline (not just §7.1 and §7.2 — all eight, even the ones that pass vacuously while source is empty), and subsequent phases have a real safety net to build against.

This phase ships no product code. Each package's `src/index.ts` is a placeholder (`@repo/weft` is a stub re-export so invariant 5 is exercisable from day one; the others export a single named stub symbol) so type-checking and coverage have something to chew on. The point is that the rails are laid and the train can run; phases 2–5 add the wheels and the cargo.

This phase is brownfield-aware. The repository already has `.ridgeline/` documents, `AGENTS.md`, `CLAUDE.md`, `fallow.toml`, `scripts/check.mjs`, `vitest.config.ts`, `stryker.config.mjs`, `cspell.json`, `sgconfig.yml`, a `rules/` directory, and a `pnpm-workspace.yaml`. The recent commit `fa4b587 chore(v0): align workspace packages to v0 spec naming` indicates the package manifests have been touched. Verify what exists before creating it. Where existing scaffolding is sound, leave it alone. Where it has drifted from spec §10 or constraints §1 / §2, align it. Where it is missing, add it.

## Context

The single source of truth for "done" is `pnpm check` exiting 0 (constraints.md "Check Command"). The check pipeline is defined in `scripts/check.mjs`; do not bypass it, and do not run a parallel check pipeline. New mechanical invariants land as additional steps inside this single command.

Inputs to this phase: spec.md §6, §7, §10, §11; constraints.md §1, §2, §3, §7, §9; taste.md (general orientation); the existing repository state.

Outputs from this phase consumed by phase 2 onward:

- A working four-package workspace where `pnpm install` resolves clean.
- A `pnpm check` that exits 0 against placeholder source.
- The `rules/*.yml` ast-grep rules wired into the pipeline.
- All eight mechanical invariants from constraints §7 wired (some pass vacuously until later phases produce source they can scan).
- The `fixtures/` directory committed (used by phase 2's transform tests, phase 3's layout tests, phase 4's schema-parity test, phase 5's integration tests).
- A coverage harness configured at the workspace root that every later phase's tests feed into.

## Acceptance Criteria

1. `pnpm check` exits 0 across the entire workspace.
2. `pnpm-workspace.yaml` lists `packages/core`, `packages/weft`, `packages/studio`, `packages/watch`. `pnpm install` completes without errors.
3. `packages/core/package.json` has name `@repo/core` (workspace-only). `packages/weft/package.json` has name `@repo/weft` and a `publishConfig`/published name of `@robmclarty/weft`. `packages/studio/package.json` has name `@repo/studio` (unpublished). `packages/watch/package.json` has name `@repo/watch`, a `publishConfig`/published name of `@robmclarty/weft-watch`, and declares `"bin": { "weft-watch": "./dist/bin.js" }`. Every package is ESM (`"type": "module"`).
4. `packages/weft` declares `@repo/core` as a workspace dependency. `packages/studio` declares `@repo/weft` as a workspace dependency and does **not** declare `@repo/core`. `packages/watch` declares neither `@repo/core` nor `@repo/weft`.
5. `tsconfig.base.json` sets `strict: true`, `module: "NodeNext"`, `moduleResolution: "NodeNext"`, `verbatimModuleSyntax: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`, `target: "ES2022"`. Each package extends it.
6. Each package has a placeholder `src/index.ts`. `@repo/weft/src/index.ts` is a re-export from `@repo/core` (so constraints §7 invariant 5 has real source to exercise). The other three export a single named stub symbol. No `export default` anywhere. Relative imports use the `.js` extension even from `.ts` / `.tsx` source. Cross-package imports go through workspace names.
7. `rules/no-class.yml` and `rules/no-default-export.yml` exist as ast-grep rules and are wired into `pnpm check`. Adding a `class` keyword or `export default` to any file under `packages/*/src/` fails the build (verified by a temporary fixture or equivalent self-check).
8. The architectural-invariant pre-test step from constraints §9 is wired into `pnpm check`. It runs **before** the test suite; if any invariant fails, the test suite does not run. The step covers all eight invariants from constraints §7:
    1. no `class` keyword in `packages/*/src/`
    2. no `export default` in `packages/*/src/`
    3. no `process.env` reads in `packages/*/src/`
    4. snake_case for exported value symbols and public parameter names; PascalCase for type aliases, interfaces, and React components
    5. `@repo/weft/src/` contains only re-exports (no function bodies, no JSX, no non-trivial expressions)
    6. `@repo/core/src/` has no value imports from `@robmclarty/fascicle` (only `import type`)
    7. `@repo/watch/src/` does not import `react`, `react-dom`, `@xyflow/react`, or `elkjs`
    8. `@repo/studio/src/` does not import `@repo/core` directly

   Each check runs on the current (mostly placeholder) source and passes vacuously where there is nothing yet to scan. Implementation choice (ast-grep rule, dependency-cruiser, package-graph script, custom node script) belongs to the builder; the requirement is that the check is *wired now*, not deferred.
9. CI greps the production bundle (or its source equivalent — there is no production bundle yet) for the literal strings `unsafe-eval` and `eval(` and fails the build if found (constraints §7 reference, spec §9 architectural validation). The check is wired now so phase 3's elkjs integration cannot regress it silently.
10. Vitest is configured at the root and per package. `pnpm check` runs the test suite with the §9 coverage floor (≥ 70% lines / functions / branches / statements) for every package that ships source. Coverage thresholds are enforced (build fails below the floor). With placeholder source containing one trivially-tested export per package, the floor is met.
11. `fixtures/` exists at the repository root and contains: `simple_sequence.json`, `nested_parallel.json`, `full_primitive_set.json`, `cycle_bug.json`, `parallel_ordering.json`. Each is either a valid `flow_tree` envelope (`{ version: 1, root }`) or a bare `FlowNode` (loader auto-wrap path); the file shapes match spec §3. The fixtures are committed now, before any code that consumes them exists, so phase 2's regression tests reference stable input (per spec §9 / research F15: the parallel_ordering fixture lands before the code it regresses against).
12. The `cspell.json`, `fallow.toml`, `sgconfig.yml`, `stryker.config.mjs`, and `vitest.config.ts` configurations at the repo root are reviewed and updated where needed to cover the four-package workspace. Stryker's incremental cache lives under `.check/` (per the recent commit `d325ff7 chore(stryker): move incremental cache under .check/`); do not regress that.
13. Root `README.md` exists. At minimum it states: how to install (`pnpm install`), how to run the check pipeline (`pnpm check`), the four packages and their roles in one sentence each, and a "phase 1 of 5" note pointing at `.ridgeline/builds/v0/phases/`. Detailed usage docs (watch loop, browser limitations, CSP) land in phase 5.

## Spec Reference

- spec.md §6 (Constraints — TypeScript strictness, ESM, Vite/React stack identifiers)
- spec.md §7 (Dependencies — versions and exact-pin requirements that workspace manifests must reflect; actual installation lands in later phases)
- spec.md §9 (Success Criteria — architectural validation, parallel-ordering fixture lands before its regression)
- spec.md §10 (File Structure — `packages/*` layout, `fixtures/`)
- spec.md §11 (Environment Variables — none required; reinforces constraints §2 no-process.env rule)
- constraints.md §1 (Language and Runtime — TypeScript settings, ESM, `.js` extension, NodeNext)
- constraints.md §2 (Code Style — hard rules, mechanically enforced)
- constraints.md §3 (Architectural Boundaries — package import rules)
- constraints.md §7 (Architectural Invariants — all eight wire here)
- constraints.md §9 (Testing Requirements — Vitest, coverage floor, pre-test invariant step)
- taste.md (mechanical enforcement over reviewer vigilance; small surfaces; pipelines that fail loudly)
- design.md §1 (Layered Packages), §2 (Package Responsibilities), §4 (File Structure)
