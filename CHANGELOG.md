# Changelog

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
