# Changelog

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
