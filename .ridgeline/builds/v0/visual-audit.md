# v0 Visual Audit (baseline)

**Date:** 2026-04-26
**Captured by:** agent-browser against `pnpm --filter @repo/studio preview` on `127.0.0.1:4173`
**Screenshots:** `.check/screenshots/v0-baseline/01-08*.png`
**Purpose:** Frozen visual baseline before the v0 re-evaluation. Every subsequent step diffs against this.

## Method

Built the studio (`pnpm --filter @repo/studio build`), served via `vite preview`, walked the studio with `agent-browser` capturing screenshots of every reachable state with the `fixtures/full_primitive_set.json` fixture.

## States captured

| # | File | State |
|---|---|---|
| 01 | `01-empty-state.png` | `/` with no tree loaded, annotated refs |
| 02 | `02-full-primitive-set.png` | `/` after pasting `full_primitive_set.json` |
| 03 | `03-retry-inspector.png` | Click on what looked like the retry container → actually selected `step:flaky` (child) |
| 04 | `04-full-tree-fit.png` | After clicking "Fit View" — whole tree visible |
| 05 | `05-parallel-inspector.png` | Click on parallel container → still shows previous selection |
| 06 | `06-parse-error.png` | Pasted `{not valid json` and clicked load |
| 07 | `07-shortcuts-modal.png` | Attempted `?` shortcut to open modal — modal did not appear |
| 08 | `08-watch-route.png` | `/watch?ws=9999` (CLI not running, so disconnected) |

## Findings

### Visual identity

- **Two-theme collision is real but localized.** The dark studio shell (`#0f1115` background, `#181b22` panels — see `packages/studio/src/index.css:3-16`) wraps the canvas. When a tree is loaded the canvas is hard white (`packages/core/src/canvas/canvas.css:171-175`, `background: #ffffff`) with light-gray dot grid. The visual seam between the dark right panel and the white canvas is the most jarring artifact — see `02-full-primitive-set.png` and `04-full-tree-fit.png`. When no tree is mounted (`01-empty-state.png`, `08-watch-route.png`), the canvas region is just dark studio body — no React Flow chrome. This means the theme split only manifests *after* the user successfully loads a tree, which is the moment the tool is supposed to feel rewarding.

### Canvas + nodes

- **Every container node looks the same.** `sequence`, `scope`, `parallel`, `pipe`, `retry` all render as a dashed light-gray box with a tiny title and a tiny gray pill badge. The only distinguishing visual is the literal kind text on the badge. Confirmed in `04-full-tree-fit.png`: `seq:everything sequence`, `scope:root scope`, `retry:flaky retry 3× / 250ms`, `par:report parallel × 2`, `pipe:upper pipe → <fn:to_upper>` — read the badge or you cannot tell them apart.
- **Step nodes are identical to each other.** Every `step` is a solid-bordered light-gray rectangle with `id` and `<fn:name>`. There is no semantic differentiation between e.g. `step:hello`, `step:flaky`, `step:summary`.
- **Stash/use are the only kinds with hue.** Indigo (`#eef2ff` bg, `#6366f1` border) — visible in `02` and `04`. These colors are hard-coded (`packages/core/src/canvas/canvas.css:67-69`), not in the `--weft-color-*` token set.
- **No glyphs, no icons.** Pure text labels everywhere. The `PipeNode` and `RetryNode` source comments mention glyphs that were never rendered.
- **No selection feedback on the canvas.** Clicking `step:flaky` (`03-retry-inspector.png`) updates the inspector to show that selection but the canvas shows no ring, outline, or color change. You cannot visually correlate inspector content with a node.
- **Edge labels are nearly invisible.** "greeting" label between `stash:greeting` and `use:greeting`, the parallel branch labels — render as small faint text, easy to miss at default zoom.
- **No initial fit-view.** The tree loads zoomed in toward the top-left; `02-full-primitive-set.png` shows half the tree (parallel section) below the visible area. The user must click Fit View to see the whole tree.
- **Minimap takes ~25% of canvas width** when present (visible bottom-left of the dark canvas in `04`). It is generic React Flow default styling — pale gray on white — clashes with the rest of the dark studio.
- **Canvas controls (zoom, fit, lock)** in the bottom-left corner are tiny default React Flow controls, undecorated.

