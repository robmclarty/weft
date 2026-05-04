# Canvas topology — wrapper badges and junction diamonds

Reference doc for the topology decisions baked into the current canvas. The shape that shipped differs from the original "B-deluxe / C-deluxe" plan in one important way; this file documents what is now true and why.

For the shipped behavior end-to-end, see [primitives.md](./primitives.md). For the visual evolution and changelog entries, see [`CHANGELOG.md`](../CHANGELOG.md) (v0.1.2 — initial subway refresh, v0.1.6 — wrappers as inline badges, v0.1.7 — sequence/scope drop chrome, v0.1.8 — diamond ports + loop container).

## Original plan

The Phase A→D subway-map redesign (commits `6094596` … `bf303de`, May 2026) shipped containers-with-tighter-chrome plus role-tagged divergence edges, then deferred two follow-ups:

- **B-deluxe** — lift each wrapper's child to a peer node, render the wrapper as a small marker glyph beside it, connect them with a decorated edge (`<fn:to_upper>`, `⏱ 30s`, `■ key`, `× n`).
- **C-deluxe** — lift branch / fallback / parallel children to peers, render the container itself as a small filled diamond junction node.

Both follow-ups required the same architectural move (lift-children-to-peers in `tree_to_graph.ts`), which was a multi-day diff at the time.

## What shipped

C-deluxe shipped as planned (v0.1.2). Branch / fallback / parallel are 56×56 diamond junctions with their two (or N) children lifted to peers. Outgoing edges are role-tagged: `then` / `primary` solid orange, `otherwise` / `backup` dashed orange; parallel edges are port-keyed and preserve declaration order via ELK `FIXED_ORDER` plus per-port `FIXED_POS` so arrowheads land directly on the visible vertex (v0.1.8). See `walk_branching_as_junction` and `walk_parallel_as_junction` in `packages/core/src/transform/tree_to_graph.ts`.

B-deluxe shipped in v0.1.2 as marker peers, then was reworked in v0.1.6 to **inline corner badges**. The marker peers were structurally correct but visually weak: the structural chain still ran through the small marker dot, so a black work step never had a line connecting directly to its upstream/downstream black work step. Lines floated in space.

The badge rework attaches a `WrapperBadge { kind, label, position }` to the lifted child's `WeftNodeData.wrappers` array; the leaf renderer paints the badge as a corner pill. The chain runs `step → arrow → step` directly. On `all_primitives`: nodes 24 → 20, edges 15 → 11, total edge length 6148 → 3968 px (-35%), bends 22 → 18, vision-LLM rubric 2.2 → 2.83.

Two wrapper kinds kept their original v0.1.2 forms because edge geometry IS the visual:

- **`retry`** — drops the wrapper entirely; emits a yellow self-loop arc on the wrapped child labeled `↻ 3× / 250ms`. See `walk_retry_as_edge` and `SelfLoopEdge`.
- **`loop`** — became a labeled magenta container in v0.1.8 hosting body, optional guard, and the back-arc, so the iterate-then-exit shape reads as one box. See `walk_loop_as_container` and `LoopBackEdge`.

Two structural-only kinds drop entirely (v0.1.7):

- **`sequence`** — emits no node; lifts children to peers; chains adjacent children with structural edges. See `walk_sequence_as_invisible`.
- **`scope`** — emits no node; lifts children to peers; chains them sequentially AND emits dashed `stash → use` overlay edges. See `walk_scope_as_invisible`.

`compose` is now the **only** kind that produces a visible outer container. It defaults to expanded, toggles to collapsed on click, and external edges anchor on the box perimeter so the chain never threads through the inside.

## Why badges instead of marker peers

The marker-peer plan was structurally sound but visually weak:

1. **Chain readability** — the eye follows arrows between the things doing the work. With markers in the chain, the work steps were never adjacent in the route; the structural edge always teed off through a marker dot.
2. **Pixel budget** — a 44×44 marker peer plus its decoration edge consumes ~280px of horizontal real estate. The badge consumes 0 — it lives in the corner of an existing leaf.
3. **Inspector affordance** — a corner badge is part of the node it decorates. Clicking the wrapped step naturally surfaces the wrapper config alongside the step config, instead of requiring the user to discover the marker is clickable.

The marker-peer code shipped briefly (v0.1.2 → v0.1.6) and is preserved in git history if anyone wants to revisit. The trade-off is that badges can't carry mid-line labels, so any future "decoration that needs to live on the edge" (retry, loop) stays geometric.

## Sources of truth

- Renderer dispatch: `packages/core/src/nodes/registry.ts` and `packages/core/src/edges/registry.ts`.
- Topology rules: `packages/core/src/transform/tree_to_graph.ts` (the `walk_*` functions).
- Junction port plumbing: `packages/core/src/layout/elk_runner.ts` (`elk_options_for`, `ports_for`).
- Visual chrome: `packages/core/src/canvas/canvas.css`.
- Inspirations: `../../design/inspiration/` (Identikal Foundry, Kaliber 10000, NYC subway map, Kakimorphosis).
- v0 visual spec: `.ridgeline/builds/v0/spec.md` §4.3.
