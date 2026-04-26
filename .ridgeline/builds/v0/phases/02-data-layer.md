# Phase 2: Pure Data Layer — Schemas, Transform, Hash

## Goal

Implement the entire data layer of `@repo/core`: Zod schemas for `flow_tree` and `FlowNode`, the `tree_to_graph` transform, the `tree_id` FNV-1a hasher, cycle handling, unknown-kind handling, and the parallel-ordering regression test on the transform side. Pure functions only — no React, no DOM, no Web Worker, no `@xyflow/react` runtime imports beyond types.

After this phase, every fixture committed in phase 1 round-trips through validation and produces deterministic graph data: nodes with globally-unique parent-prefixed ids, container/wrapper `parentId` wiring, structural edges (sequence ordering, parallel fan-out with `keys` labels) and overlay edges (scope `stash → use` dashed) tagged distinctly, cycle sentinels guarded by an internal visited set, and unknown kinds tagged for the generic-fallback component (which lands in phase 3) with their children still recursing. `tree_id(root)` returns a stable base36 digest sensitive to subtree changes.

The parallel-ordering regression test lands here on the transform side: load `parallel_ordering.json`, run the transform twice (once before and once after a config tweak), assert that the emitted edge list and child-node order is in declaration order both times. Phase 3 adds the *rendered* side of the same regression test (after `ParallelNode` exists and ELK has positioned its handles).

## Context

Phase 1 delivered a working four-package workspace, the structural ast-grep rules, the mechanical CI checks for constraints §7, the Vitest harness with coverage thresholds, and the v0 fixtures. The check pipeline exits 0 against placeholder source.

This phase fills in `packages/core/src/transform/`, `packages/core/src/schemas.ts`, the `tree_id` module, and the data-layer-relevant exports in `packages/core/src/index.ts`. The umbrella (`@repo/weft`) re-exports the new public symbols at the end of this phase. No React code yet; that's phase 3.

The single source of truth for "done" remains `pnpm check` exiting 0. New tests added in this phase run inside the existing pipeline.

Inputs: spec.md §3, §4.1 (the transform / schema / `tree_id` signatures), §5.1, §8 F2 / F6, §9 (regression test framing); constraints.md §1, §2, §3, §5.2, §5.3, §5.7, §9; taste.md principles 1, 4, 9, 10; design.md §3 (data flow); the fixtures from phase 1.

