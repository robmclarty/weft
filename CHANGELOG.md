# Changelog

## v0.1.7 — 2026-05-03

### Changed

- Sequence and scope no longer emit visible chrome — they were structural-only, so their children lift to peers and read directly under whatever was hosting them. Compose is now the only kind that produces a visible outer box, eliminating the rectangles-within-rectangles stack the canvas had accumulated.

### Fixed

- ELK-routed edges now actually touch the nodes they connect. Two dimension mismatches were leaving arrows hovering near shapes: (1) steps with wrapper badges render 88px tall via CSS but ELK was routing to a 60px box, so endpoints landed 14–28px off the visual handle; (2) `stash`/`use` rendered as 220×60 pills while ELK sized them as ~280×136 containers (because they parent their wrapped child), so structural and overlay edges landed on the invisible bigger box instead of the visible pill. Wrapped leaves now pin their height to ELK's input; parented stash/use switch to container chrome that fills ELK's computed bounds.

### Internal

- Visual e2e snapshots refreshed to match the new chrome rules.

## v0.1.6 — 2026-05-02

### Changed

- Wrapper-primitive chrome reworked: `pipe`, `timeout`, `checkpoint`, and `map` now render as inline corner badges on the wrapped step instead of separate 44×44 marker peer nodes connected by decorated edges. The structural chain runs step → arrow → step instead of threading through tiny marker dots, making lineage easier to follow. On `all_primitives`: nodes 24 → 20, edges 15 → 11, total edge length 6148 → 3968 (-35%), bends 22 → 18, vision-LLM rubric 2.2 → 2.83.
- Edge labels render as text with a paper text-stroke halo instead of bordered pills, anchored to the longest segment's midpoint so chips land on open canvas instead of pinned to elbows.
- ELK spacing now threads per-container, so `node_spacing` / `rank_spacing` reach nested subgraphs — previously sequence steps inside a parent collapsed to ~20px gaps regardless of root spacing. Defaults bumped to 120 / 200 with `minZoom: 0.1` so dense graphs auto-fit naturally.
- `loop` with a guard child now chains body → guard sequentially with the loop-back arc going guard → body, so the guard step is no longer an orphaned block.
- Leaf node width 184 → 220px to stop mid-word truncation on canonical fixtures.
- Branch / fallback junctions use FIXED_SIDE ports: input WEST, happy-path EAST, alt-path SOUTH. The dashed `otherwise` edge no longer U-turns through the diamond past unrelated nodes.
- MiniMap hides under 12 nodes and moves to bottom-right with a visible node fill; vision scorer kept flagging it as a phantom rectangle on small graphs.
- `fitView` padding 0.08 + maxZoom 1.0 so wide-and-short graphs fill the viewport without single-node fixtures ballooning, and auto-fit retriggers when a compose is opened.

### Fixed

- `pnpm metrics` overlap counter was broken since Phase 1: React Flow 12 dropped `data-source` / `data-target` from edge groups, so the source/target filter never fired and every edge endpoint sitting inside its own bbox got counted. Endpoints now parse from `data-id`. Re-baselined: `simple_sequence` overlaps 2 → 0, `all_primitives` 5 → 1, `full_primitive_set` 2 → 0.
- `route_with_libavoid` was silently falling back to ELK on every prior libavoid run — `AvoidLib.load()` resolved `libavoid.wasm` relative to its own module URL, which Vite's dev server intercepted with the SPA `index.html`. Now threads an explicit `libavoid_wasm_url` through `LayoutGraphOptions` → `route_with_libavoid` → `AvoidLib.load(url)` and serves the blob from `packages/studio/public/libavoid.wasm`.
- `pnpm screenshots` now clicks every collapsed compose before snapping (mirroring `pnpm metrics`); previous output was the misleading single-root view.

### Internal

