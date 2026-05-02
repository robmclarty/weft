# Canvas redesign — Phase B + C "deluxe" follow-up

Deferred from the May 2026 subway-map redesign (commits `6094596` … `bf303de`). Phase A shipped the visual refresh, B shipped retry/loop arcs and tighter wrapper chrome, C shipped role-tagged branch/fallback edges, D shipped compose collapse/expand. What's left is the topology rewrite that turns wrapper containers and branch/fallback/parallel containers into pure node-and-edge subway-map elements.

## Why this was deferred

Both pieces require the same architectural change: lifting children out of containers so the container becomes a peer node (a junction or a marker) instead of a chrome around its children. That's a real `tree_to_graph.ts` rewrite, plus port-plumbing changes in `elk_runner.ts`, plus new node renderers, plus updates to inspector click handling so the inspector still surfaces the wrapper's metadata when the user clicks the lifted child or the connecting edge. Each of those is small in isolation, but the combination is a multi-day diff with substantial test churn — Phase A→D was already a four-commit arc, and the user signaled "ship now, polish later" by accepting the role-tag-only Phase C.

## Phase B-deluxe — wrappers as peer markers + edge decorations

### Current state (post-Phase B)

Wrapper kinds (`pipe`, `retry`, `timeout`, `loop`, `map`, `checkpoint`) still render as containers in `packages/core/src/transform/tree_to_graph.ts`. Their child is `parentId`-linked into the wrapper. The container chrome is now tighter (212×114 / 8px padding from `canvas.css`'s `.weft-node-pipe`, `.weft-node-retry` etc.), but it's still a box around a box.

Retry self-loop and loop back-edge already work — those were the highest-value moves and they shipped. Compose collapse/expand also shipped.

### Target state

For each wrapper kind, the wrapper's inner child is *lifted* to the wrapper's parent's `parentId`. The wrapper itself becomes a small marker node (an SVG glyph, not a container chrome) sitting beside its lifted child. Edges connect them based on semantics:

| Kind | Position of marker | Edges emitted |
|---|---|---|
| `pipe(child, fn)` | After child | `child → marker` (decorated with `<fn:name>` chip) |
| `timeout(child)` | After child | `child → marker` (carries `⏱ 30s` deadline label) |
| `checkpoint(child, key)` | Before child | `marker → child` (carries `■ key` station label) |
| `map(child, n)` | Before child | `marker → child` (carries `× n` cardinality, multi-track stroke) |
| `retry(child)` | Beside child *(redundant — self-loop already handles this; consider dropping the marker entirely and letting the self-loop edge be the visual)* | (already shipped) |
| `loop(child)` | Beside child *(same — loop-back edge already handles)* | (already shipped) |

For retry and loop the existing self-loop / loop-back edges are arguably enough. The marker would be redundant unless we decide users need a clickable hit-target for the wrapper data; an alternative is making the self-loop / loop-back edge itself clickable and routing the click to the wrapper.

### Concrete changes

1. **`packages/core/src/transform/tree_to_graph.ts`** — rewrite `walk_wrapper_child` for the marker-lift case:
   - For each wrapper kind, walk the inner child with `parent_graph_id` set to the wrapper's *parent* (not the wrapper itself) so React Flow treats them as siblings.
   - Emit the wrapper as a separate marker node with the same `parentId` (sibling of its former child).
   - Emit the appropriate decoration edge per the table above.
   - When the wrapper's parent is a sequence/scope/etc., the parent's structural-edge walker needs to know that this `[child, marker]` pair occupies one position in the chain. Easiest: have `walk_wrapper_as_marker` return `{ first: graph_id, last: graph_id }` so the sequence walker can chain `pred → first` and `last → succ` correctly.
   - Add new `WeftEdgeData.kind` values: `'pipe-fn' | 'timeout-deadline' | 'checkpoint-marker' | 'map-cardinality'`. Each carries a `wrapper_id` and condensed `wrapper_label` (same shape as the existing `'self-loop' | 'loop-back'`).

2. **`packages/core/src/edges/`** — add edge components for the new kinds: `PipeEdge.tsx` (decorated edge with mid-line `<fn:…>` chip), `TimeoutEdge.tsx` (clock-glyph icon mid-line + `⏱ 30s` label), `CheckpointEdge.tsx` (station-marker glyph mid-line + key label), `MapEdge.tsx` (multi-track stroke + `× n` label). Register all in `edges/registry.ts`.

3. **`packages/core/src/nodes/`** — add a single `MarkerNode.tsx` that renders a small ~40×40 glyph + label pill. Replace `PipeNode.tsx`, `TimeoutNode.tsx`, `CheckpointNode.tsx`, `MapNode.tsx` in `registry.ts` with `MarkerNode` (one component per glyph; either keep separate files using shared markup or collapse into one parameterized component). `RetryNode.tsx` and `LoopNode.tsx` can either keep tiny container chromes (since their self-loop / loop-back arcs are already the visual) or also collapse to markers.

4. **`packages/core/src/layout/elk_runner.ts`** — markers are leaves with explicit small dimensions (~40×40) instead of containers. The `WRAPPER_KINDS_FOR_LAYOUT` set + `WRAPPER_MIN_*` constants from Phase B can be retired; markers are just leaves.

5. **`packages/studio/src/components/InspectorPanel.tsx`** — when an edge is clicked, the inspector needs to find the wrapper's flow-tree node via `edge.data.wrapper_id` and surface its config. Today the inspector only handles node clicks. Add edge-click handling in `WeftCanvas.tsx` (`onEdgeClick`) that mirrors the node-click flow.

6. **Runtime overlay cascade** — `derive_runtime_state` in `packages/core/src/runtime_state.ts` already rolls cost up the parent chain. With wrappers becoming peer markers (no longer parents), the cost-rollup convention has to change: cost lands on the wrapped child instead. Audit `runtime_state.ts` and the `WeftCanvas` runtime-overlay effect so wrapper-attributable cost still surfaces somewhere visible.

7. **Tests** — `tree_to_graph.test.ts` is the bulk of the churn. The current "wires loop, map, timeout, checkpoint as wrappers over their children" test at line ~314 expects `child.parentId === wrapper.id`; it would update to expect `child.parentId === wrapper.parentId` and `wrapper.type === 'marker'`. Add tests covering the per-kind edge emission and the chain-segment first/last contract.

### Risks

- **Sequence-position semantics get tricky** when a wrapper holds another wrapper (`retry(timeout(step))`). Each lift pushes the inner step further out; the chain piece is now `[step, timeout-marker, retry-marker]` with `first=step, last=retry-marker`. Test the deepest-nesting case from `fixtures/all_primitives.json` early.
- **ELK doesn't know about the semantic relationship** between a marker and "its" lifted child. The marker may end up far from the child if another sibling lays out between them. Mitigation: declare port constraints on the marker so its inbound edge from the child takes precedence, or set `elk.layered.crossingMinimization.semiInteractive: true` to bias position.
- **Edge-click inspector** is new UX surface. Decide whether the wrapper is selected via the lifted-child node, the marker, or the decoration edge — and pick *one*; mixing them confuses the user.

## Phase C-deluxe — branch/fallback/parallel as junction nodes

### Current state (post-Phase C)

Branch/fallback containers still enclose their children. Outgoing edges are role-tagged (`then`/`primary` solid orange, `otherwise`/`backup` dashed orange) so the divergence reads at a glance. Parallel uses the same container chrome with port-keyed fan-out edges.

### Target state (junctions)

Branch and fallback render as small filled diamond junction nodes (~48px). Their two children render as peers (parented to branch/fallback's parent). The two outgoing edges retain the role-tag styling shipped in Phase C.

Parallel splits into a fan-out diamond (replacing the container) and a fan-in diamond at the join point. Each branch is a peer of the diamonds. Today the parallel container's port plumbing (`elk_options_for` and `ports_for` in `elk_runner.ts`, with `FIXED_ORDER` constraint) preserves declaration order on the ports — that logic transfers to the fan-out diamond.

### Concrete changes (junctions)

1. **`packages/core/src/nodes/JunctionNode.tsx`** — new component. Renders a 48×48 diamond (CSS `transform: rotate(45deg)` on a square, with kind-tinted fill — orange for branch/fallback, teal for parallel). Glyph optional. Handles on all four corners (input on left/top, outputs on right/bottom).

2. **`packages/core/src/transform/tree_to_graph.ts`** — for branch/fallback, lift both children to peers of the branch/fallback node, emit branch/fallback as a diamond marker, emit the two role-tagged edges from diamond to children. For parallel, emit *two* diamonds (fan-out and fan-in) with all children as peers between them; structural edges run `pred → fan-out → child_i → fan-in → succ`.

3. **`packages/core/src/layout/elk_runner.ts`** — junction nodes are 48×48 leaves. Parallel's `FIXED_ORDER` port constraint moves to the fan-out diamond. The fan-in diamond gets symmetric inbound ports.

4. **`packages/core/src/nodes/registry.ts`** — replace `branch`, `fallback`, `parallel` entries with `JunctionNode`. Drop `BranchNode.tsx`, `FallbackNode.tsx`, `ParallelNode.tsx` files.

5. **`packages/core/src/canvas/canvas.css`** — drop the wide-container chrome rules for branch/fallback/parallel kinds. Add `.weft-node-junction` styling: rotated-square fill, kind-color, drop shadow for the subway-station read.

6. **Tests** — `tree_to_graph.test.ts` "renders branch as a labeled-edge container with then/otherwise" (line ~267) and the parallel-ordering regression need to update for the peer topology. The `parallel_ordering.json` fixture is the canonical test for FIXED_ORDER preservation; ensure declaration order survives the lift.

### Risks (junctions)

- **Parallel's fan-in point is a synthesized node** that doesn't correspond to a flow-tree node. The inspector click on it is a no-op (or surfaces the parallel container's config — fine). Make sure runtime state for the parallel as a whole still has somewhere to attach.
- **Visual collision** when many parallel branches converge. The fan-in diamond stays small but the convergence edges crowd. ELK's `nodeNodeBetweenLayers` (currently 96 from Phase A) may need bumping for parallel-heavy fixtures.

## Sequencing

These two phases can ship independently and in either order. Recommend B-deluxe first because pipe is the simplest "wrapper-as-marker" case and locks in the lift-children-to-peers pattern, which C-deluxe then reuses.

Each phase is one commit if you can hold the tests in your head, two commits if you'd rather split (e.g., "B-deluxe pipe only" then "B-deluxe timeout+checkpoint+map"). The redesign chunked Phase A→D into four commits and that worked well for review; keep that cadence.

## Verification

Same loop as the original redesign:

1. Boot studio: `pnpm --filter @repo/studio dev`.
2. Open `http://127.0.0.1:5173/view?src=http://127.0.0.1:5173/fixtures/all_primitives.json`.
3. Confirm at the all-primitives fixture: every wrapper renders as a marker (no nested chrome), every branching container renders as a diamond. Edges read as subway lines connecting them.
4. Click each marker / diamond — inspector populates with the original wrapper metadata.
5. Click each role-tagged edge — inspector populates with the wrapper's data.
6. `pnpm screenshots` and diff against `.check/screenshots/v0-baseline/` and the Phase A→D screenshots if those got captured anywhere.
7. `pnpm check` exits 0.

## Source-of-truth references

- Approved Phase A→D plan: `~/.claude/plans/i-m-very-unsatisfied-with-humming-tulip.md`
- Inspirations: `../../design/inspiration/` (Identikal Foundry, Kaliber 10000, NYC subway map, Kakimorphosis)
- v0 visual spec: `.ridgeline/builds/v0/spec.md` §4.3
- Phase A commit: `6094596` — visual refresh
- Phase B commit: `de6d293` — retry / loop arcs + tighter wrappers
- Phase C commit: `9e9f7ee` — role-tagged branch/fallback edges
- Phase D commit: `bf303de` — compose collapse/expand
