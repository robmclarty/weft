# Phase 3: Layout + Canvas + Library Umbrella

## Goal

Stand up the visual layer: workerized ELK layout with a deterministic main-thread fallback, the `WeftCanvas` React component with all nine custom node types (`StepNode`, `SequenceNode`, `ParallelNode`, `PipeNode`, `RetryNode`, `ScopeNode`, `StashNode`, `UseNode`, `GenericNode`), the imperative `canvas_api` (focus, fit, viewport, PNG export), the performance hardening on the canvas itself (memoization, `OnlyRenderVisibleElements` toggle, minimap-disable-while-panning), and the curated `@repo/weft` umbrella that re-exports everything an external consumer needs.

After this phase, a React app can `import { WeftCanvas } from '@robmclarty/weft'` and render any `FlowNode` tree fascicle emits. Pan, zoom, click-to-inspect, fit-view, and export-to-PNG all work. The seven MVP composition primitives (`step`, `sequence`, `parallel`, `pipe`, `retry`, `scope` with internal `stash` / `use`) plus the generic-fallback component for the remaining nine kinds all render with the visual encodings spec §4.3 prescribes. Layout runs in a Web Worker via the `elk-api` + `workerFactory` pattern, with a graceful in-thread fallback when `Worker` is unavailable. The `unsafe-eval` bundle grep wired in phase 1 stays green now that elkjs is actually present.

The parallel-ordering regression test gains its second half here: loaded fixture, layout, re-layout after a tweak, assert child render order stable end-to-end.

## Context

Phase 2 delivered the data layer: Zod schemas, `tree_to_graph`, `tree_id`. The umbrella re-exports those. No React or layout code exists yet.

This phase fills in `packages/core/src/layout/`, `packages/core/src/canvas/`, `packages/core/src/nodes/`, and extends `@repo/core/src/index.ts` and `@repo/weft/src/index.ts` with the library's full public surface. The studio (phase 5) will consume this surface; phase 4's watch CLI is independent and does not touch any of this code.

The single source of truth for "done" remains `pnpm check` exiting 0.

Inputs: spec.md §4.1, §4.3, §4.4, §5.2, §5.6, §6, §7, §8 F3 / F4 / F5 / F6 / F11, §9, §10, §12; constraints.md §3, §4, §5.1, §5.2, §5.7, §7 invariants 1, 2, 5, 6 (re-verified); design.md §1, §2, §5; the data-layer outputs from phase 2.

Outputs consumed by phase 5: the entire library public surface via `@robmclarty/weft`, including `WeftCanvas`, `canvas_api`, `tree_to_graph`, `layout_graph`, `tree_id`, the Zod schemas, and the v0 types.

## Acceptance Criteria

1. `pnpm check` exits 0 across the entire workspace after this phase completes.

### Layout

2. `layout_graph(nodes, edges, options?)` is exported from `@repo/core`, returns `Promise<{ nodes, edges }>` with positions filled in, and accepts `direction` (`'LR' | 'TB'`), `node_spacing`, `rank_spacing` with documented defaults (`'LR'` / `40` / `80`).
3. ELK is constructed via `import ELK from 'elkjs/lib/elk-api.js'` plus a `workerFactory` that resolves `new URL('elkjs/lib/elk-worker.min.js', import.meta.url)` (per research F3). No source file imports `elkjs/lib/elk.bundled.js` and no source file references `Function(...)` for evaluating layout code. The phase 1 `unsafe-eval` bundle grep stays green.
4. Container nodes are configured with `nodeSize.constraints = ['NODE_LABELS', 'PORTS']`. Multi-handle nodes (notably `parallel`) set `org.eclipse.elk.portConstraints` to `'FIXED_ORDER'` and declare per-handle `port` entries whose ids match the React Flow handle ids (per research F5).
5. Position output uses parent-relative coordinates (per research F2). A test verifies that passing `position: { x: child.x, y: child.y }` straight through after layout — without adding the parent's position — is correct.
6. Layout requests are debounced to no more than once per 200ms; latest request wins. A unit test verifies rapid successive calls collapse to a single layout with the most recent input.
7. `fallback_layout(nodes, edges, options?)` exists as a deterministic naive layered grid producing non-overlapping positions. Used automatically when (a) `Worker` is unavailable in the host environment (workerFactory is omitted so elkjs runs in-thread, plus the fallback is the secondary safety net), and (b) ELK exceeds the 10s timeout (F4). Console warning logged exactly once per process when the fallback engages.
8. A synthetic 500-node tree fixture lays out in under 5 seconds. Asserted in a Vitest performance test (may be marked `.skip` or gated under an env-free flag if flaky in CI but must run locally).

### Canvas surface