Outputs consumed by phase 3 (layout + canvas): the typed graph shape produced by `tree_to_graph` (the input to `layout_graph`); the `tree_id` hash (used by phase 5 for localStorage keys); the Zod schemas (which inform phase 4's parity-tested watch CLI schema).

## Acceptance Criteria

1. `pnpm check` exits 0 across the entire workspace after this phase completes.
2. Zod schemas in `@repo/core/src/schemas.ts` for `flow_tree` (envelope `{ version: 1, root: FlowNode }`) and `FlowNode` (kind, id, optional config, optional children) accept every valid fixture from phase 1 and reject malformed shapes with the offending JSON path. Function references and schema references in `config` parse as `{ kind: '<fn>', name?: string }` and `{ kind: '<schema>' }` per spec §3. Step references and `<cycle>` sentinels parse as `{ kind: string, id: string }` per spec §3's `FlowValue` definition.
3. `tree_to_graph(tree)` is exported from `@repo/core` and walks `tree.root` depth-first. It returns `{ nodes: RFNode[], edges: RFEdge[] }`. `RFNode` and `RFEdge` are imported as types only from `@xyflow/react` in this phase (no runtime canvas imports yet — those land in phase 3).
4. The flat `nodes` array is sorted depth-first so parents always precede children. Regression-tested per research F15 (xyflow Discussion #4830 documents an unresolved subflow ordering bug; the depth-first ordering is the workaround).
5. Every graph node id is the parent-path-prefixed form `<parent_path>/<node.id>`. A test fixture with colliding local ids at different depths verifies global uniqueness.
6. Container kinds (`sequence`, `scope`, `parallel`) emit nodes whose children carry `parentId` references for React Flow subflow rendering. Wrapper kinds (`retry`, `pipe`) emit a node with their single child as a `parentId`-linked child.
7. `sequence` emits one edge per adjacent child pair in declaration order. `parallel` emits one edge per child from the container input handle, labeled with the corresponding entry from `config.keys` (zipped with children by index; `keys.length !== children.length` is a Zod validation failure, not a transform-time error). `scope` emits dashed (non-structural) edges from each `stash` to every downstream `use` whose `config.keys` contains that stash key. Edges carry a stable `data.kind`-style tag distinguishing structural from overlay edges.
8. Cycle handling: `<cycle>` sentinel `FlowValue`s render as a cycle-badge graph node referencing the cycle target id. An internal visited-set guards `tree_to_graph` against infinite recursion if a real cycle slips past validation, emitting a warning-shaped node instead. Unit-tested.
9. Unknown kinds (any kind not in the v0 dispatch table — `step`, `sequence`, `parallel`, `pipe`, `retry`, `scope`, `stash`, `use`) produce a graph node tagged for the generic-fallback component (which lands in phase 3); children still recurse. A fixture with a fabricated kind verifies this without console errors.
10. Function references in `config` render as plain strings (`<fn:name>` / `<fn>`); schema references render as `<schema>`. A fixture exercises every `FlowValue` branch.
11. `tree_id(root)` is exported from `@repo/core`, **synchronous**, and returns a 64-bit FNV-1a digest of `JSON.stringify(root)` rendered as base36 (per spec §3 and research F8). FNV-1a is chosen over SHA-256 because `crypto.subtle.digest` is unconditionally async and would force `await` through the otherwise-synchronous render path. Unit tests verify determinism across runs, sensitivity to subtree changes (changing any leaf changes the hash), and absence of collisions across all fixtures.
12. **Parallel ordering regression — transform side.** A test loads `fixtures/parallel_ordering.json`, runs `tree_to_graph` twice (with a config tweak in between — for example, swapping a child's `id` or adding/removing an unrelated leaf elsewhere in the tree), and asserts the emitted edge list and child-node order is stable in declaration order both times. The corresponding rendered-side regression test lands in phase 3 once `ParallelNode` and ELK exist.
13. `tree_to_graph` does not mutate its input (constraints §5.7). A test deep-clones the input, runs the transform, then deep-equality-asserts the input against the clone.
14. The exports from this phase are wired through `@repo/weft/src/index.ts` as re-exports of the curated public surface: the Zod schemas for `flow_tree` and `FlowNode`, the `tree_to_graph` function, the `tree_id` function, the `flow_tree` type, plus `export type` re-exports of `FlowNode` and `FlowValue` from `@robmclarty/fascicle`. No JSX, no function bodies, no non-trivial expressions in `@repo/weft/src/` (constraints §7 invariant 5; the mechanical check from phase 1 is now exercised by real re-exports).
15. `@repo/core/src/` has no value imports from `@robmclarty/fascicle` — only `import type`. Re-verify that the phase 1 mechanical check still passes against the new code (constraints §7 invariant 6).
16. Coverage floor of 70% lines / functions / branches / statements is met for `@repo/core` and `@repo/weft` against the data-layer code shipped in this phase.

## Spec Reference

- spec.md §3 (Data Model — `FlowNode`, `flow_tree`, v0-covered kinds, `<cycle>` sentinels, `FlowValue` branches, canvas state hashing via `tree_id`)
- spec.md §4.1 (Library public API — `tree_to_graph` signature, Zod schema exports)
- spec.md §5.1 (Tree-to-graph conversion — depth-first ordering, parent-prefixed ids, scope overlay edges, flat-array ordering per research F15)
- spec.md §8 F2 (cycles), F6 (unknown kind)
- spec.md §9 (Success Criteria — Zod schema tests, `tree_to_graph` tests across depths, parallel-ordering regression that lands before `ParallelNode`)
- spec.md §10 (File Structure — `packages/core/src/transform/`, `schemas.ts`, `tree_id.ts`)
- constraints.md §1 (Language and Runtime), §2 (Code Style), §3 (Library import rules)
- constraints.md §5.2 (Unknown kinds render, never crash), §5.3 (Validation at the system boundary), §5.7 (No mutation of caller inputs)
- constraints.md §7 invariants 5, 6 (re-verified here against real re-exports and `import type` usage)
- constraints.md §9 (Testing Requirements)
- taste.md principles 1, 4, 9, 10
- design.md §3 (Data Flow — static path), §5 (Public Surface)
