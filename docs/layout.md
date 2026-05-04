# Layout quality

The work documented in this file landed across v0.1.4 → v0.1.6. Today's pipeline is what those phases produced; the rest of the document is the decision log that got us there. Read this top section for the current state, the rest for context.

## Current state

The layout pipeline lives in [packages/core/src/layout/](../packages/core/src/layout/):

- **Engine.** `elkjs` `layered` + `ORTHOGONAL` + `INCLUDE_CHILDREN`, run in a Web Worker via `elkjs/lib/elk-worker.min.js` (no `unsafe-eval`). Falls back to `fallback_layout` when `Worker` is unavailable or ELK exceeds the 10s timeout (`layout_graph.ts`).
- **Edge routing.** `apply_edge_routes` in `elk_runner.ts` harvests ELK's computed `sections` per edge and writes them onto `WeftEdgeData.waypoints` in root (flow) coordinate space, accumulating ancestor offsets so cross-container edges land in the right place. `WeftOrthogonalEdge` (registered as `weft-orth`, the default edge type) renders the polyline with rounded corners (8 px, clamped to half the shorter incident segment). `self-loop` and `loop-back` keep their dedicated arc components — those are synthetic, ELK can't usefully route them.
- **Spacing defaults.** `node_spacing: 120`, `rank_spacing: 200`. Tuned for "see the flow first, fit-everything second" — thick orthogonal edges with arrowheads need a long visible run between adjacent stops or the head dominates and the line vanishes (`layout_options.ts`).
- **Junction ports.** Branch / fallback junctions use `FIXED_SIDE`: input WEST, happy-path EAST, alt-path SOUTH. Parallel uses `FIXED_ORDER` so declaration order survives. v0.1.8 added `FIXED_POS` so arrowheads land directly on the diamond's visible vertex.
- **Auto-fit.** `padding: 0.06`, `minZoom: 0.1`, `maxZoom: 1`. A staggered retry fan (`80, 220, 480 ms`) catches React Flow's late measurement pass on deeply-nested subflows; `useNodesInitialized()` proved unreliable when ELK supplies explicit node sizes (its ResizeObserver path doesn't always fire). MiniMap hides under 12 nodes.

The metric numbers on the canonical fixtures, after Phase 2 (ELK waypoints piped through React Flow) plus the v0.1.6 visual cleanup:

| fixture            | crossings | bends | totalEdgeLength | nodeEdgeOverlaps |
|--------------------|----------:|------:|----------------:|-----------------:|
| simple_sequence    |         0 |     0 |              40 |                0 |
| all_primitives     |         0 |    18 |          1967.9 |                1 |
| full_primitive_set |         0 |     4 |           155.5 |                0 |

## Tooling

The same tools used to drive this work are wired into `pnpm`:

- **`pnpm metrics`** ([scripts/layout-metrics.mjs](../scripts/layout-metrics.mjs)) — Playwright walks each canonical fixture, parses every `.react-flow__edge-path` polyline and `.react-flow__node` transform, computes crossings / bends / total-edge-length / node-edge-overlaps. Output: `.check/layout-metrics.json` plus a per-fixture screenshot at `.check/layout-metrics-screenshots/<name>.png`. Expects the studio dev server already running on `:5173`. Compose nodes are auto-expanded before measurement.
- **`pnpm metrics:vision`** ([scripts/layout-vision-score.mjs](../scripts/layout-vision-score.mjs)) — spawns the local `claude` CLI with each screenshot and a four-axis rubric (`edge_clutter`, `label_readability`, `container_clarity`, `balance`, scored 1–5 plus weighted `overall`), and writes `.check/layout-vision-scores.json`. Picks up the user's existing Claude Code auth (OAuth, API key, Bedrock, Vertex). `CLAUDE_CLI_BIN` overrides the binary path.
- **`pnpm metrics:graphviz`** ([scripts/layout-graphviz-benchmark.mjs](../scripts/layout-graphviz-benchmark.mjs)) — diagnostic-only Graphviz `dot` benchmark with `splines=ortho rankdir=LR`. Tells you whether residual visual issues are an engine ceiling or a property of the input shape. Not a shipping path: Graphviz `splines=ortho` ignores cluster boundaries and per-node ports.

## Optional: libavoid spike

`LayoutOptions.router: 'elk' | 'libavoid'` (default `'elk'`) selects the edge router. `libavoid-js` (LGPL-2.1-or-later, `optionalDependencies` of `@repo/core`) routes orthogonally with object avoidance and parallel-edge nudging.

