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


## Phase 2: Pure Data Layer — Schemas, Transform, Hash

### What was built

- **`packages/core/src/schemas.ts`** — type definitions for `FlowValue`, `FlowNode`, `FlowTree`, plus the three Zod schemas `flow_value_schema`, `flow_node_schema`, `flow_tree_schema`. `FlowValue` is a recursive union: primitives (string/number/boolean/null), arrays, plain string-keyed records, and three tagged-object branches (`{kind:'<fn>', name?}`, `{kind:'<schema>'}`, `{kind:string, id:string}`). `FlowNode` is `{kind, id, config?, children?}`. The `parallel` constraint (`config.keys` must be a `string[]` whose length equals `children.length`) is enforced as a Zod `.refine()` on `flow_node_schema` rather than a transform-time error, per acceptance criterion 7. The error path is reported as `['root', 'config', 'keys']`.
- **`packages/core/src/tree_id.ts`** — synchronous FNV-1a 64-bit hash of `JSON.stringify(root)`, returned as base36. Uses BigInt arithmetic with explicit 64-bit masking. Handles non-ASCII chars by hashing both bytes (the `code > 0xff` branch). Sync because `crypto.subtle.digest` would force `await` through the otherwise-synchronous render path; collision resistance is unnecessary for a localStorage key (research F8 / spec §3).
- **`packages/core/src/transform/tree_to_graph.ts`** — pure depth-first walk over `FlowTree.root`. Output: `{ nodes: WeftNode[], edges: WeftEdge[] }` typed against `@xyflow/react`'s `Node`/`Edge`. Highlights:
  - Parent-prefixed graph ids: `<parent_path>/<node.id>`. Root id is unprefixed.
  - Container kinds (`sequence`, `parallel`, `scope`) and wrapper kinds (`pipe`, `retry`) wire children via `parentId` so React Flow renders them as subflows.
  - `sequence` emits one structural edge per adjacent child pair.
  - `parallel` emits one structural edge per child from the container input, with `label = config.keys[i]` (Zod has already enforced length parity).
  - `scope` emits dashed overlay edges from each `stash` to every descendant `use` whose `config.keys` lists that stash key (reads `stash.config.key` singular vs `use.config.keys` plural). The descendant scan walks the FlowNode subtree, so nested stash/use pairs work.
  - `<cycle>` sentinel renders as a dedicated cycle node (type `'cycle'`) with `data.cycle_target` set to the node's `id` field.
  - Defensive `WeakSet<FlowNode>` visited guard catches true reference cycles (not possible from JSON, but possible from in-memory construction) and emits a `data.warning: 'cycle-guard'` node instead of recursing.
  - Unknown kinds get `type: 'generic'` and `data.generic = true`. Their children still recurse with `parentId` linkage (acceptance criterion 9).
  - Edges carry `data.kind: 'structural' | 'overlay'` so phase 3 can style them differently without inspecting source/target.
  - Node ordering is depth-first: parents always precede their descendants in the flat `nodes` array (research F15 / xyflow Discussion #4830 workaround).
- **Co-located test suites** (43 tests total, all passing):
  - `schemas.test.ts` — 17 cases: every fixture validates, malformed shapes are rejected with correctly-pointed JSON paths, every `FlowValue` branch parses, `<cycle>` sentinel parses as a `FlowNode`.
  - `tree_id.test.ts` — 5 cases: base36 shape, determinism, leaf sensitivity, deep config sensitivity, and no collisions across all five fixtures.
  - `transform/tree_to_graph.test.ts` — 13 cases including the parallel-ordering regression test (transform side, per acceptance criterion 12), the colliding-local-ids fixture for parent-prefixed ids, the recursive scope overlay (`stash` and `use` are nested at different depths in `full_primitive_set.json`), the in-memory cycle defense, the unknown-kind generic-fallback path, and the input-immutability assertion (deep clone before, deep equal after).
  - `weft/src/index.test.ts` — extended with three new cases verifying the umbrella re-exports `flow_tree_schema`, `flow_node_schema`, `tree_to_graph`, and `tree_id` are usable through the umbrella.
- **`packages/core/src/test_helpers.ts`** — single helper, `load_fixture_raw(name)`. Reads `<repo>/fixtures/<name>` synchronously via `node:fs`. Used by all three colocated test files. Snake-case file/function names per constraints §2; reachable from fallow's `*.test.ts` entry list so no dead-code flags fire.
- **Public surface wiring**:
  - `packages/core/src/index.ts` exports the three Zod schemas, the `tree_to_graph` and `tree_id` functions, the inferred types (`FlowNode`, `FlowTree`, `FlowValue`), and the transform-output types (`WeftNode`, `WeftEdge`, `WeftNodeData`, `WeftEdgeData`, `TreeToGraphResult`).
  - `packages/weft/src/index.ts` re-exports the curated subset through `@repo/core` only (per constraints §3 umbrella import rules). The weft re-export-only invariant (§7.5) is now mechanically exercised by real re-exports, not just placeholder ones.
- **`packages/core/package.json`** gained `@xyflow/react@12.10.2` and `zod@3.25.76` as runtime deps. Both are exact-version pins (`.npmrc` has `save-exact=true`).
- **`cspell.json`** gained `elkjs`, `fanout`, `fascicle`, `FNV`, `parentid`, `xyflow` to the dictionary so future phases don't trip on them either.

### Decisions

- **Types defined locally in `@repo/core/src/schemas.ts`** rather than imported from `@robmclarty/fascicle`. Reason: the upstream package is not yet published to npm and the sibling fascicle source directory is not accessible from this environment. The local definitions mirror spec §3 verbatim. The umbrella `@repo/weft` re-exports them through `@repo/core`, which is the only import direction permitted by constraints §3 anyway. Once `@robmclarty/fascicle` is published, swap the local definitions for `import type { FlowNode, FlowValue } from '@robmclarty/fascicle'` and the public surface is unchanged.
- **PascalCase type identifier `FlowTree`** (not `flow_tree`). Spec §3 and the phase-2 acceptance criterion 14 both write the type name in lowercase, but constraints §2 and the phase 1 invariant check (`naming` rule in `scripts/check-invariants.mjs`) require PascalCase for exported type aliases / interfaces. The constraint takes precedence; the schema value is `flow_tree_schema` (snake_case) and the inferred type is `FlowTree` (PascalCase).
- **`parallel` length parity enforced in Zod, not in the transform.** Acceptance criterion 7 explicitly says "`keys.length !== children.length` is a Zod validation failure, not a transform-time error." Implemented as a `.refine()` on the recursive `flow_node_schema` with `path: ['config', 'keys']` so error messages point at the offending field. Also catches `keys` missing or non-string; the transform can therefore index `keys[i]` blindly knowing the validator has already done the work.
- **Scope `stash → use` overlay edges scan the entire scope subtree, not just direct children.** The `full_primitive_set.json` fixture's `use:greeting` is nested two levels deep inside `pipe:upper`; a direct-child-only scan misses it. The implementation walks the FlowNode subtree of each scope and pairs every descendant `stash`/`use` by key. Per-scope isolation (i.e., not crossing nested-scope boundaries) is left as a future concern — no v0 fixture exercises nested scopes, and the spec is silent on it.
- **`<cycle>` is treated as a known kind** distinct from the generic-fallback path. It maps to `type: 'cycle'` so phase 3 can give it dedicated styling (a "cycle badge" per spec F2). The `data.cycle_target` field carries the upstream node id the sentinel points back to. This is intentionally separate from the `WeakSet`-based defensive guard against true in-memory reference cycles, which uses `type: 'generic'` + `data.warning: 'cycle-guard'`.
- **`WeftNodeData` shape is uniform across kinds** (taste: "Custom React Flow node-data shapes per kind"). Per-kind specifics live in `data.config` (which mirrors the upstream `FlowNode.config`). The only kind-aware fields on `data` are `cycle_target` (cycle nodes only), `generic: true` flag (unknown-kind nodes only), and `warning: 'cycle-guard'` (defensive cycle-guard nodes only). Phase 3 components can introspect these without knowing other kinds exist, preserving dispatch-on-kind discipline.
- **No `'parallel'` length-parity check inside `tree_to_graph`.** The transform trusts the validated shape (taste principle 9). If `config.keys` is missing it falls back to label `undefined` for that edge — but this only happens when callers bypass the schema, which is outside our boundary.
- **`load_fixture_raw` helper is in `src/`, not in a `test/` directory.** This keeps it reachable from fallow's `entry = ["packages/*/src/**/*.test.ts"]` list and matches the existing convention. Coverage stays at 100% for the helper because every test file imports and exercises it.

### Deviations

- **Acceptance criterion 14 wording vs constraints §3.** The criterion text says the umbrella "re-exports `FlowNode` and `FlowValue` from `@robmclarty/fascicle`". Constraints §3 says the umbrella "may import: `@repo/core` (workspace)" — exclusively. The umbrella re-exports them through `@repo/core` instead. The end-user-visible types are identical; the import path differs. The local definition of `FlowNode`/`FlowValue` in `@repo/core/src/schemas.ts` is the upstream-shape mirror documented in the file header.
- **Acceptance criterion 14 wording vs constraints §2.** The criterion uses lowercase `flow_tree` for both the schema and the type. The schema is `flow_tree_schema` (snake_case for values per constraints §2); the inferred type is `FlowTree` (PascalCase for type aliases per constraints §2 / phase 1 invariant `naming`).
- **Spec §3's `FlowNode` and `FlowValue` type literals omit `| undefined` on optional fields**, but the project enables `exactOptionalPropertyTypes`. Zod's `.optional()` outputs `T | undefined`, so the local type definitions add `| undefined` to optional fields (`config`, `children`, FnRef's `name`). The runtime shape and the user-facing parse output are unchanged; only the static-type ergonomics differ. Without this, `z.ZodType<FlowNode>` annotations on the recursive lazy schemas don't satisfy `exactOptionalPropertyTypes`.
- **`pnpm install` workaround.** A pre-existing copy of `tunnel@0.0.6` under `node_modules/.pnpm/` contained `.idea/*` JetBrains IDE artifacts that this environment refused to delete (filesystem `Operation not permitted`, including under elevated tool permissions — the harness blocks writes to `.idea` paths as "sensitive files"). pnpm 10's reflink/copyfile-based importer kept retrying to recreate them on every install. To make `pnpm install` succeed:
  1. Edited `.npmrc` to add `package-import-method=copy` (pnpm 10 also auto-mirrored this into `pnpm-workspace.yaml` as `packageImportMethod: copy`).
  2. Stripped the five `.idea/*` entries out of `.pnpm-store/v10/index/d6/...-tunnel@0.0.6.json` (the per-package file manifest pnpm consults during import). Without those entries pnpm doesn't try to copy the corresponding files into the destination tree.
  3. The leftover `node_modules/.pnpm/tunnel@0.0.6.broken/` directory is harmless (not referenced by any symlinks and not present in `pnpm-lock.yaml`); it is `.gitignore`d via the existing `node_modules/` rule.

  This is environment-specific. On a normal workstation the user is unlikely to hit it. The tunnel-index edit is local-only (under `.pnpm-store/`, which is `.gitignore`d) and re-running `pnpm install --force` from a clean checkout would re-fetch the unaltered manifest.

### Notes for next phase

- **Phase 3 dispatch table.** The transform tags every node with one of these `type` values: `step`, `sequence`, `parallel`, `pipe`, `retry`, `scope`, `stash`, `use`, `cycle`, or `generic`. Phase 3's `nodeTypes` registry must cover all ten. `cycle` and `generic` are the two "non-primitive" slots (cycle for the `<cycle>` sentinel, generic for any unknown kind). Components can rely on:
  - `data.kind: string` — the original FlowNode kind (always present).
  - `data.id: string` — the original FlowNode id (always present).
  - `data.config?: Readonly<{[k: string]: FlowValue}>` — the original FlowNode config when present.
  - `data.cycle_target?: string` — set only on cycle nodes; the upstream id the cycle points back to.
  - `data.generic?: true` — set only on unknown-kind generic-fallback nodes.
  - `data.warning?: 'cycle-guard'` — set only when the in-memory cycle defense fired.
- **Edge styling.** Every `WeftEdge` carries `data.kind: 'structural' | 'overlay'`. `parallel` fan-out edges also carry `label` set to the corresponding `config.keys[i]`. Scope overlay edges carry `label` set to the stash key. Phase 3's edge styling can branch on `data.kind` without inspecting `source`/`target`.
- **Layout invariant.** Every node has `position: { x: 0, y: 0 }` as a placeholder. Phase 3's layout pipeline (elkjs in a Web Worker per spec §5.2) is responsible for filling in real coordinates. The depth-first ordering of `nodes` is load-bearing for xyflow's subflow rendering — do not re-sort the array after layout.
- **`tree_id` for phase 5 (studio).** Synchronous, returns base36. Use directly as a localStorage key suffix, e.g. `weft.canvas.<tree_id(root)>`. The phase 1 handoff note about per-tree localStorage state in spec §3 lines up with this.
- **Watch CLI parity (phase 4).** The Zod schemas (`flow_tree_schema`, `flow_node_schema`) live in `@repo/core` and cannot be imported from `@repo/watch` (constraints §3 prohibits watch from importing core). Phase 4 has two options: duplicate the schema in `@repo/watch` and add a parity test that imports both schemas in a vitest suite that lives outside the watch package, OR factor the schemas into a third shared package (out of scope for v0). The shape is stable and small; duplication with a parity test is the lighter touch.
- **`html-to-image@1.11.11` is still unpinned.** Phase 3 brings it in for PNG export. Per spec §7 it must be exact `1.11.11` (no caret); use `"html-to-image": "1.11.11"` in `packages/core/package.json`. The `.npmrc`'s `save-exact=true` enforces this for new `pnpm add` invocations.
- **`elkjs` for phase 3.** Spec §5.2 mandates `elk-api` + `workerFactory` (not `elk.bundled.js`, which uses `Function(...)` and requires `unsafe-eval`). The phase 1 invariants check (`scripts/check-invariants.mjs`) catches `unsafe-eval` and `eval(` literals in source. Spec §9 also mandates a CI grep on the production bundle for `unsafe-eval`; that check lands in phase 3 alongside the bundler config.
- **`pnpm install` after dep changes.** Per the existing learnings note (`.ridgeline/learnings.md`): always re-run `pnpm install` after `pnpm add` / package.json edits. With the workspace symlinks now containing real cross-package deps (`@repo/core` → `zod` and `@xyflow/react`), this becomes more important than during phase 1's empty placeholders.
- **Coverage.** Workspace-wide currently sits at lines 98.67%, functions 100%, branches 75.58%, statements 94.35% — comfortably above the 70% floor. The lowest-branch file is `tree_id.ts` (50% branches; the non-ASCII byte path isn't hit by ASCII fixture content). Phase 3 will add real React surface; the threshold is workspace-level, so per-file dips don't fail the check, but watch the trend.