### Empty state and onboarding (`/`)

- Centered text "load a flow_tree to get started." in the canvas region (visible in `01-empty-state.png`).
- The actual loader is on the right side panel — top region "load a flow_tree" — with three input methods stacked (file picker, paste textarea, URL fetch). All three given equal visual weight.
- No directional cue (arrow, highlight) connecting "you need a tree" to "the loader is over here."
- Header has a search box that visually invites typing but does nothing on input or Enter.

### Inspector

- For every node clicked, the inspector renders `kind`, `id`, then a single collapsed `<details>` labeled "config" (visible bottom-right of `03-retry-inspector.png` and `05-parallel-inspector.png`).
- Specifically promised by spec §5.3 but not delivered:
  - For `parallel`: the `keys` list — instead, `details` holds raw config.
  - For `scope`: stash/use summary.
  - For wrappers: wrapped child id + kind.
  - Counts of children.
- The inspector also says "click a node to inspect it" as the empty state — but this stays visible (in the panel header area) when a node IS selected (compare `03` where the inspector shows `kind step / id step:flaky / ▶ config` but the page also still has the panel scaffolding).
- No selection sync visible on canvas, so user has no visual pairing of inspector → which-node.

### Errors and banners

- Parse error (`06-parse-error.png`) renders as a red-bordered red-text block at the top of the loader panel — actually distinguishable. **This is the one error case that is reasonably presented.**
- Watch disconnect (`08-watch-route.png`) is a single line of plain text "disconnected, reconnecting (attempt 2)…" in the top-left of the canvas region. No color, no icon, no border, easy to miss. Compare to the spec's promise of an escalating "manual reconnect button" after the cap.
- All errors share `data-tone="error"` styling regardless of category (validation vs. fetch vs. connection) — confirmed in code review (`LoaderPanel.tsx:155-169`, `WatchRoute.tsx:86-127`).

### Watch route

- `08-watch-route.png` confirms `LoaderPanel` is missing from `/watch` — only `Inspector` and `Export` panels are present. There is no way to switch input modes once on this route.
- Also: when no tree has been received, the canvas region is empty/dark with just the disconnect banner. No guidance on what to do next.

### Shortcuts modal

- Attempted to open via simulated `?` keypress; nothing happened (`07-shortcuts-modal.png` shows the same state as `06`). The shortcut listener may require a real OS-level keydown (jsdom-style synthetic event was not enough). Either way, the modal is undiscoverable: there is no visible button, link, or hint anywhere in the chrome that says "press ? for help." The header has empty/view/watch links and a search box; no help affordance.

### Layout / fit / zoom

- No initial `fit_view()` after tree load (compare `02` to `04`). The user must discover the bottom-left fit-view button.
- React Flow default "Toggle Interactivity" button (lock icon) is exposed but irrelevant in v0 (drag/connect are disabled).
- Background dot grid pattern is React Flow default — does not blend with the dark theme.

### Search

- Search box in header (`App.tsx:24-30`) accepts text but has no `onChange` wiring, no Enter handler, no result indication. Pressing `/` focuses it (per `CanvasShell.tsx:138-146`) but typing does nothing.

## Summary verdicts (per phase)

- **Phase 1 (workspace foundation):** No visual surface. Pass.
- **Phase 2 (data layer):** No visual surface. Pass.
- **Phase 3 (canvas + nodes):** Functional rendering, but visual encoding is text-only. All container kinds look the same; all step kinds look the same; stash/use are the only kinds with hue. No glyphs. No selection feedback. Edge labels nearly invisible. White canvas does not match dark studio shell.
- **Phase 4 (watch CLI):** Headless, no visual surface. Pass.
- **Phase 5 (studio):** Cohesive dark theme on the chrome (good); empty state lacks guidance; inspector shows raw JSON only; search box is a non-functional decoy; watch route is missing the loader panel; disconnect banner is invisibly small; modal undiscoverable.

