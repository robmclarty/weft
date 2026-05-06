# Learnings

Durable, cross-build observations about this repo. Append entries; do not rewrite history.

## Tooling

### `pnpm add -Dw` does not always relink workspace symlinks (2026-04-25)

After running `pnpm add -Dw <pkg>` (or other root-level dep mutations) in this workspace, the per-package `node_modules/@repo/*` symlinks may not be recreated. The next `pnpm check` then fails on `tsc` and `vitest` with `Cannot find module '@repo/core'` (or similar) even though the workspace package exists. A second `pnpm install` recreates the symlinks and the check goes green.

**Reproduction:** during the visual-testing scaffolding (April 2026), `pnpm add -Dw @playwright/test` and `pnpm add -Dw agent-browser` both reported success but left `packages/weft/node_modules/@repo/` empty. A follow-up `pnpm install` restored the links. Likely a pnpm v10.33 + workspace interaction; not the fault of any code in the repo.

**Apply:** Whenever a phase adds, removes, or upgrades a root-level dependency (`pnpm add -Dw`, `pnpm remove -w`, etc.), run a follow-up `pnpm install` before declaring the change done. If `pnpm check` reports `Cannot find module '@repo/<name>'` after a root-dep mutation, do not chase a `tsconfig` or import-path fix — run `pnpm install` first.

## Build: v0 (2026-04-26)

### What Worked

- Five-phase decomposition (manually revised from initial 2 phases) held: every phase passed reviewer on the first non-transient attempt, zero substantive retries across the entire build.
- Reviewers consistently produced specific, decision-ready verdicts citing exact metrics (coverage %, test counts, constraint violations checked) rather than vague approvals — see phase-2/3/4/5 review summaries.
- The "sandbox-skipped via chromium probe" pattern established in phase 3 was reused cleanly in phases 4 and 5 (loopback-gated tests, e2e suite), preventing environmental friction from blocking phase advancement.
- Hard architectural invariants (no `@repo/core` imports in studio, weft re-exports only, no class/default-export/process.env/unsafe-eval, pinned `html-to-image@1.11.11`, `@xyflow/react>=12.2`) were enforced and verified at every phase boundary.
- Coverage floor (70%) was exceeded on every package at every phase — workspace-wide finished at 85/82/82/72.

### What Didn't

- Research stage burned ~10 minutes on two failed iterations (competitive + academic specialists timed out twice at 23:41 and 23:55) before the third attempt at 00:58 succeeded — no diagnosis recorded.
- Phase 01 had **5 transient build failures** before completing: 3× "Cannot use both --append-system-prompt and --append-system-prompt-file" (harness misconfiguration), then 2× stream-json parse / stall failures. Then the post-build review stalled at 300s and a follow-up build attempt failed before a fresh phase-01 run succeeded.
- Phase 02 builder also hit a 43-minute stall on attempt 1 before attempt 2 succeeded in 2.5 minutes — suggests the stall detector caught a hung process, not a slow one.
- Reviewer for phase 01 never recorded a successful review event in the trajectory, yet phase 01 is marked complete with retries=0 — the state machine and trajectory disagree on what actually happened.

### Patterns to Repeat

- Manual plan revision from 2 → 5 phases before any build started: spread risk into checkpoints small enough that each builder run produced a reviewable, mergeable unit.
- Reviewer summaries that enumerate every constraint checked + concrete metrics — these make retrospective auditing trivial and would make a failed review immediately actionable.
- Documenting environment-specific deviations (chromium sandbox, loopback gating) inside the phase handoff rather than papering over them — reviewers explicitly accepted these as known carve-outs.
- Pinning exact dependency versions in constraints (`html-to-image@1.11.11`) and having the reviewer verify the pin — caught zero violations but the discipline is what made that possible.

### Patterns to Avoid

- Phase 03 ballooned to **$33.61 / 39 minutes / 138k output tokens** in a single builder run. That much surface area in one phase (layout pipeline + WeftCanvas + 10 node components + canvas_api + PNG export + perf hardening + umbrella re-exports) is a single point of failure — if review had bounced, the retry would have been brutal. Same shape for phase 05 at $44.59 / 56 min / 173k output tokens.
- Long-running builders without intermediate checkpoints: a phase-03-style run that fails at minute 38 wastes the entire spend with no partial recovery.
- The harness `--append-system-prompt` / `--append-system-prompt-file` mutual-exclusion bug burned 3 retries on phase 01 before falling through — there's no learning loop that demoted this from "transient" after the third identical failure.

### Cost Analysis

- **Total: $116.94, ~5.5h wall-clock from first build_start to final phase_advance** (excluding ~3h of research/refine/plan upstream).
- Builders dominated: $98.6 (84%) of total. Phases 03 + 05 alone were $78.2 (67% of the build).
- Reviewers were efficient: $9.0 total across 4 reviews, averaging ~$2.25 each — about 9% of builder spend.
- Cache utilization was strong on the long phases (phase 05 read 74M cached tokens vs 478k created), suggesting the prompt-cache strategy was well-tuned. Without that, phase 05 alone would have cost multiples more.
- Plan stage cost $3.65 across two attempts (the 2→5 phase revision); this was clearly worth it given the clean downstream execution.