- Phase 4 (libavoid spike) closed out: with the WASM-path bug fixed, libavoid loses on every axis (`all_primitives`: crossings +5, length +5157px, overlaps +18; bends=0 across the board indicates straight-line routing through obstacles). Decision: keep `?router=libavoid` as a behind-flag spike, do not flip the default. LGPL-2.1-or-later license note stays in `libavoid_router.ts` and `layout_options.ts` while the dep is opt-in.
- `pnpm metrics:vision` now spawns the local `claude` CLI (`claude -p --output-format json --allowedTools Read --add-dir <screenshot-dir>`) instead of calling the Anthropic SDK directly. Picks up existing Claude Code auth (OAuth, API key, Bedrock, Vertex); `ANTHROPIC_API_KEY` no longer required for local runs. `CLAUDE_CLI_BIN` overrides the binary path.
- `.gitignore` excludes `packages/studio/public/libavoid.wasm` (492 KB binary copied from `node_modules` at dev time) and `.claude/scheduled_tasks.lock` (transient Claude Code harness state that was tripping the release-script clean-tree guard).
- `docs/layout-quality-plan.md` updated for the libavoid WASM copy step and the visual cleanup pass.

## v0.1.5 — 2026-05-02

### Added

- `pnpm metrics:vision` — Claude vision-LLM scorer that rates each fixture screenshot from `pnpm metrics` on a four-axis rubric (edge clutter, label readability, container clarity, balance) and writes structured scores plus pixel-cited issue locations to `.check/layout-vision-scores.json`. Needs `ANTHROPIC_API_KEY`.
- `pnpm metrics:graphviz` — diagnostic-only Graphviz `dot` benchmark that lays the fixtures out with `splines=ortho rankdir=LR` and reports the same crossings / bends / length / overlap metrics as `pnpm metrics`, with deltas vs the most recent ELK run. Answers whether residual visual issues are an engine ceiling or a property of the input shape.
- Layout-options `router: 'elk' | 'libavoid'` flag (defaults to `'elk'`) plus studio `?router=libavoid` URL query. The libavoid path routes edges with `libavoid-js` after ELK has placed nodes; falls back silently to ELK routes when the optional WASM dep is unavailable. Behind-flag spike — `libavoid-js` is LGPL-2.1-or-later, so a license review is required before flipping the default.

### Internal

- `scripts/lib/layout-geometry.mjs` extracts the crossings / bends / length / overlap helpers shared by `pnpm metrics` and `pnpm metrics:graphviz` so the two scorers stay byte-comparable across engines.
- `pnpm metrics --router libavoid` benchmarks the libavoid spike against ELK head-to-head on the same fixtures.

## v0.1.4 — 2026-05-02

### Changed

- Canvas edges now render the orthogonal route ELK actually computed (with rounded corners), not a smoothstep approximation re-routed from source/target handles. On the `all_primitives` fixture this drops crossings 2→0, bends 82→20, edge length 27%, and node-edge overlaps 54%. Self-loop and loop-back arcs keep their dedicated components; everything else falls through to the new `weft-orth` edge type.

### Internal

- New `pnpm metrics` (`scripts/layout-metrics.mjs`) drives Playwright through the canonical fixtures and writes per-fixture crossing / bend / length / overlap counts to `.check/layout-metrics.json` for quantitative regression checks.
- `docs/layout-quality-plan.md` documents the layout-quality investigation, baseline metrics, and the Phase 2b ELK option-sweep results (every option produced exact-zero deltas on top of the waypoint pipe — the defaults are already well-tuned for our graph shape).

## v0.1.3 — 2026-05-02

### Changed

- Test files moved into colocated `__tests__/` folders (e.g. `packages/core/src/__tests__/schemas.test.ts`) so the main package directories stay quiet. Source-and-test colocation is preserved, just one level down. AGENTS.md updated to reflect the new convention.

## v0.1.2 — 2026-05-02

### Added

- Subway-map visual refresh for the canvas: cream paper ground, saturated kind family hues (orange / teal / yellow / blue / magenta / green / ink), thick non-scaling ink edges, orthogonal edge routing, mono-uppercase typography.
- Retry now renders as a yellow self-loop arc above the wrapped child labeled `↻ 3× / 250ms`; loop renders as a magenta sweep returning right-out → left-in labeled `↺ ≤ N`.
- Pipe / timeout / checkpoint / map render as small kind-tinted marker dots; their config rides on a decorated edge (`<fn:name>`, `⏱ Xs`, `■ key`, `× n`) connecting them to their now-peer wrapped child.
- Branch / fallback / parallel render as diamond junction nodes with role-tagged outgoing edges — `then` / `primary` solid orange, `otherwise` / `backup` dashed orange, parallel branches preserving FIXED_ORDER per-key handles.
- Compose nodes load collapsed by default with a `▸` chevron; clicking toggles expansion (`▾`) to reveal the inner subgraph and re-runs layout.
- Followup plan for the wrapper / junction topology rework documented in `docs/canvas-redesign-bc-deluxe.md`.