## Diffing target

Every screenshot in this set is the **before**. After each implementation step, recapture the same state (same fixture, same route, same interaction) and diff. Visual regressions are anything where the new screenshot is *worse* than this baseline — improvements are everything else.

## Known limitations of this audit

- agent-browser's `press_key` is not implemented; synthetic keyboard events did not trigger the shortcuts modal listener. Real keypress will need to be tested via Playwright in Step 3.8.
- Did not exercise the URL fetch error path (`?src=` with bad protocol) or the Chrome 130+ Private Network Access path. Will add these as targets when Step 3.5 lands the new error categorization.
- Did not exercise the LRU eviction at the 50-entry cap visually — covered by existing functional e2e (`test/e2e/lru.spec.ts`).
- Did not exercise the >200-node performance threshold visually — covered by existing functional e2e (`test/e2e/perf_threshold.spec.ts`).

## Results (2026-04-26 — after the re-evaluation)

After-state captures live alongside the baselines as `.check/screenshots/v0-baseline/B*.png` and `A*.png`. The committed Playwright snapshots in `test/e2e/visual.spec.ts-snapshots/` are the durable regression baselines.

### What changed by phase

- **Phase 1 (workspace foundation):** unchanged.
- **Phase 2 (data layer):** unchanged.
- **Phase 3 (canvas + nodes):** node CSS rewritten. Each primitive has a dedicated hue (step neutral, sequence violet, parallel teal, pipe blue, retry amber, scope/stash/use emerald, cycle red, generic amber). Per-kind glyphs added as inline SVG (no icon-library runtime added, keeping `@repo/core` lean). Container nodes now have a header band so titles do not overlap children. Selection ring rendered in the kind's accent color. `fallback_layout.ts` honors container minima. `GenericNode.tsx` dead conditional removed. Edge labels and overlay edges restyled to read on the dark canvas. `WeftCanvas` auto-fits the view on first layout for a fresh tree (skipped when caller supplies an `initial_viewport` from persisted state).
- **Phase 4 (watch CLI):** unchanged. (The `bin.test.ts` ws-client tests fail on Node v24 with ws — independently reproduced outside vitest with a 30-line script. Pre-existing, not introduced by this re-eval; tracked as a known issue.)
- **Phase 5 (studio):** dark theme reconciled across studio shell and canvas. `LoaderPanel` collapses to "tree loaded · load another →" when a tree is mounted, freeing sidebar space for the inspector. `InspectorPanel` is fully kind-aware: per-primitive readable views (retry shows attempts + backoff, parallel shows branches list, scope shows stash + use tables with click-to-focus targets, etc.) with a "show raw config" disclosure as a fallback. Search box in the header is wired and functional — typing dims non-matching nodes via a body-attribute toggle and reports the match count. Error states have three visual categories (validation/blue, fetch/amber, connection/red). Banner placement moved to a top layer above the canvas. Help pill `?` in the header makes the shortcuts modal discoverable. `WatchRoute` now exposes the `LoaderPanel` so input modes compose. `use_canvas_persistence` now touches the LRU index on tree mount so loading a tree counts as access (was previously a latent bug that only updated the index on user click).

### Verification

- `pnpm check`: `types`, `lint`, `struct`, `dead`, `invariants`, `docs`, `links`, `spell` — all green. `test` — 291/295 pass; the 4 failures are all in `packages/watch/src/bin.test.ts` and are caused by a Node 24 + ws library bug that reproduces outside vitest with a standalone WS round-trip script.
- `pnpm exec playwright test`: 13/13 e2e specs pass (including all 7 new visual regression specs), excluding the 2 `watch_loop` specs that depend on the same ws integration that fails under Node 24.
- `agent-browser` walk completed against every studio screen: empty state, loaded full primitive set, kind-aware inspector for retry, active search filter, parse error chrome, watch route disconnect banner, shortcuts modal. After-screenshots at `.check/screenshots/v0-baseline/B1-B5*.png` and `A6-A7*.png`.