### Recommendations for Next Build

- Split any phase projected to exceed ~$15 / 20 min / 80k output tokens into two checkpoints. Phase 03 and phase 05 should each have been two phases — the cost of an extra reviewer pass (~$2) is trivial insurance against a failed build of that size.
- Add a harness pre-flight that detects the `--append-system-prompt` mutual-exclusion failure and converts it from "transient retry" to "fatal config error" on the first occurrence — re-trying an idempotent CLI misconfiguration 3× is pure waste.
- Investigate the phase-02 attempt-1 stall (43 min before stall-timeout fired) and the phase-01 review stall — the 300s no-output detector worked but only after 5+ minutes of dead time per occurrence. Consider a shorter idle threshold for builds known to emit progress events.
- Reconcile phase-01's `retries: 0` in state.json with the trajectory showing 5 failed attempts + a missing review — the retry counter appears to reset across the harness restart at 03:07, hiding real failure cost from future planning heuristics.
- Capture the chromium-sandbox + loopback-gating skip patterns as reusable constraint snippets in the constraints library so future builds inherit them rather than re-deriving the carve-out per phase.

## Build: post-v0 visual evolution (2026-05-02 → 2026-05-04, manual phases)

The "subway map" redesign and topology rework that landed across v0.1.2 → v0.1.10 was *not* a ridgeline build — it was a sequence of manual phases the user drove with Claude Code (Opus). The visual tokens it produced now live in [`design.md`](./design.md); the per-kind topology rules live in [`docs/canvas-redesign-bc-deluxe.md`](../docs/canvas-redesign-bc-deluxe.md). This entry captures the meta-learnings.

### What Worked

- **Vision-LLM rubric as a feedback loop.** `pnpm metrics:vision` (Claude `claude -p` invoked from the local CLI, scoring screenshots on edge clutter / label readability / container clarity / balance with pixel-cited issues) caught regressions the type checker and unit tests could not. The 2.2 → 2.83 lift on `all_primitives` after the badge rework was visible *because* the rubric was cited per pixel, so the next pass had concrete targets. Reuse this loop for v2.0's diff-rendering and v2.1's edit-canvas chrome before locking visual decisions.
- **Layout metrics as a regression gate.** `pnpm metrics` (crossings, bends, total edge length, node-edge overlaps) became a quantitative regression check that stopped silent visual rot. Every visual rework since v0.1.4 reported deltas in the changelog (e.g. v0.1.6: bends 22 → 18, edge length 6148 → 3968 px). A future build that touches layout should produce a metrics delta in its PR.
- **Badge-and-arc beat marker-peers for wrappers.** The "lift wrappers to peer markers" plan (phase B-deluxe) shipped briefly in v0.1.2 and was reverted to inline corner badges in v0.1.6. Lesson: the chain should connect *work* directly. Markers in the structural path were structurally correct but visually weak — the user's complaint was "lines float in space, not connecting black blocks." Future visual builds should test the chain-readability question first: can the eye trace step → arrow → step without traversing decoration?
- **Structural-only kinds can drop their chrome.** v0.1.7 made `sequence` and `scope` invisible — they emit no node, lift children to peers, and chain via edges (with overlay edges for `stash → use`). The result: rectangles-within-rectangles stack collapsed; `compose` is now the only kind producing a visible outer box. The general rule: a kind that adds *no information* a viewer can act on does not need its own node. Apply this when adding new fascicle primitives — does the primitive *carry* something the user inspects, or does it just hold children?
- **Spikes can fail and stay.** The libavoid-js orthogonal-routing spike (v0.1.5) lost on every metric vs ELK (`all_primitives`: crossings +5, length +5157px, overlaps +18, no bends because libavoid drew straight lines through obstacles). Decision: keep behind `?router=libavoid` query flag and document the loss. The spike code stays so a future contributor with a different graph shape can re-evaluate; LGPL-2.1 license remains called out in the optional dep. Reuse this pattern: spikes that lose are still worth keeping if they are cheap to gate and the data on why-they-lost is the durable artifact.

### What Didn't

- **Edge-rendering re-routed in the renderer.** Pre-v0.1.4, edges used React Flow's built-in `smoothstep`, which re-routed from source/target handles and threw ELK's bend points away. Result: 82 bends per fixture, edges hovering near nodes, label collisions on elbows. Fix was to thread ELK's `sections` through `apply_edge_routes` and render via a custom `weft-orth` edge.
- **Persistence stored a default viewport.** `use_canvas_persistence` initially stored `{zoom:1,x:0,y:0}` on first LRU touch (to register the entry), and the canvas treated it as a pinned viewport, skipping auto-fit. Every fresh tree opened at zoom 1 with no pan, often off-screen. Fixed by treating the canonical default as "no preference" in `is_meaningful_viewport`.
- **Container CSS silently overrode inline node sizes.** v0.1.7's "edges don't touch the visible shape" came from two width/height mismatches: steps with wrapper badges rendered 88px tall via CSS but ELK sized them 60px; `stash`/`use` rendered as 220×60 pills while ELK sized them ~280×136 because they parent their wrapped child. Fixed by pinning the rendered DOM bounds to what the layout engine sized.

