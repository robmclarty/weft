# Phase 5: Studio + Integration + Hardening

## Goal

Deliver `@repo/studio` (the Vite SPA users open in a browser) and the cross-cutting hardening that turns v0 from "library + CLI work in isolation" into "the everyday fascicle hacking loop works end-to-end". After this phase, the user writes a test that calls `describe.json(flow)` and writes the result to `/tmp/flow.json`, runs `weft-watch /tmp/flow.json`, and sees the composition rendered with live updates.

The studio implements all four input modes (drag-drop, paste, URL fetch with the security restrictions in spec §4.2, watch socket), the inspector panel, the keyboard shortcuts, and per-tree localStorage persistence with the FNV-1a hash key, the 50-entry LRU index, and `QuotaExceededError` handling. It dogfoods `@robmclarty/weft` — never importing `@repo/core` directly — proving the umbrella's surface is sufficient for a real consumer.

The WebSocket client implements exponential-backoff-with-jitter reconnect against the envelope phase 4 defined, with a disconnect banner and a manual-reconnect button after ~12 attempts. Five end-to-end integration tests cover the full system (load, watch loop, reconnect, PNG export, localStorage LRU).

The acceptance bar at the end of this phase is the same as every prior phase's: `pnpm check` exits 0 — but the surface area being checked is now the entire system.

## Context

Phases 1–4 delivered the workspace, the data layer, the canvas + library umbrella, and the watch CLI with its WebSocket message envelope. The studio package's manifest exists from phase 1; this phase fills in `packages/studio/src/`.

The studio depends on `@repo/weft` (workspace) and **does not** depend on `@repo/core`. Phase 1's mechanical check (constraints §7 invariant 8) is exercised here against real source. The studio's WebSocket client implements the consumer side of the envelope phase 4 defined.

The single source of truth for "done" remains `pnpm check` exiting 0. New tests added in this phase run inside the existing pipeline.