### Changed

- Wrapper container chrome dropped: pipe / timeout / checkpoint / map / retry / loop and branch / fallback / parallel no longer nest their children. `tree_to_graph` lifts them to peers and emits markers or junctions; the canvas reads as a flat-ish chain instead of nested boxes.
- ELK defaults bumped to give the new thick orthogonal edges routing room: `node_spacing` 24 → 56, `rank_spacing` 56 → 96, container header band 32 → 40, padding 10 → 14.
- Studio chrome (header, panels, inspector, loader, banners) re-skinned to match the paper palette with mono-uppercase labels.

### Fixed

- Watch ws-client integration tests no longer flake under event-loop scheduling races. The harness now buffers messages from WebSocket construction, not after the `'open'` event, so server sends that land during the upgrade aren't dropped.
- Retry self-loop and loop back-edge geometry scales to the source node's measured bounds and routes to the real left-in handle instead of hardcoding 184px or pinching to a single point.

### Internal

- Edge-path math extracted to pure helpers (`compute_self_loop_path`, `compute_loop_back_path`) with focused Node-env unit tests.
- Dead post-deluxe code removed: `RetryNode.tsx`, `LoopNode.tsx`, `walk_parallel_children`, `walk_labeled_children`, and their case handlers in `walk()`.
- Coverage lifts: `search.ts` test suite added; coverage above the 70% branches threshold.
- markdownlint MD024 set to `siblings_only: true` so the CHANGELOG-per-version convention of repeating `### Added` / `### Fixed` etc. doesn't trip no-duplicate-heading.

## v0.1.1 — initial release — 2026-05-01

First tagged release. Ships the full v0 build (static viewer) plus the post-v0 work that lays down v1's runtime-overlay machinery without yet wiring its transport.

### Added

- `@robmclarty/weft` — React Flow-based static visualizer for fascicle composition trees. Sixteen primitive node components covering every primitive currently in fascicle's core (`step`, `sequence`, `parallel`, `branch`, `map`, `pipe`, `retry`, `fallback`, `timeout`, `loop`, `compose`, `checkpoint`, `suspend`, `scope`, `stash`, `use`) plus a generic fallback for unknown kinds. ELK-based layout in a Web Worker. Dark theme with per-kind visual encoding.
- `@robmclarty/weft-watch` — Node CLI that tails a `FlowTree` JSON file and pushes updates to the studio over a localhost WebSocket. Exponential-backoff reconnect on the client.
- `@repo/studio` — Vite SPA. Loader panel (drag/drop, paste, URL fetch), kind-aware inspector with search, persistent canvas viewport (LRU-bounded localStorage), `/view` and `/watch` routes.
- Runtime-state machinery (foundation for v1 live overlay). Trajectory-event schema mirror of fascicle's wire format, `derive_runtime_state` reducer, `RuntimeOverlay` per-node chrome, studio socket pre-wired to validate and buffer `event` envelopes. Transport (CLI → studio) is the one remaining v1 build.
- Visual testing harness — Playwright e2e suite (boots studio via `vite preview`), screenshot baselines, Playwright MCP wired for in-Claude visual iteration.
- `pnpm check` agent contract — single command runs types, lint, struct, dead, invariants, test, docs, spell. Outputs structured diagnostics under `.check/` for tools to consume.

### Internal

- pnpm workspace with four packages (`core`, `weft`, `studio`, `watch`); ridgeline build pipeline drove the v0 phases.
- Architectural invariants enforced by `scripts/check-invariants.mjs` (no unsafe-eval; spec §7 constraints).
- ast-grep structural rules in `rules/`; fallow boundary checks in `fallow.toml`.
- Specs under `.ridgeline/builds/{v0,v1,v2}/` document the shipped v0 build and reconciled forward-looking v1/v2 plans.