### Patterns to Avoid

- Don't let the renderer re-route what the layout engine already routed. Whoever places the polyline owns its bends.
- Don't conflate "no viewport pinned yet" with "viewport equals the default." When adding new persisted state, decide what value means "unset" before storing.
- Don't let CSS `min-width` / `min-height` silently override React Flow's inline width/height. New node kinds must keep rendered DOM bounds equal to ELK's computed bounds.

### Cost Analysis

- ~25 commits across 3 days, mostly small-diff visual polish driven by metrics + vision rubric + Playwright screenshots. No multi-hour builds; total agent cost roughly 1/10 of v0's $116.94 because each commit was a single bounded loop.
- The "deluxe" topology rework (B/C/D-deluxe) was originally scoped as a multi-day diff and landed in 4 commits (`a387c9d`, `f843ab1`, `59f6a28`, `6614942`) over a single afternoon once the lift-children-to-peers move (`walk_for_chain` returning a `ChainSegment`) was paid for once.

### Recommendations for Next Build

- A refactor that looks expensive may be cheap once the right primitive is added — invest in the primitive first. For v2.0 / v2.1 that primitive is `WeftNodeData.diff_status?` (single field added once, halos render via existing per-kind components).
- Keep `pnpm metrics`, `pnpm metrics:vision`, and `pnpm screenshots` in the visual loop. Every visual rework should report a metrics delta.
- Spike-and-fail is acceptable when the spike stays opt-in and the data on why-it-failed is the artifact (libavoid-js precedent).

## Build: v1 (2026-05-04)

### What Worked

- **Single-build close-out.** The v1 stub planned a multi-phase build; the reconciled spec (`.ridgeline/builds/v1/spec.md`) showed every piece except the JSONL tail was already in tree from post-v0 work (commit `b71ff9c`). v1 shipped as one focused diff (commits `31ce244`, `296920b`, `9f7407d`, `9e85d60`) — `start_events_tail` in `@repo/watch`, the `events_invalid` banner in the studio, a wire-format drift fixture in `@repo/core`, and one e2e spec.
- **Boundary discipline held.** `@repo/watch` keeps its own `trajectory_event_schema.ts` mirror of `@repo/core`'s schema rather than importing from core, so the published `weft-watch` install graph stays React-free. The drift fixture in `@repo/core` catches divergence between the two mirrors and fascicle's wire format.
- **Studio plumbing absorbed v1 cleanly.** The `events` envelope had been reserved in `WatchEnvelope` since v0; `use_watch_socket` already validated, ring-buffered, and forwarded events. Adding `events_invalid` was additive — older studios drop unknown envelopes.

### What Didn't

- Nothing material. The build was a single-PR diff and the only surprise was a Node `--experimental-strip-types` resolver gap (see Patterns to Repeat).

### Patterns to Repeat

- **Reserve the seam in v0; ship the implementation in vN.** v1's overlay seam (`runtime_state` prop, `WeftNodeData.runtime`) was added in v0 post-work and consumed by v1 without breaking. The umbrella surface change ended up a minor bump, not a major.
- **Mirror cross-boundary schemas + add a drift-fail test.** When crossing a published-package boundary, mirror the schema and add a fixture that fails loudly on drift. Caught zero failures at v1 release; the discipline is what makes future fascicle wire-format changes loud instead of silent.
- **Rename when context changes, not as its own PR.** `start_watcher` → `start_tree_watcher` happened in the same commit that introduced `start_events_tail` (`31ce244`). The disambiguation only mattered once a sibling existed.

### Patterns to Avoid

- Don't spawn TypeScript CLIs in tests via raw `node --experimental-strip-types` — strip-types does not rewrite NodeNext `.js` specifiers to their `.ts` counterparts. The `test/e2e/lib/strip_types_resolver.mjs` resolver hook is the workaround. Future tests that spawn TS CLIs should reuse the helper rather than rediscover the gap.

### Cost Analysis

- One-off manual build, ~4 commits, ~1 day end-to-end. Total agent cost negligible because every commit was small and the spec was already reconciled. No retries.

### Recommendations for Next Build

- For v2.0 and v2.1, reserve the seams (`WeftNodeData.diff_status?`, edit-history hook) in a v1.x release before the v2 builder runs, so the umbrella API change stays a minor bump.
- Keep the strip-types resolver helper in mind for any new e2e test that spawns a TS CLI.
- Open follow-ups carried into v1.x: run-picker UI for `derive_runtime_state`'s `run_id` filter; visual chrome for `adversarial` / `ensemble` / `tournament` / `consensus`; latency overlays from `span_duration_ms`; token-count overlays once fascicle stabilizes the `usage` event shape.
