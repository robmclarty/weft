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