9. `@xyflow/react` is pinned to `>= 12.2` in `@repo/core`'s `package.json` (per research F1, F4). The workspace install resolves a 12.2+ version.
10. `WeftCanvas` is a function React component exported from `@repo/core` conforming to `WeftCanvasProps` in spec §4.1: `tree`, `on_node_click`, `on_ready`, `initial_viewport`, plus the v1-reserved `events` prop accepted but ignored in v0.
11. `canvas_api` exposes `focus_node(id)`, `fit_view()`, `export_png(): Promise<Blob>`, `get_viewport()`. `WeftCanvas` invokes `on_ready(api)` once mounted and the canvas is interactive.
12. The `@xyflow/react` `nodeTypes` registry is the single dispatch table mapping each v0 kind to its component (`StepNode`, `SequenceNode`, `ParallelNode`, `PipeNode`, `RetryNode`, `ScopeNode`, `StashNode`, `UseNode`) and falls through to `GenericNode` for any unknown kind. No node component contains an `if (kind === '...')` branch for another kind (constraints §3 "Dispatch-on-kind, never branch-on-kind").
13. Each node component renders the visual encoding specified in spec §4.3 — handles, labels, badges, container chrome — for representative configs. Component tests verify each.
14. Each node component fixes its width and height via CSS classes/tokens so layout runs in a single pass with known dimensions (per the open-question §13.8 v0 strategy). Node sizes live in a single styling source.
15. `WeftNodeData` is uniform across kinds (per taste principle 4): `{ kind, id, config?, execution_state? (ignored in v0), latest_event? (ignored in v0) }`. Per-kind rendering specifics come from `config` introspection within each component.
16. **Parallel ordering regression — render side.** `ParallelNode` declares per-handle ports matching the layout's port ids. The regression test from phase 2 is extended end-to-end: load `parallel_ordering.json`, run `tree_to_graph` and `layout_graph`, then re-run after a config tweak, and assert stable child order in the *positioned* output. The documented escape hatch (set `node.zIndex` from declaration order) is referenced in a code comment near `ParallelNode` or the transform.

### Performance hardening on the canvas

17. When node count exceeds the configurable threshold (default 200, per spec §6 and research F12), `WeftCanvas` enables `OnlyRenderVisibleElements` and disables the minimap while panning. Custom node components are memoized (`React.memo` or equivalent). A unit / component test verifies the threshold behavior toggles around 200. Phase 5 verifies this end-to-end through the studio with a > 200-node fixture.

### PNG export

18. `canvas_api.export_png()` returns a `Promise<Blob>` of the **full canvas** computed via `getNodesBounds(getNodes())` + `getViewportForBounds`. The capture target is the `.react-flow__viewport` element (not `.react-flow`). The selector filter excludes `.react-flow__minimap`, `.react-flow__controls`, `.react-flow__attribution`. (Per spec §5.6 and research F6.)
19. `html-to-image` is pinned to **exactly** `1.11.11` (no caret, no tilde) in `@repo/core`'s `package.json` (per research F6). CI verifies the exact-version constraint.
20. All CSS lives in `@repo/core`'s package; no `<link>` to cross-origin stylesheets, no Google Fonts (per research F7). Any web font is self-hosted. Tailwind base alone is acceptable.

### Umbrella

21. `@repo/weft/src/index.ts` re-exports the curated public surface: `WeftCanvas`, the `canvas_api` type, `tree_to_graph`, `layout_graph`, the `layout_options` type, the Zod schemas for `flow_tree` and `FlowNode`, the types `flow_tree`, `WeftCanvasProps`, `WeftNodeData`, `tree_id`, plus `export type` re-exports of `FlowNode` and `FlowValue` from `@robmclarty/fascicle`. No JSX, no function bodies, no non-trivial expressions (constraints §7 invariant 5 — phase 1's mechanical check stays green).
22. `@repo/core/src/` has no value imports from `@robmclarty/fascicle` — only `import type`. Re-verified by the phase 1 mechanical check (constraints §7 invariant 6).

### Failure-mode coverage

23. Tests cover F4 (ELK timeout → fallback engages, signal exposed via the layout return path or canvas state, console warning fires once), F5 (worker unavailable → in-thread elkjs runs, console warning fires once), and F6 (unknown kind → `GenericNode` renders without console errors).

### Coverage

24. Coverage floor of 70% lines / functions / branches / statements is met for `@repo/core` and `@repo/weft` across the union of phase 2 + phase 3 code.

## Spec Reference

- spec.md §4.1 (Library public API — `WeftCanvasProps`, `canvas_api`, `layout_graph`, `layout_options`)
- spec.md §4.3 (Node type contracts — visual encoding per kind, `WeftNodeData`, generic-fallback for unknown kinds)
- spec.md §4.4 (Trajectory event contract — declared but unused in v0; the `events` prop accepts and ignores)
- spec.md §5.2 (Layout — `elk-api` + `workerFactory`, two-pass design vs. v0 fixed-dimensions strategy, debounce, FIXED_ORDER ports)
- spec.md §5.6 (PNG export — `getNodesBounds` + `getViewportForBounds`, `html-to-image` exact-version pin)
- spec.md §6 (Constraints — frontend stack, no ambient singletons, first-party CSS only, performance optimizations)
- spec.md §7 (Dependencies — versions, exact-version pin for `html-to-image`)
- spec.md §8 F3 (large trees), F4 (ELK timeout), F5 (Worker unavailable), F6 (unknown kind), F11 (Safari PNG limitations — documented in phase 5)
- spec.md §9 (Success Criteria — automated tests, parallel-ordering regression render side, architectural validation including `unsafe-eval` grep)
- spec.md §10 (File Structure — `packages/core/src/canvas/`, `nodes/`, `layout/`)
- spec.md §12 (CSP for hosted demo — informs the worker-src and no-unsafe-eval requirements)
- constraints.md §3 (Library and umbrella import rules — including dispatch-on-kind)
- constraints.md §4 (Runtime Dependencies — stack-shaping picks)
- constraints.md §5.1 (Layout never blocks the canvas), §5.2 (Unknown kinds render), §5.7 (No mutation of caller inputs)
- constraints.md §7 invariants 1, 2, 5, 6 (re-verified)
- constraints.md §9 (Testing Requirements)
- taste.md principles 1, 3, 4, 5, 6, 8, 9, 10
- design.md §1 (Layered Packages), §2 (Package Responsibilities), §5 (Public Surface)