Inputs: spec.md §3 (canvas_state shape, LRU bookkeeping), §4.2, §4.4 (declare-but-ignore the `events` prop), §5.3, §5.4, §5.5 (consumer side), §5.6 (consumer side, validates phase 3's PNG path), §6 (perf hardening verified end-to-end), §8 F1 / F3 / F7 / F8 / F9 / F10 / F11, §9, §10, §11, §12; constraints.md §3 (studio import rules), §4 (forbidden deps), §5.3, §5.4, §5.5, §5.6, §7 invariants 3, 4, 5, 6, 7, 8 (re-verified), §9; taste.md principles 1, 2, 7, 9; design.md §3, §4; the full library + watch CLI from phases 1–4.

## Acceptance Criteria

1. `pnpm check` exits 0 across the entire workspace after this phase completes.

### Studio package

2. `packages/studio/` builds via Vite and runs locally with `pnpm dev`. The `package.json` declares `@repo/weft` (workspace) as a dependency and **does not** declare `@repo/core`.
3. `packages/studio/src/` source files import from `@repo/weft` (the umbrella), never from `@repo/core` directly. The mechanical check from phase 1 (constraints §7 invariant 8) passes against the new source.
4. `packages/studio/src/` reads no `process.env` (constraints §2 / §7 invariant 3). The mechanical check passes.

### Routes and loaders

5. The studio implements three routes: `/` (empty canvas + loader panel), `/view?src=<url>` (fetches and renders), `/watch?ws=<port>` (subscribes to a localhost WebSocket and renders pushed trees).
6. The `/view?src=` URL-fetch loader (per research F13): restricts `URL.protocol` to `https:` or `http://localhost`; rejects `file:`, `javascript:`, `data:` schemes; rejects any non-localhost `http:` URL; uses `fetch(url, { credentials: 'omit', redirect: 'error' })`. CORS / Private Network Access errors surface as fetch errors with a hint pointing the user toward the watch CLI.
7. All loader error UI (validation, fetch, WebSocket) renders error text via React children only. A grep verifies `dangerouslySetInnerHTML` does not appear anywhere under `packages/studio/src/`.
8. The drag-drop loader accepts a `.json` file. The paste loader accepts JSON pasted into a textarea. Both auto-wrap a bare `FlowNode` into a `flow_tree { version: 1, root }` envelope before validation. Zod failures surface the offending JSON path inline and **do not replace** the previously-rendered canvas (constraints §5.3, spec §5.4).

### Inspector and interaction

9. The inspector panel opens on node click and shows: `kind`, `id`, pretty-printed `config`, wrapped-child summary for wrapper kinds, and per-kind summaries (e.g. `parallel` keys, `scope` stash/use lists) for container kinds. Clicking the background clears selection.
10. Double-clicking a container toggles its collapsed state; collapsed containers render as a single node with a child-count badge; collapsed state persists per-tree (spec §5.3).
11. Keyboard shortcuts work: `f` (fit view), `/` (focus search box), `Escape` (clear selection), `?` (show shortcut help modal). A test verifies each shortcut's effect.

### Per-tree localStorage

12. Per-tree localStorage uses the key `weft.canvas.<tree_id>` where `tree_id` comes from `@repo/weft`'s FNV-1a hasher. The persisted shape matches spec §3 `canvas_state` (zoom, viewport, selected_node_ids, collapsed_node_ids).
13. The LRU index `weft.canvas.index` is capped at 50 entries; the oldest (by `last_access`) is evicted on overflow. An integration test writes 51+ canvas states and asserts the index never exceeds 50 and the oldest is evicted.
14. Every `setItem` is wrapped in try/catch. On `QuotaExceededError`, the studio evicts aggressively from the index and retries. Failure to persist never crashes the canvas (spec §8 F10). A test simulates `QuotaExceededError` and verifies graceful recovery.
15. Two tabs viewing different trees do not share canvas state (constraints §5.4). Verified by a test that writes state for tree A, opens tree B, asserts B starts fresh, returns to A, asserts A's state restored.

### WebSocket client

16. The studio's WebSocket client consumes the envelope phase 4 defined (`{ kind: 'tree' | 'unreachable' | 'invalid', ... }`). On `tree` messages it re-runs the static path (transform → layout → render). On `unreachable` messages it surfaces a banner and **retains the last known tree** until a subsequent `tree` message arrives (spec §8 F7). On `invalid` messages it surfaces an inline error in the loader panel without replacing the canvas (mirrors the validation-at-boundary behavior).
17. The WebSocket client implements exponential backoff with jitter (per research F10): on `close`, retry after `min(30s, 500ms × 2^attempt) + random(0..500ms)`. A "disconnected, reconnecting…" banner surfaces during retry. The attempt counter resets on a successful connect. After ~12 attempts (~10 minutes) the banner switches to a manual reconnect button. No `reconnecting-websocket` or equivalent dependency is added — implementation is inline (~40 lines).

### Integration tests (run against real `@robmclarty/weft` and the real `weft-watch` binary)

18. **End-to-end load:** a real `describe.json(flow)` output (or a representative fascicle test fixture) loads via the file loader, renders, and the test asserts expected node count and primitive kinds.
19. **Watch loop:** spawn the phase 4 CLI against a fixture, connect a headless browser, modify the file, assert the canvas updates within 500ms.
20. **Reconnect:** kill the CLI mid-stream, assert the studio surfaces the disconnect banner; restart the CLI, assert the studio reconnects within the backoff window.
21. **PNG export:** trigger export from the studio, assert a non-zero blob with `image/png` MIME, and assert the captured bounds match `getNodesBounds` for a known fixture.
22. **localStorage LRU:** write 51+ canvas states, assert `weft.canvas.index` never exceeds 50 entries and the oldest is evicted.

### Performance hardening — end-to-end verification

23. The 200-node threshold behavior implemented in phase 3 is verified end-to-end in the studio: a fixture with > 200 nodes engages `OnlyRenderVisibleElements` and disables the minimap while panning (spec §6, research F12). A test loads the fixture and asserts the threshold-driven prop changes.

### Architectural invariants — final re-verification

24. The remaining mechanical CI checks from constraints §7 are re-verified against real source from this phase:
    - invariant 3: no `process.env` in `packages/studio/src/`
    - invariant 4: snake_case for exported value symbols and public parameter names; PascalCase for type aliases, interfaces, and React components — across the studio's source
    - invariant 5: `@repo/weft/src/` still contains only re-exports
    - invariant 6: `@repo/core/src/` still has no value imports from `@robmclarty/fascicle`
    - invariant 7: `@repo/watch/src/` still does not import `react`, `react-dom`, `@xyflow/react`, or `elkjs`
    - invariant 8: `@repo/studio/src/` does not import `@repo/core` directly

### Documentation and distribution

25. The CSP for the hosted-demo build is documented in `README.md` or a `deploy/` note (spec §12): `script-src 'self'; worker-src 'self' blob:; connect-src 'self' ws://localhost:* wss:; img-src 'self' data: blob:; style-src 'self';`. The dev server stays CSP-free.
26. Root `README.md` documents: the watch loop (write a fascicle test that emits `describe.json` output, point `weft-watch` at the file, iterate); the Safari PNG and 7-day localStorage limitations (spec §8 F11 and §3 LRU bookkeeping note); the Chrome 130+ Private Network Access caveat (spec §4.2 and §8 F9); and the workspace symlink hot-reload story (open question §13.7).
27. The published-shape sanity check holds: `@robmclarty/weft` and `@robmclarty/weft-watch` are independently installable in shape — declared `bin`, declared `exports`, declared `peerDependencies` resolve. (Actual npm publish is out of scope; the manifests must be correct.)
28. Coverage floor of 70% lines / functions / branches / statements is met for `@repo/studio` and (re-verified) for `@repo/watch`. Coverage for the workspace as a whole continues to meet the floor.

## Spec Reference

- spec.md §3 (canvas state shape, LRU bookkeeping, FNV-1a hasher consumption)
- spec.md §4.2 (Studio app interface — URL routes, file loader, keyboard shortcuts, security restrictions on `?src=`)
- spec.md §4.4 (Trajectory event contract — declared but unused in v0)
- spec.md §5.3 (Node interaction — inspector contents, double-click toggles collapse)
- spec.md §5.4 (File loading and validation — Zod at the boundary, no `dangerouslySetInnerHTML`, no replacement of previous canvas on failure)
- spec.md §5.5 (Watch mode — consumer side; reconnect protocol per research F10)
- spec.md §5.6 (PNG export — verified end-to-end against the phase 3 implementation)
- spec.md §6 (Performance optimizations — 200-node threshold verified end-to-end)
- spec.md §8 F1 (malformed JSON), F3 (large trees — perf hardening), F7 (file deleted/moved — banner), F8 (WebSocket disconnect — backoff), F9 (URL fetch failure / PNA), F10 (localStorage quota), F11 (Safari PNG limitations — documented)
- spec.md §9 (Success Criteria — integration tests, architectural validation including remaining invariants)
- spec.md §10 (File Structure — `packages/studio/`)
- spec.md §11 (Environment Variables — none required)
- spec.md §12 (Content Security Policy for hosted demo)
- constraints.md §3 (Studio import rules)
- constraints.md §4 (Forbidden dependencies — no HTTP clients, no telemetry, no logging libraries beyond `console`)
- constraints.md §5.3, §5.4, §5.5 (consumer side), §5.6 (no telemetry)
- constraints.md §7 invariants 3, 4, 5, 6, 7, 8 (re-verified)
- constraints.md §9 (Testing Requirements — no real network in default CI, integration tests use a localhost socket spun by phase 4's CLI)
- taste.md principles 1, 2, 7, 9
- design.md §3 (Static path + Watch path data flows), §4 (Studio file structure)
