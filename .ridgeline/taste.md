# weft — Taste

**Companion documents:** `constraints.md` (hard non-negotiables), `design.md` (architectural sketches), per-build `spec.md`

Taste is the opinionated shape that lives inside the constraints. Constraints are the walls; spec is the surface area; taste is what the rooms look like. It is why the API is shaped the way it is, what it refuses to become, and what "good code" looks like at a call site. Taste without reasons is dogma; taste with reasons is a guide future-you can apply to novel decisions.

This document is deliberately short. Where v0 has not yet exercised a decision (custom node patterns, inspector richness, hot-reload story), taste is silent rather than guessing.

---

## Design Principles

### 1. Compositions are plain values; the canvas reflects them, never the other way around

**Rule:** the canonical input is whatever fascicle emits — a `FlowNode` tree of plain JSON. Weft renders that tree. Weft does not own composition state, does not invent fields fascicle does not emit, and does not require fascicle to wrap its output in a weft-specific envelope at the source.

**Why:** the moment weft becomes a producer of composition data, fascicle and weft fight over who owns the shape. Keeping weft strictly downstream means a fascicle release does not require a coordinated weft release; the only coupling is the public `FlowNode` type. Weft's ingest envelope (`flow_tree`) wraps the bare `FlowNode` on weft's side so format-versioning is local. This is the same one-way coupling fascicle imposes on its own adapters.

### 2. Static first; execution and edit are sibling builds, not feature flags

**Rule:** v0 is a static viewer. v1 adds live execution overlay. v2 adds edit-in-place. Each build is its own directory under `.ridgeline/builds/`. None of them is a hidden mode behind a flag in an earlier build.

**Why:** "we'll add live mode later behind a flag" is how viewers turn into editors that have lost the discipline of being viewers. Splitting capability stages into siblings forces each one to be defensible on its own. v0 has to be a useful static viewer or it does not ship; v1 has to be a useful overlay or it does not ship. The contracts v0 reserves for v1 (the `events` prop, the `WeftNodeData.execution_state` field) are the seams; they are not flagged behavior.

### 3. Umbrella is the seam

**Rule:** the workspace publishes via an umbrella. `@robmclarty/weft` (= `@repo/weft`) is a thin package whose only job is to re-export the curated public surface of `@repo/core`. Studio dogfoods the umbrella, not `@repo/core` directly. `@repo/watch` is a separate publish so CLI users do not pull React.

**Why:** an umbrella with no implementation logic is a single, explicit "what we export" boundary. `@repo/core` can refactor freely behind it. Splitting the watch CLI into its own publish is the same pattern in reverse: it keeps the React peer surface off CLI users' install graphs without inventing a parallel API. Direct carry-over from fascicle's umbrella-is-the-seam principle; the same logic gives the same shape.

### 4. Dispatch on kind; never branch on kind

**Rule:** the React Flow `nodeTypes` map is the single place that knows which component renders which `kind`. Components do not contain `if (kind === 'sequence')` branches for *other* kinds. The graph transform produces nodes and edges from a single walk; there is no per-kind post-processing layer outside the transform itself.

**Why:** the moment two places branch on `kind`, adding a new primitive becomes a treasure hunt. A single dispatch table, with a generic fallback, makes every primitive an independent unit. This mirrors fascicle's "the runner dispatches but does not contain composer-specific logic" rule — the same shape gives the same payoff: each node component is independently testable, independently replaceable, and independently deletable.

### 5. Unknown kinds render; never crash, never hide

**Rule:** the graph transform and the node-type registry tolerate any `kind` string. Unknown kinds render as a generic component with a visible "unknown kind" affordance. Children still render.

**Why:** fascicle ships sixteen primitives today and will ship more. A weft release that pre-dates fascicle's next primitive is the common case, not an edge case. A strict viewer that crashes on an unknown kind is a viewer that cannot be trusted to load arbitrary trees from arbitrary fascicle versions; users learn to keep weft on a stale tag. A lenient viewer that *visibly* surfaces "I don't know this kind, here's the structure anyway" stays useful while making the gap discoverable. Strict where it matters (Zod at the loader); lenient where it doesn't (rendering).

### 6. Layout is observational, never blocking

**Rule:** auto-layout runs in a Web Worker. The canvas thread builds the graph, posts it, and applies positioned nodes back as a single state update. If `Worker` is unavailable, layout falls back to the main thread with a console warning — it never crashes.

**Why:** layered layout on a thousand-node tree takes hundreds of milliseconds to seconds. On the main thread, that means the canvas freezes during pan, zoom, or any rerender that touches structure. Workerized layout is the difference between a tool that feels responsive and a tool that feels broken. The fallback exists because we should not couple the canvas's *correctness* to a browser feature; we couple its *responsiveness* to it.

### 7. Canvas state is per-tree, never ambient

**Rule:** zoom, viewport, selection, and collapsed-node state persist to localStorage keyed by a hash of the serialized tree. Two tabs viewing different trees do not share state. There is no module-global canvas state.

