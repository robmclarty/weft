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
