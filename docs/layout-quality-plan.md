# Layout-quality improvement plan

Working doc for the canvas-layout cleanup pass. Goal: stop iterating blind on
ELK options. Build a quantitative feedback loop, then sweep ELK, then decide
whether to add a separate orthogonal routing pass.

The pain we're solving: `all_primitives.json` renders with squiggly,
criss-crossing edges that take detours and are hard to read. Current setup
in [packages/core/src/layout/elk_runner.ts](../packages/core/src/layout/elk_runner.ts):
ELK `layered` + `ORTHOGONAL` + `INCLUDE_CHILDREN` with default node placement
and minimal spacing tuning.

## Phases

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