**Why:** per-tree keying gives each tree its own remembered view without any cross-tree coupling. A user reopening yesterday's tree gets yesterday's viewport. A user opening a new tree gets fresh state. The alternative (one global "last viewport") sounds tidier and is wrong: it conflates presentations of unrelated content. The deeper rule is the carry-over from fascicle: ambient state couples unrelated runs; same logic, same answer for unrelated trees.

### 8. No registries, no global state, no classes

**Rule:** factory functions return plain objects; React components are function components. No singleton stores, no module-level mutable state, no `class … extends …` (carry-over from fascicle).

**Why:** the same payoffs hold here as in fascicle. Plain objects compose trivially. Two tests do not interfere through a shared registry. A component is testable without `new`-ing anything. The one place where typed errors might one day need `class extends Error` is the same narrow exception fascicle carved out — single `errors.ts` per package, scoped rule ignore. Until a build needs it, weft has zero classes.

### 9. Validate at boundaries; trust internal shapes

**Rule:** Zod runs at exactly two places — the studio's file loader and the watch CLI's read. After the first parse, internal modules trust the validated `FlowNode`. No defensive `if (typeof x === 'string')` checks scattered through the transform or layout code.

**Why:** validation that runs everywhere is validation that runs nowhere — it is so spread out that the inevitable miss is silent. Concentrating validation at the system edge means the inside of the system gets to assume well-formed inputs. When validation fails, it fails loudly with a JSON path; when it passes, the rest of the code is small and readable. This is the same "edges, not the middle" rule that fascicle applies to side effects.

### 10. Bootcamp scope is explicit

**Rule:** v0 is also the author's React Flow bootcamp. When choosing between two reasonable patterns, pick the simpler one and write down what was learned. The seven MVP primitives in v0 are the ones that *exercise the layout and rendering patterns the canvas needs to prove out*, not the ones that are easiest to ship.

**Why:** the secondary motivation matters because it shapes decisions. A production-only framing would push toward "ship all sixteen primitives at once and figure out custom-node patterns under deadline pressure." A bootcamp framing pushes toward "ship enough primitives to see every layout shape (leaf, container, fan-out, wrapper, named-state) and learn from each." The result is a tighter v0 that *teaches the codebase* instead of an exhaustive v0 that buries the lessons. Recorded learnings — "subflows paid for themselves on `parallel` and `scope`; we kept them. Custom edges for `stash → use` cost more than they were worth; we replaced them with a labeled overlay" — feed taste for v1 and v2.

---

## What This Rules Out

**Composition state in the canvas.** No client-side store of "the tree we are editing right now" in v0 — the input is an immutable value. v2 introduces editing as an explicit build, with explicit serialization back to a DSL.

**Hidden execution state.** No `WeftCanvas` mode that quietly fetches trajectory events. v1 wires the prop; v0 ignores it. A consumer always knows whether they are watching or just viewing.

**Per-kind transforms outside the transform module.** No "fixup" passes that walk the graph and mutate node data based on kind. The single `tree_to_graph` walk is the only place kind-specific shaping happens.

**A central canvas store.** No Redux, no Zustand, no shared signals graph. Component state and a per-tree localStorage entry are sufficient. Promote to a store only when a build concretely fails without one.

**Custom React Flow node-data shapes per kind.** The `WeftNodeData` shape is uniform across kinds. Per-kind specifics live in `config`, which the components introspect — they do not get their own data type. This keeps the dispatch table simple.

**Cross-component coupling between node types.** `StepNode` does not know `SequenceNode` exists. They render independently and React Flow links them via parent-child relationships in graph data, never via component-to-component imports.

**A "headless mode" that runs without React.** The library is React-first. Pure transforms (`tree_to_graph`, layout) are usable from non-React contexts because they are pure functions, but there is no separate non-React entry point or build target.

**Watch CLI features beyond watching.** The CLI watches a file and forwards changes. It does not run fascicle, render trees, or expose a query API. v1 extends it to tail trajectory JSONL — same shape, different file. Anything else lives elsewhere.

**Non-localhost watch.** The CLI binds `127.0.0.1` only.

---

## Carry-Over to v1 and v2

These taste rules survive into the sibling builds and must not be violated there:

- **Static rendering invariant.** v1 layers execution state onto v0's canvas; v0's static render path remains the same with `events` absent. v2 layers editing onto v0's canvas; v0's read-only render path remains the same with the editor disabled.
- **Dispatch on kind.** v1's overlay reads `execution_state` from `WeftNodeData` and lets each component render its own state styling. There is no central "overlay painter" that branches on kind. v2's editing commands route through the same registry.
- **Boundary validation.** v1's trajectory events validate at the watch CLI's read; v2's DSL parses validate at load. Internal modules continue to trust validated shapes.
- **No ambient state.** v1's live state is per-canvas, keyed to the tree under view, never module-global. v2's edit history is per-canvas, never module-global.
- **Umbrella is the seam.** v1's reducer (`@repo/core/reduce` per the v1 stub) and v2's editor surface ship through the umbrella. The umbrella stays a re-export shell; implementation lives in `@repo/core`.