The studio exposes the spike as `?router=libavoid`; copy the WASM blob into the studio's `public/` first:

```sh
cp node_modules/.pnpm/libavoid-js@*/node_modules/libavoid-js/dist/libavoid.wasm \
   packages/studio/public/libavoid.wasm
```

The `libavoid_wasm_url` option threads through `LayoutGraphOptions` so the lazy `AvoidLib.load(url)` finds the blob.

Phase 4 benchmark (May 2026) found libavoid loses on every axis on these fixtures (`displayRoute()` returns endpoint-only polylines, drawing straight diagonals through obstacles). The spike stays for reproducibility but the default is ELK.

## History

What follows is the record of how the current architecture got built. Useful if you're considering changes to layout — the dead ends are documented so you don't repeat them. Original framing was "Phases" because that's how the work was sequenced; the chronological notes follow under "Decision log".

### Phases

### Phase 1 — Metrics scaffolding (the unlock)

Without this everything else is guessing. Build `pnpm metrics` that:

1. Expects the studio dev server already running on :5173 (the typical agent
   loop is "boot dev server once, run metrics N times"; embedding the spawn
   created tooling friction without payoff).
2. Loads each canonical fixture in headless Chromium.
3. Inside `page.evaluate`, walks the rendered DOM:
   - `.react-flow__edge-path` → parse `d` attribute into polyline waypoints.
   - `.react-flow__node` → read `transform: translate(...)` + width/height.
4. Computes metrics:
   - **Edge crossings** (canonical layout-quality signal). O(N²) segment
     intersection over orthogonal segments — fixture has ~100 edges, fine
     without `sweepline-intersections`.
   - **Bend count** (segments per polyline minus 1, summed).
   - **Total edge length** (sum of Euclidean segment lengths).
   - **Node–edge overlaps** (count of segments crossing any node bbox they
     don't terminate at).
5. Writes `.check/layout-metrics.json` with one entry per fixture.
6. Prints a one-line per-fixture summary.

Output schema:

```json
{
  "timestamp": "...",
  "fixtures": [
    {
      "name": "all_primitives",
      "metrics": {
        "edges": 42,
        "crossings": 17,
        "bends": 88,
        "totalEdgeLength": 12450.3,
        "nodeEdgeOverlaps": 4
      }
    }
  ]
}
```

This is the baseline. Every later phase compares against it.

### Phase 2 — Pipe ELK edge waypoints to React Flow (the real unlock)

**Discovered during the first sweep attempt:** `layout_graph.ts:108` returns
`edges: edges.map((e) => ({ ...e }))` — ELK's computed edge sections
(waypoints, bendpoints, all the orthogonal-routing output) are **thrown
away**. React Flow then renders structural edges with its built-in
`smoothstep` type, which computes paths from source/target handles only.
That means:

- Every "squiggly edge" complaint is React Flow's smoothstep router, not
  ELK's orthogonal router.
- Every ELK option that affects edge routing is a no-op for what we render.
- The first sweep (`unnecessaryBendpoints: true`) produced exact-zero
  deltas across all metrics, confirming this.

So Phase 2 is an architectural change, not a config tweak:

1. **Harvest edge sections in `elk_runner.ts`.** ELK returns each laid edge
   with `sections: [{ startPoint, endPoint, bendPoints? }]`. Add an
   `apply_edge_routes(edges, laid)` companion to `apply_positions` that
   projects bendpoints into a waypoint array per edge.
2. **Augment `WeftEdge`.** Optional `waypoints: ReadonlyArray<{x: number,
   y: number}>` field, populated by step 1.
3. **Build a custom orthogonal edge component.** Renders an SVG `path` with
   `M source L w1 L w2 ... L target` plus optional rounded corners
   (matches the existing subway aesthetic). Mirror the marker/stroke
   defaults from `WeftCanvas.tsx`'s `DEFAULT_EDGE_OPTIONS`.
4. **Register as the default edge type.** Replace `smoothstep` in
   `DEFAULT_EDGE_OPTIONS.type` with the new kind. `self-loop` and
   `loop-back` continue to use their special-case components.
5. **Account for hierarchy-crossing edges.** ELK returns edge coordinates
   in the coordinate space of their nearest common ancestor container; React
   Flow expects screen-space. Convert by accumulating ancestor offsets
   during harvest, the same way `apply_positions` already handles nested
   nodes (it doesn't transform — children get ELK-relative positions and
   React Flow handles container offset via the `parentNode` prop).
6. **Re-baseline metrics** after the pipe lands. The bend count should
   immediately drop from 82 to whatever ELK actually computed.

After Phase 2, the original ELK-option sweep becomes meaningful and moves
to Phase 2b.

### Phase 2b — Sweep ELK options (only after Phase 2 lands)

Change one option at a time, re-run `pnpm metrics`, keep the wins. Order
from highest expected leverage given Phase 1's diagnosis:

1. `elk.layered.nodePlacement.strategy: NETWORK_SIMPLEX` — biggest
   expected straightening win vs default `BRANDES_KOEPF` in deep
   hierarchies.
2. `elk.layered.unnecessaryBendpoints: true` — explicit redundant-bend
   removal.
3. `elk.layered.mergeEdges: true` — actual subway bundling instead of
   one channel per edge.
4. Increase `elk.layered.spacing.edgeNodeBetweenLayers` to 30–50 and
   `elk.layered.spacing.edgeEdgeBetweenLayers` to 15–25. These (not the
   non-`BetweenLayers` versions) are what the orthogonal router uses to
   allocate channels.
5. `elk.layered.thoroughness: 30` (default 7) — cheap quality budget.
6. `elk.portConstraints: FIXED_SIDE` per kind (today only `parallel` does
   this), with explicit `side` per ELK port matching the React Flow
   handle position. Eliminates "edge entered the wrong side and U-turned"
   routing.

Stop at the first set where `all_primitives` looks acceptable AND
metrics show monotone improvement vs baseline.

Skip: `splines.mode` (only applies to `SPLINES`, irrelevant here).

Reference: <https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html>.

### Phase 3 — Vision-LLM tiebreaker (optional)

If two ELK option sets score similarly on quantitative metrics, settle
ties with a Claude vision call: take the screenshot, ask for a
structured rubric (edge clutter, label readability, balance) with
specific coordinates cited. Cheap to add once §1 exists; runs on demand,
not in the inner loop.

### Phase 4 — `libavoid-js` routing pass (only if §2 isn't enough)

Spike: keep ELK for node placement, but route edges with `libavoid-js`
(Adaptagrams libavoid in WASM, MPL-2.0, active 2026). It's the engine
behind Inkscape/Dunnart, purpose-built for object-avoiding orthogonal
routing with parallel-edge nudging.

Integration sketch:

1. Run ELK as today; harvest node positions.
2. Feed nodes + edge endpoints to libavoid in a Worker.
3. Get back routed polylines.
4. Override React Flow edge `path` with the libavoid result (custom
   edge type that takes pre-computed waypoints).

Time budget: 2–3 day spike behind a feature flag. Decision criteria:
crossings drop ≥30% from the best §2 result on `all_primitives`.

Reference patterns: `sprotty-routing-libavoid` package, JointJS
standalone-router demo (2025).

### Phase 5 — Graphviz `dot` benchmark (optional, diagnostic only)

If §2 + §4 still aren't enough, render `all_primitives.json` through
`@hpcc-js/wasm-graphviz` with `splines=ortho` purely as a benchmark.
Tells us whether the ceiling is the engine or the input shape itself.
Not for shipping (Graphviz ortho ignores ports + degrades on cluster
boundaries).

## Decision log

(append as we go)

- 2026-05-02 — wrote the plan; starting Phase 1.
- 2026-05-02 — Phase 1 script lives at `scripts/layout-metrics.mjs`, wired
  to `pnpm metrics`. Expects external dev server (vs the screenshots script
  which spawns its own), because metrics is meant to be re-run many times.
- 2026-05-02 — Discovered compose nodes start collapsed (in-memory state in
  `WeftCanvas.tsx`); the existing screenshot script captured the collapsed
  root only, not the squiggly expanded layout the user was complaining about.
  Metrics script clicks every `.weft-node-compose-collapsed` (looped to
  handle nested) before measuring. Worth porting that expansion step into
  `scripts/screenshot-scenarios.mjs` next time it's touched — its current
  `all_primitives.png` is misleading.
- 2026-05-02 — Baseline captured (deterministic across reruns):

  | fixture            | nodes | edges | crossings | bends | totalEdgeLength | nodeEdgeOverlaps |
  |--------------------|------:|------:|----------:|------:|----------------:|-----------------:|
  | simple_sequence    |     4 |     2 |         0 |     4 |             140 |                2 |
  | all_primitives     |    24 |    14 |         2 |    82 |            2311 |               28 |
  | full_primitive_set |    11 |     5 |         0 |    28 |             417 |                5 |

  Diagnosis on `all_primitives`: literal crossings are low (2). The user's
  "criss-crossing and squiggly" complaint maps to **bends** (82 across 14
  edges = ~5.9 per edge — orthogonal edges should average 1–3) and
  **nodeEdgeOverlaps** (28 — edges weaving through containers they don't
  belong to). That re-prioritizes Phase 2: lead with the options that attack
  bends and overlaps (`unnecessaryBendpoints`, `edgeNodeBetweenLayers`
  spacing, port `FIXED_SIDE`), not the option that minimizes crossings.

  Visual ground truth: `.check/layout-metrics-screenshots/all_primitives.png`.
- 2026-05-02 — Phase 2 plan PIVOTED. First option sweep
  (`unnecessaryBendpoints: true`) produced exact-zero deltas across every
  metric. Investigation found that `layout_graph.ts:108` discards ELK's
  edge sections (`edges: edges.map((e) => ({ ...e }))`) and React Flow
  re-routes from scratch with `smoothstep`. The original Phase 2 plan
  (option sweep) was operating on a phantom router. Reordered: Phase 2
  becomes "pipe ELK edge waypoints into React Flow"; the option sweep is
  Phase 2b and only runs once edges actually honor ELK's output.
- 2026-05-02 — Phase 2 LANDED. New `apply_edge_routes` in
  `elk_runner.ts` walks the laid tree, accumulates ancestor offsets so
  waypoints come out in root (flow) space, and writes `data.waypoints`
  onto each `WeftEdge`. New `WeftOrthogonalEdge` component renders the
  polyline with rounded corners (8px, clamped to half the shorter
  incident segment). Registered as `weft-orth` and made the new
  `defaultEdgeOptions.type`. `self-loop` and `loop-back` keep their
  custom components since they're synthetic arcs ELK can't usefully
  route. First implementation stripped ELK's first/last waypoint and
  used React Flow's `sourceX/Y` and `targetX/Y` instead — but ELK's
  port-x and the React Flow handle-x disagree by a few pixels for some
  node kinds (junctions especially), which produced visible diagonal
  stubs at the node boundary and inflated the metrics. Final cut keeps
  ELK's full polyline and accepts the small visual offset; the
  orthogonal property of the path matters more than pixel-perfect
  handle alignment.

  Phase 2 deltas vs Phase-1 baseline:

  | fixture            | crossings | bends   | totalEdgeLength | overlaps |
  |--------------------|----------:|--------:|----------------:|---------:|
  | simple_sequence    | 0 (=)     | 0 (-4)  | 40 (-100)       | 0 (-2)   |
  | all_primitives     | 0 (-2)    | 20 (-62)| 1690.9 (-620.1) | 13 (-15) |
  | full_primitive_set | 0 (=)     | 4 (-24) | 155.5 (-261.5)  | 2 (+2)   |

  `all_primitives`: crossings 2→0, bends -76%, length -27%, overlaps
  -54%. The original "criss-crossing and squiggly" complaint is solved
  — visual is clean orthogonal routes with rounded corners.
  `full_primitive_set` overlaps regressed 0→2, but they're small
  edge-grazes-container-boundary events, not the routing-through-the-
  middle-of-nodes the metric was originally meant to catch. Acceptable.

  Visual ground truth: `.check/layout-metrics-screenshots/all_primitives.png`.

- 2026-05-02 — Phase 2b option sweep — every option tested produced
  EXACT-zero deltas on top of Phase 2:

  - `nodePlacement.strategy: NETWORK_SIMPLEX` — no change. The fixtures
    are already low-crossing, so the placer doesn't reach for a swap.
  - `unnecessaryBendpoints: true` — no change. ELK's orthogonal router
    appears to already strip redundant bends.
  - `mergeEdges: true` — no change. The fixtures don't have parallel
    edges sharing a channel that bundling would visibly tighten.
  - `spacing.edgeNodeBetweenLayers: 40`,
    `spacing.edgeEdgeBetweenLayers: 20` — no change. With Phase 2
    waypoints honored, the default channel widths already lay edges
    out cleanly.
  - `thoroughness: 30` — no change. Crossing-minimisation already
    converges in <7 iterations on these fixtures.

  Skipped: `portConstraints: FIXED_SIDE`. Implementing it requires
  defining explicit port IDs on every node kind (today only `parallel`
  has them) and threading them through both the ELK input and the
  React Flow `Handle` ids. That's a non-trivial refactor of the node
  layer, and the visual is already acceptable, so the cost / benefit
  doesn't pencil. Re-evaluate if a future fixture surfaces a real
  U-turn artifact that demands it.

  Verdict: ELK's defaults are well-tuned for our graph shape. The big
  win was Phase 2 (piping waypoints through), not the option knobs.
  The first attempted sweep on 2026-05-02 above ("zero deltas across
  every metric") was misleading because it ran against the smoothstep
  router; the same conclusion now holds for the right reason.

  Phase 4 (libavoid-js) and Phase 5 (Graphviz benchmark) remain
  optional follow-ups should the 13 remaining `all_primitives`
  overlaps or the 20 bends become a problem in real flows.

- 2026-05-02 — Phase 3 LANDED as `pnpm metrics:vision`
  (`scripts/layout-vision-score.mjs`). Reads the screenshots written by
  `pnpm metrics`, sends each to Claude Sonnet 4.6 with a four-axis
  rubric (`edge_clutter`, `label_readability`, `container_clarity`,
  `balance`, each scored 1–5 plus a weighted `overall`). Each axis
  returns a one-sentence rationale and up to three issues with pixel
  coordinates. The metrics summary is included in the prompt as
  ground-truth context so the model adds visual judgement instead of
  re-counting bends. Output lands at `.check/layout-vision-scores.json`.

  The original framing was "tiebreaker between two ELK option sets",
  but Phase 2b found no real ties to break — every option produced
  zero deltas. The script is still useful as a complementary signal
  when comparing routers (Phase 4) or external benchmarks (Phase 5),
  so it is kept on-demand rather than retired.

  Originally hit the Anthropic HTTP API directly with `ANTHROPIC_API_KEY`;
  switched on 2026-05-02 to spawn the locally-installed `claude` CLI
  (`-p --output-format json --allowedTools Read --add-dir <screenshot-
  dir>`) so the user's existing Claude Code auth (OAuth, API key, Bedrock,
  Vertex) is picked up automatically. `CLAUDE_CLI_BIN` overrides the
  binary path if needed.

- 2026-05-02 — Phase 4 LANDED as a behind-flag spike. New module
  `packages/core/src/layout/libavoid_router.ts` lazy-imports
  `libavoid-js` (added as `optionalDependencies` of `@repo/core`),
  exposes `route_with_libavoid(positioned_nodes, edges)`, accumulates
  parent offsets so libavoid sees absolute screen-space rectangles,
  registers leaf nodes (NOT containers — child-to-sibling edges must
  legitimately cross those boundaries) as `ShapeRef` obstacles, and
  pulls the orthogonal `displayRoute()` polyline back as
  `EdgeWaypoint[]`. `LayoutOptions.router: 'elk' | 'libavoid'`
  (defaulting to `'elk'`) selects the engine; `layout_graph` swaps in
  the libavoid routes after `apply_positions` when the flag is on,
  and silently keeps the ELK routes when the WASM is unavailable.

  Studio plumbing: `ViewRoute` reads `?router=libavoid` and threads
  it through `CanvasShell` → `WeftCanvas` → `layout_options`. Metrics
  script accepts `--router libavoid`, which appends the query
  parameter when navigating each fixture URL.

  Tests `libavoid_router.test.ts` mock the dynamic import three ways:
  load failure (warns once), missing `AvoidLib` export, wrong shape;
  plus a happy-path test with a fake `Avoid` module that verifies
  centre coordinates, ancestor-offset accumulation, and that
  containers are NOT registered as obstacles.

  License caveat noted prominently in `layout_options.ts` and the
  router header: `libavoid-js` is LGPL-2.1-or-later. The plan
  originally cited MPL-2.0; that was wrong. Acceptable behind a flag
  for spike use, but a license review is required before flipping
  the default.

  Functional benchmark on `all_primitives` is the next step: needs a
  manual `pnpm --filter @repo/studio dev` + `pnpm metrics --router
  libavoid --label libavoid` run to compare against the
  `phase-2b-final` baseline. Decision criterion (per original plan)
  was crossings -30%, but `all_primitives` is already at 0
  crossings; the relevant criteria become bends (currently 20) and
  overlaps (currently 13).

- 2026-05-02 — Phase 5 LANDED as `pnpm metrics:graphviz`
  (`scripts/layout-graphviz-benchmark.mjs`). Pulls the canonical
  `{nodes, edges}` from the live studio DOM (same Playwright
  extraction as `pnpm metrics`), serializes to DOT with `splines=ortho`
  and `rankdir=LR` (the standard Graphviz top-level options), runs
  `@hpcc-js/wasm-graphviz` (Apache-2.0) in
  Node, parses the `plain` output (inches × 72 DPI, y-axis flipped
  back), and computes the four standard metrics via the new
  `scripts/lib/layout-geometry.mjs` shared helpers (extracted from
  `layout-metrics.mjs` so the two scorers stay byte-comparable).
  Reports each fixture with a `(±N vs elk)` delta vs the most recent
  `.check/layout-metrics.json`.

  Diagnostic only — Graphviz `splines=ortho` does not understand the
  cluster boundaries or per-node ports the studio relies on, so this
  is for ceiling-detection ("is the residual overlap an engine
  problem or an input-shape problem?"), not a shipping path.

- 2026-05-02 — Visual cleanup pass driven by the new tooling. Three
  bugs surfaced after expanding the canonical fixtures and inspecting
  the rendered DOM via Playwright MCP:

  1. **Marker bloat** (`canvas.css`). An obsolete container-style
     rule still applied `min-width: 212px; min-height: 114px` to
     `.weft-node-checkpoint`, `.weft-node-map`, `.weft-node-timeout`,
     plus the no-longer-rendered `retry`/`loop`. After the BC-deluxe
     refactor those kinds render through `.weft-node-marker` (44×44
     dot with `border-radius: 50%`), so the leftover `min-width`
     ballooned the inner div into 212×114 ovals — the user's "giant
     blue/teal/yellow blobs" complaint. ELK was already laying them
     out as 44×44 boxes (tree_to_graph sets `width`/`height`
     correctly), so layout metrics didn't move; the fix was purely
     visual. Trimmed the rule to just `.weft-node-container.
     weft-node-compose`, which is the only wrapper still rendered as
     a container.

  2. **Unstyled orthogonal-edge labels**. `WeftOrthogonalEdge`
     renders labels via `EdgeLabelRenderer` with class
     `weft-edge-orth-label`, but the class had no CSS. Pre-fix the
     labels were bare text floating over edges and nodes. Mirrored
     the existing self-loop / loop-back pill rule and added per-role
     border tinting (pipe-fn / checkpoint-key → blue, timeout-deadline
     → yellow, map-cardinality → teal, branch/fallback role →
     orange) so a label's chip border matches the line it belongs to.

  3. **Label position landing on a node body**. `compute_orthogonal_
     path` placed the label at the arc-length midpoint, which on
     L-shapes is the corner. Switched to longest-segment midpoint:
     for any polyline the label anchors at the middle of its longest
     run, which keeps "primary" / "<fn:to_upper>" chips on open
     canvas instead of pinned to an elbow. Single-segment edges
     unchanged (longest = only segment).

  Visual ground truth: re-run `pnpm metrics` and compare
  `.check/layout-metrics-screenshots/all_primitives.png` against
  the v0.1.5 baseline. Quantitative metrics are unchanged
  (the bug never affected ELK's coordinates), but the layout reads
  as a tight subway map instead of giant ovals stomping on labels.

  Known residual: short structural edges still place labels inside
  the receiving node's bbox when the only segment crosses the node.
  Fix would require node-bbox-aware label placement (offset the
  pill perpendicular to the segment until it clears every node
  rect), which is a larger change. Acceptable for now.

- 2026-05-02 — Second pass driven by `pnpm metrics:vision` rubric (the
  "after-marker-fix" run scored simple=3.0, all_primitives=2.17,
  full=2.5). Four fixes landed; vision rerun gave simple=3.5,
  all_primitives=2.5, full=2.5.

  1. **Leaf width 184→220px** (`canvas.css`, `elk_runner.ts`,
     `edge_paths.ts`, `libavoid_router.ts`, edge-paths test). Vision
     scorer flagged `STEP:FAREWE…`, `<FN:T…PPER>`, `STEP:SUMMARIZE_S…`,
     `STEP:FORMAT_CLAU…` — all mid-word truncations. 220px gives
     ~22 mono-caps chars at the leaf font; covers the longest titles
     in the canonical fixtures and most realistic step ids. The four
     constants must stay in lockstep so ELK reserves space matching
     the CSS width and the self-loop arc renders to scale.
     Quantitative metrics regress slightly (`all_primitives` len
     +241px, `simple_sequence` overlaps 0→2 — the wider leaves push
     against their SEQUENCE container's bottom border) but the visual
     and the vision-rubric `label_readability` axis improve
     materially (simple_sequence 3→5).

  2. **MiniMap auto-hide + relocation** (`WeftCanvas.tsx`). Under
     `MINIMAP_MIN_NODES = 12` the minimap is hidden entirely (the
     graph already fits in the viewport, so the map adds no
     navigation value); above the threshold it now renders at
     `bottom-right` instead of `top-right`, alongside the existing
     bottom-left controls so the panel reads as part of the chrome
     rather than a stray rectangle in otherwise-empty space. Added
     `nodeColor`/`nodeStrokeColor`/`nodeStrokeWidth` so the minimap
     content is actually visible at the small thumbnail scale.
     Vision scorer's "phantom container in upper-right" complaint
     across all three fixtures resolved.

  3. **Auto-fit padding 0.12→0.08 + maxZoom 1.0** (`WeftCanvas.tsx`
     fit-timer fan). Smaller padding lets wide-and-short graphs fill
     more of the viewport horizontally; `maxZoom: 1` stops fitView
     from over-scaling tiny single-node fixtures. Modest improvement
     — the `balance` axis stays at 2 because the canonical fixtures
     have a 3.2:1 aspect ratio that fundamentally can't fill a 1.27:1
     viewport. Punting on a "rotate to TB on wide graphs" path
     unless future fixtures make balance worse.

  4. **`FIXED_SIDE` ports for branch/fallback** (`elk_runner.ts`,
     `BranchNode.tsx`, `FallbackNode.tsx`, `elk_runner.test.ts`).
     The Phase 2b sweep skipped this because parallel was the only
     ported kind and FIXED_SIDE meant threading port ids through
     every node renderer. Junctions are easier than full coverage:
     branch already declares `out:then`/`out:otherwise` handles and
     fallback declares `out:primary`/`out:backup`, so adding the
     three explicit ports (input on WEST, happy-path on EAST,
     alt-path on SOUTH) plus port-qualified `sources` on the
     emitted ELK edges was self-contained. The visible
     `Position.Bottom` handle on the alt-path output keeps the
     fallback path (no ELK waypoints) visually consistent with the
     orthogonal route. Result: the orange dashed `OTHERWISE` edge
     in `all_primitives` no longer takes a U-turn down-and-around
     past unrelated nodes — it exits the diamond cleanly downward
     to `STEP:SUMMARIZE_SHORT`. `bends` 20→18, `nodeEdgeOverlaps`
     unchanged at 5.

  Deferred from this pass:

  - **Node-bbox-aware edge-label placement** (issue 5 in the
     plan). The longest-segment trick still loses on short
     single-segment edges where the only run crosses a node body.
     Would require feeding measured node bboxes into
     `compute_orthogonal_path` (the helper currently has no
     React-Flow context) and an iterative perpendicular-offset
     search. Cost-to-benefit doesn't pencil for the residual.

  - **Vertical balance**. The `balance` axis stays at 2 across
     fixtures because the canonical graphs are wide-and-short and
     fitView correctly centers them — there is just nothing in the
     vertical extent to fill. If future fixtures emerge that look
     poorly balanced for shape-driven (not aspect-driven) reasons,
     revisit.

  Visual ground truth: `.check/layout-metrics-screenshots/*.png`
  after `pnpm metrics --label visual-cleanup-v3`. Vision scores in
  `.check/layout-vision-scores.json` (rubric: edge_clutter,
  label_readability, container_clarity, balance).

- 2026-05-02 — `pnpm metrics` source/target extraction was broken since
  Phase 1 and only became visible after the leaf-width bump. React Flow
  12 doesn't carry `data-source`/`data-target` attributes on the edge
  group, so `count_node_edge_overlaps` couldn't filter the edge's own
  source/target — it counted every edge endpoint that sat inside its
  own source/target bbox as an overlap. The wider 220px leaves pushed
  ELK's port position (at the leaf's right face) deeper into the leaf
  bbox than the old 184px port did, which made the latent bug fire.

  Fix: parse source/target from `data-id` (always
  `e:<source>-><target>` for our generated edges). Re-baselined
  metrics:

  | fixture            | crossings | bends | totalEdgeLength | overlaps  |
  |--------------------|----------:|------:|----------------:|----------:|
  | simple_sequence    |     0 (=) | 0 (=) |          40 (=) |  0 (-2)   |
  | all_primitives     |     0 (=) | 18 (=)|      1967.9 (=) |  1 (-4)   |
  | full_primitive_set |     0 (=) | 4 (=) |       155.5 (=) |  0 (-2)   |

  The "wider leaves push against their SEQUENCE container's bottom
  border" framing in the previous decision-log entry was wrong; the
  routes themselves were unchanged, only the overlap metric. Other
  fixture metrics that previously claimed an overlap delta against an
  earlier baseline should be read with this caveat in mind.

  Same pass also ported the metrics script's compose-expansion step
  into `scripts/screenshot-scenarios.mjs` so `pnpm screenshots` no
  longer captures the misleading collapsed view.

- 2026-05-02 — Phase 4 BENCHMARK COMPLETE; libavoid stays a behind-flag
  spike, ELK remains the default. Wiring took two extra steps before a
  real comparison ran:

  1. `route_with_libavoid` calls `AvoidLib.load()` with no argument,
     which makes the package resolve `libavoid.wasm` relative to its
     own module URL. In Vite dev that path 404s into the SPA
     `index.html`, the WASM magic-byte check fails, and the load
     silently falls back to ELK — i.e., previous "libavoid" runs were
     all measuring ELK. Threaded an explicit `libavoid_wasm_url`
     through `LayoutGraphOptions` → `route_with_libavoid` →
     `AvoidLib.load(url)`, with the studio resolving the URL by
     copying `libavoid.wasm` into `packages/studio/public/` and
     pointing at `/libavoid.wasm` (sidesteps Vite package-resolution,
     which couldn't find the optional dep from the studio root).
  2. Confirmed Vite serves the WASM with `Content-Type: application/
     wasm` so streaming `WebAssembly.compile()` succeeds.

  Benchmark deltas vs `phase4-benchmark-baseline` (ELK):

  | fixture            | crossings | bends   | totalEdgeLength | overlaps   |
  |--------------------|----------:|--------:|----------------:|-----------:|
  | simple_sequence    |     0 (=) | 0 (=)   |       92 (+52)  | 1 (+1)     |
  | all_primitives     |   5 (+5)  | 0 (-18) | 7124.6 (+5157)  | 19 (+18)   |
  | full_primitive_set |     0 (=) | 0 (-4)  |    858.2 (+703) | 1 (+1)     |

  libavoid loses on every axis. The `bends=0` across all three
  fixtures is the smoking gun — `displayRoute()` is returning
  endpoint-only polylines rather than orthogonal routes, so libavoid
  is effectively drawing straight diagonals through the obstacle
  field. The crossings/length explosion on `all_primitives` follows
  directly from that. Suspected fix-paths if anyone returns to this:
  set per-connector source/destination direction hints
  (`ConnEnd::setDirections`), bump default routing penalties via
  `Router::setRoutingParameter`, or wait for
  `setRoutingOption(nudgeOrthogonalSegmentsConnectedToFixedPorts,
  true)`. None of those are cheap unknowns; we have no in-house
  libavoid expertise and the engine's strengths (channel allocation,
  parallel-edge nudging) only matter once we have flow shapes that
  ELK actually struggles with.

  Decision: do not flip the default. Keep the spike for
  reproducibility (`?router=libavoid` still works once
  `packages/studio/public/libavoid.wasm` is in place — see below),
  but retire libavoid from the layout-quality roadmap until a fixture
  emerges that ELK genuinely can't route. The LGPL-2.1-or-later
  license note in `libavoid_router.ts` and `layout_options.ts`
  remains accurate and stays in place — no license action needed
  while the dep is opt-in and not in the default bundle.

  Reproducing the libavoid path (the WASM blob is gitignored / never
  staged because it is a 492 KB binary; pnpm install pulls the
  package but the studio needs an addressable copy):

  ```sh
  cp node_modules/.pnpm/libavoid-js@*/node_modules/libavoid-js/dist/libavoid.wasm \
     packages/studio/public/libavoid.wasm
  pnpm --filter @repo/studio dev   # in one terminal
  pnpm metrics --router libavoid --label libavoid-spike
  ```

  Visual ground truth for the libavoid run:
  `.check/layout-metrics-screenshots/*.png` after
  `pnpm metrics --router libavoid --label libavoid-spike`. ELK
  baseline at the same `phase4-benchmark-baseline` label.
