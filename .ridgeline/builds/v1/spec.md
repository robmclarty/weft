# weft v1 — Specification

**Status:** Draft, implementation-ready (post-reconciliation against current fascicle and the work landed in `e68f31c`).
**Packages:** `@robmclarty/weft-watch` (= `@repo/watch`) gets a second mode. `@repo/core` and `@repo/studio` already ship the runtime-state machinery.
**Sibling builds:** `weft-v0` (static viewer — done), `weft-v2` (edit-in-place — stub).
**Scope of this spec:** Live execution overlay. Connect a running fascicle flow to weft, paint per-step state (active / error / cost / last emit) onto the v0 canvas, and reconnect cleanly across CLI restarts.

---

## §0 What changed since the v1 stub

The v1 stub (now archived as `spec.archived-stub.md` if kept) was written before any post-v0 work. Substantial pieces it called for already shipped in commit `e68f31c` ("feat(core,studio): add 8 missing primitives + runtime-state overlay"). The stub also referenced an older fascicle surface; the trajectory shape, `filesystem_logger`, and `run.stream()` have all stabilized differently than the stub assumed.

This spec is the reconciliation: what is true today, what fascicle actually exposes today, and the small remaining build to declare v1 done.

### Already in tree (no rebuild needed)

| Concern | Where | Notes |
| --- | --- | --- |
| Trajectory wire schema | `packages/core/src/trajectory.ts` | Mirrors fascicle's `packages/core/src/trajectory.ts` verbatim. Discriminated union: `span_start` \| `span_end` \| `emit` \| `custom`. All shapes use `.passthrough()` so `id`, `run_id`, `cost.total_usd`, etc. survive parse. |
| Runtime-state reducer | `packages/core/src/runtime_state.ts` | `derive_runtime_state(events, tree, options?) → ReadonlyMap<step_id, NodeRuntimeState>`. Tracks `active`, `error`, `last_emit_ts`, `cost_usd` (with parent rollup), `last_run_id`, `span_count`. Pure, deterministic, order-sensitive. Optional `run_id` filter for multi-run buffers. |
| Per-node overlay UI | `packages/core/src/nodes/RuntimeOverlay.tsx` + per-kind nodes | All sixteen primitive node components consume `data.runtime_state` and render active / error / cost chrome. |
| WS message envelope | `packages/watch/src/messages.ts` | Already has `{ kind: 'event'; event: Record<string, unknown> }` reserved. |
| Studio socket → reducer pipeline | `packages/studio/src/state/use_watch_socket.ts:154` + `components/CanvasShell.tsx:85` | `event` envelopes are validated against `trajectory_event_schema`, buffered (`EVENT_BUFFER_LIMIT` ring), and fed into `derive_runtime_state` on every render. |
| Reconnect/backoff for the WS | `packages/studio/src/state/use_watch_socket.ts` | Already shipped for v0's tree socket; `event` envelopes share the same socket and get the same recovery for free. |

### Missing — the v1 build

The CLI side. `weft-watch` does not yet tail a trajectory JSONL file or forward events. Once it does, the studio side already knows what to do. That is essentially the entire v1 build.

## §1 Problem Statement

After v0, a static composition is visible but inert. While a flow is running, the canvas tells the developer nothing about which step is live, which already finished, which errored, what the latest emit was, or where the cost is accumulating. The only feedback channel today is tailing a JSONL trajectory log in another terminal and mentally maintaining a step-id-to-canvas-position mapping. v1 collapses that mental work into recognition: when a span opens, the corresponding node pulses; when it ends with an error, the node scars; when an emit fires, the node flashes; when cost accumulates, it rolls up the container chain.

## §2 Solution Overview

`weft-watch` grows a second source: in addition to its existing `<tree.json>` watch, it can tail a fascicle trajectory JSONL log written by `filesystem_logger({ output_path })`. Each parsed event is forwarded over the same WebSocket as a `{ kind: 'event', event }` envelope. The studio is already wired to receive those envelopes, validate them against `trajectory_event_schema`, buffer them in a fixed-size ring, and project them through `derive_runtime_state` into per-step overlay state.

No new packages. No new transports. No new schemas. The single build artifact is the JSONL tail in `@repo/watch` plus the CLI flag to enable it.

```text
+-----------------------------+               +-----------------------------+
|  fascicle runner            |               |  weft-watch (v1)            |
|                             |               |                             |
|  run(flow, input, {         |               |  --tree   <tree.json>       |
|    trajectory:              |  (filesystem) |    chokidar → broadcast     |
|      filesystem_logger({    | ────────────► |    {kind:'tree', tree}      |
|      output_path: ".../     |               |                             |
|      trajectory.jsonl"})    |  (filesystem) |  --events <events.jsonl>    |
|  })                         | ────────────► |    line-tail → broadcast    |
+-----------------------------+               |    {kind:'event', event}    |
                                              +-------------+---------------+
                                                            │ WS (existing)
                                                            ▼
                                              +-----------------------------+
                                              |  studio (v0 + already-wired |
                                              |  reducer) renders live      |
                                              |  overlay on canvas          |
                                              +-----------------------------+
```

### Why the watch CLI is the only build target

The studio/core machinery is symmetric: any source that pushes well-formed `event` envelopes lights up the canvas. A future fixture-replay button, an in-process subscription mode, or an HTTP source can all be added later without touching the reducer or the per-node chrome. v1 commits to one source — the JSONL tail — because it is zero-coupling to runner code (the harness already writes the file via `filesystem_logger`) and reuses every piece of v0's WS plumbing.

## §3 Data Model

No new persistent state. v1 introduces one in-memory shape (already declared in `runtime_state.ts`):

```typescript
type NodeRuntimeState = {
  readonly active: boolean;
  readonly error: string | null;
  readonly last_emit_ts: number | null;
  readonly cost_usd: number;       // self + descendants (containers roll up)
  readonly last_run_id: string | null;
  readonly span_count: number;     // monotonic; supports retries opening multiple spans
};
```

The studio passes `derive_runtime_state(events, tree)` to `<WeftCanvas>` via a `runtime_state?: ReadonlyMap<string, NodeRuntimeState>` prop. Per-node components consume their entry via `data.runtime_state` and render accordingly.

### Span-id → step-id mapping (verified against current fascicle)

Fascicle's primitives all call `ctx.trajectory.start_span(label, { id: flow.id })`. `filesystem_logger` writes:

```jsonl
{"kind":"span_start","span_id":"sequence:7c4f1aab","name":"sequence","id":"sequence_3","parent_span_id":"step:b9..."}
{"kind":"span_end","span_id":"sequence:7c4f1aab"}
```

The `id` field on `span_start` is the `FlowNode.id` weft renders. `span_end` does **not** repeat it — but `derive_runtime_state` keeps a `span_to_id: Map<span_id, step_id>` while spans are open, so closes resolve to the right step. This already works in `runtime_state.ts:135`. Verified by inspecting `packages/core/src/{step,sequence,parallel,…}.ts` in fascicle: every primitive emits `{ id: flow.id }` as span meta.

`emit` and `cost` events do not carry a step id; the reducer attributes them to the most recently opened span (`active_span_step` cursor). This is a heuristic — accurate for `emit` (which only fires inside a step's `run()`) and best-effort for `cost` (which fascicle records via `ctx.trajectory.record({ kind: 'cost', total_usd, … })` from inside a step's run). If fascicle later adds `id` to `cost` events, the reducer change is one line.

## §4 Interface Definitions

### §4.1 `weft-watch` CLI surface

```text
weft-watch <tree-path> [--events <jsonl-path>] [--no-open] [--studio-url <url>]
```

The first positional argument keeps its v0 semantics. New:

| Flag | Type | Default | Behavior |
| --- | --- | --- | --- |
| `--events <path>` | path | none | Tail a JSONL trajectory log. Each parsed line is forwarded to all connected studio clients as `{ kind: 'event', event }`. Optional — omitting it preserves v0 behavior exactly. |

The same chokidar instance manages both files; if both go missing simultaneously, two `unreachable` envelopes go out (one per file) on a single tick. Studio surfaces them as separate banners.

### §4.2 WS protocol additions

The envelope already exists:

```typescript
| { readonly kind: 'event'; readonly event: Readonly<Record<string, unknown>> }
```

v1 only adds **producer-side semantics** for two new envelopes:

| Kind | When emitted | Studio reaction |
| --- | --- | --- |
| `event` | per parsed JSONL line | validated, buffered, fed to `derive_runtime_state` |
| `events_invalid` | per JSONL line that fails JSON parse OR `trajectory_event_schema` parse | banner: "trajectory log line N: <err>"; line is dropped, tail continues |

`events_invalid` is a new envelope kind. Adding it is forward-compatible (older studios drop unknown envelopes on the floor). Shape:

```typescript
| { readonly kind: 'events_invalid'; readonly path: string; readonly line_number: number; readonly message: string }
```

### §4.3 Library surface (`@repo/weft`)

Already exported via `packages/core/src/index.ts:39-58`:

- `trajectory_event_schema`, `span_start_event_schema`, `span_end_event_schema`, `emit_event_schema`, `custom_event_schema`
- types: `ParsedTrajectoryEvent`, `SpanStartEvent`, `SpanEndEvent`, `EmitEvent`, `CustomTrajectoryEvent`
- `derive_runtime_state`, `empty_runtime_state`
- types: `NodeRuntimeState`, `DeriveRuntimeStateOptions`

No additions for v1.

## §5 Business Logic

### §5.1 JSONL tail

The tail behavior matches fascicle's own `packages/viewer/src/tail.ts` (which weft does **not** depend on — see §6.1):

1. `fs.watch` the file path.
2. On every wake, `stat` to get current size.
3. If `current_size < last_offset`, the file rotated or was truncated. Reset `last_offset = 0` and a buffered partial-line accumulator.
4. Open the file at `last_offset`, read to end, append to the partial-line buffer.
5. Split on `\n`. The trailing fragment (if any, no trailing newline) stays in the buffer.
6. For each complete line:
   - `JSON.parse` → on failure, emit `events_invalid` with the JSON error and increment line counter.
   - `trajectory_event_schema.safeParse` → on failure, emit `events_invalid` with the Zod issue path and message.
   - On success, broadcast `{ kind: 'event', event: parsed }`.
7. Update `last_offset` to the new EOF.
8. If a wake fires while a previous read is still in flight, set a `pending` flag and re-read on completion (single-flight, no overlapping reads).

**Why not use fascicle's `start_tail`.** weft already keeps a hard boundary: it never imports runtime types from fascicle even when the shapes are mirrored (see `trajectory.ts` header comment). Importing fascicle's `start_tail` would mean either making `@robmclarty/fascicle` a runtime dep of `@robmclarty/weft-watch` (which forces a fascicle install on every weft-watch user) or vendoring it. Neither is worth saving ~80 lines of file-tail code.

### §5.2 Multiplex into the existing watcher

`packages/watch/src/watcher.ts` becomes `start_tree_watcher` and a sibling `start_events_tail` is added. `bin.ts`'s `start` sequence:

1. Validate `<tree-path>` (existing).
2. If `--events` given, validate the events file is openable (it can be empty or missing — empty is normal at start; missing logs a soft warning).
3. Bind WS server (existing).
4. Open browser (existing).
5. Start tree watcher (existing).
6. Start events tail.
7. Both watchers post into the same broadcast channel.

The CLI keeps its single-flight, await-listening startup so port discovery is unchanged.

### §5.3 Studio reducer behavior

Already implemented; documented here for completeness so tests can pin it.

- **Buffer.** `EVENT_BUFFER_LIMIT` (current value in `use_watch_socket.ts`) ring of `ParsedTrajectoryEvent`. When full, oldest events drop. The reducer is order-sensitive but tolerant of dropped history: state is the projection of *currently buffered* events, not all-time events. Containers' rolled-up cost may therefore decrease as old `cost` events fall off the ring. Acceptable for v1 — if it surprises in practice, swap to a "cost monotonic since last `run_id` change" rule.
- **Run filter.** When the buffer contains events from multiple runs (CLI restarted, runner restarted), the reducer attributes per-run state correctly because `last_run_id` is recorded on every event. The studio may later expose a UI filter "show only run X"; out of scope for the build, but `derive_runtime_state(events, tree, { run_id })` is already wired.
- **Reset.** A new `tree` envelope arriving while events are buffered does **not** clear the buffer. Reasoning: the user often edits the tree file mid-run (rename, reformat) and the runtime state should keep painting against the new tree as long as step ids match. Step ids that no longer exist in the tree silently drop on render.

### §5.4 Per-kind visual encoding (already shipped)

For reference; not a build target.

| State | Visual | File |
| --- | --- | --- |
| `active === true` | ochre pulse on outline | `RuntimeOverlay.tsx` + `canvas.css` `.weft-node--active` |
| `error !== null` | red scar across upper-right | `RuntimeOverlay.tsx` + `.weft-node--error` |
| `last_emit_ts` within last 800ms | blue flash on right edge | `RuntimeOverlay.tsx` + `.weft-node--emitted` |
| `cost_usd > 0` | small `$0.0023` chip in footer; rolls up via reducer for containers | `RuntimeOverlay.tsx` |
| `span_count > 1` | retry counter `×N` in upper-left | per-kind nodes (`RetryNode` etc.) |

## §6 Constraints

### §6.1 Boundary discipline

`@repo/watch` and `@repo/core` keep their own zod mirrors of fascicle's wire schemas. Never `import { trajectory_event_schema } from '@robmclarty/fascicle'`. Two reasons:

1. The published artifacts (`@robmclarty/weft-watch`, `@robmclarty/weft`) should not pull fascicle into a user's `node_modules` tree. Users may run weft against trajectory logs produced by a fascicle they install separately — or against fixture logs with no fascicle install at all.
2. The mirror is already small (one z.union and a handful of `.passthrough()` shapes) and stable. Drift between the two is caught by the v1 fixture suite (§9).

### §6.2 No process control

v1 does not start, stop, or otherwise observe the runner process. The user runs their fascicle flow in one terminal (with `filesystem_logger` writing to a path) and weft-watch in another (with `--events` pointed at that path). v2 may grow process supervision; v1 does not need it.

### §6.3 Single-tree assumption

One studio connection views one tree. If a runner produces events against a different tree, the reducer happily attributes events to step ids that don't exist in the current tree (they sit in the runtime-state map but never render). No multi-tree UI in v1.

### §6.4 No event acknowledgements

Events are fire-and-forget over the WS. If the studio is disconnected when a line is appended, that line is lost — the studio reconnect does **not** replay history. The buffer that survives reconnect is the in-memory ring on the studio side. To recover full history, restart weft-watch with `--events <same path>` and the tail re-emits from the file's start.

This is intentional: a replay-on-reconnect protocol implies cursors, ack roundtrips, or a watermark file. None are worth the complexity for the local-dev, single-developer use case.

## §7 Dependencies

### §7.1 On v0

| v0 surface | v1 use |
| --- | --- |
| `WeftCanvas` `runtime_state?` prop | painted by `derive_runtime_state` output |
| `use_watch_socket` `event` envelope handling | validates and buffers events |
| `WeftWatchMessage` discriminated union | gets two new variants (`event` already there; `events_invalid` is new) |
| chokidar watcher | extended to manage two paths |
| WS server | unchanged |
| browser open / studio URL | unchanged |

### §7.2 On fascicle

Already shipped (verified):

- `TrajectoryEvent`, `TrajectoryLogger` from `@repo/core`.
- `filesystem_logger({ output_path })` from `@repo/observability` writes JSONL with the exact shape weft's mirror parses (`span_start` carries `id`; `span_end` carries `span_id` only; `emit` carries `kind` only; `cost` is a custom event with `total_usd` and `step_index`).
- `run.stream(flow, input, options)` from `@repo/core`'s runner returns `{ events: AsyncIterable<TrajectoryEvent>, result }` for in-process consumption — useful as a fallback path if the JSONL tail proves flaky, but not used by v1 itself.

Not needed by v1, but worth knowing:

- Fascicle's `@repo/viewer` package ships its own JSONL tailer, broadcaster, HTTP server, and static viewer. weft does not depend on it. The two are orthogonal: fascicle's viewer is a list-of-events panel, weft is a canvas-based step tree.

### §7.3 New runtime deps

None. The JSONL tail uses `node:fs.watch` and `node:fs/promises` (already used by chokidar's underlying paths). No `chokidar` re-instantiation needed — a separate `fs.watch` on the events path is simpler than reconfiguring chokidar to watch two unrelated paths.

## §8 Failure Modes

| ID | Scenario | Handling |
| --- | --- | --- |
| F1 | Events file does not exist when CLI starts | Soft warning to stderr; tail re-stats every 500ms until file appears. Studio shows no banner (absence is normal at run start). |
| F2 | Events file deleted after starting | Tail emits `unreachable` envelope (existing v0 mechanism extended to events file); studio surfaces banner. Tail keeps polling for re-creation. |
| F3 | Events file truncated / rotated | `last_offset` reset to 0 and partial-line buffer cleared. Resume tailing from the new start. Studio's runtime-state reducer resets *naturally* because the prior events drop off the ring buffer over time. |
| F4 | Line is invalid JSON | `events_invalid` envelope sent with line number and JSON error; line dropped; tail continues. |
| F5 | Line parses as JSON but fails `trajectory_event_schema` | `events_invalid` with Zod path + message; line dropped; tail continues. (The `custom` schema is permissive — only `kind: string` required — so failures here mean truly malformed input.) |
| F6 | Partial last line at EOF (no trailing newline) | Buffered until next read produces a `\n`. Never parsed mid-line. |
| F7 | WS disconnect during a write burst | The studio's existing reconnect/backoff path kicks in. Events appended during the disconnect are lost (see §6.4). |
| F8 | Two runs interleaved into the same JSONL | Reducer uses `run_id` filter when set; otherwise computes a "merged" view. Acceptable for v1; better disambiguation belongs to a follow-up that adds a UI run picker. |
| F9 | Step id in span event has no matching node in current tree | Runtime-state map carries it but nothing renders. No banner. (Common during tree edits mid-run.) |
| F10 | Reducer cost rollup decreases when old `cost` events drop off the ring | Documented in §5.3. Not a bug for v1; revisit if it surprises users. |

## §9 Test Strategy

Three layers:

### §9.1 Unit (already in tree, no new files)

- `runtime_state.test.ts` covers the reducer (active/error/cost/rollup/run-filter cases).
- `trajectory.test.ts` covers schema parsing including `.passthrough()` round-trips.

### §9.2 Watch tail (new)

- `events_tail.test.ts` in `@repo/watch`:
  - happy path (write 3 lines, expect 3 envelopes)
  - partial line buffered across writes
  - file rotation (truncate + append)
  - invalid JSON line → `events_invalid`, valid lines after still flow
  - schema-invalid line → `events_invalid`, valid lines after still flow
  - file initially missing → tail reattaches when created
- Existing `bin.test.ts` extended to cover `--events` flag parsing.

### §9.3 End-to-end (new)

- Playwright spec `live_overlay.spec.ts`: launch studio + CLI with a fixture `events.jsonl`; verify per-step DOM markers (`data-weft-runtime="active"`, `data-weft-runtime="error"`) appear in the right order. Use the existing `all_primitives.json` tree.
- Cross-validation fixture: snapshot a real fascicle run's JSONL output (commit it as `fixtures/trajectory_sample.jsonl`) and assert weft's reducer projection matches a hand-computed expected map. This is the **drift detector** between fascicle's wire format and weft's mirror.

## §10 Non-goals for v1

- Edit-in-place (→ v2).
- Multi-user / collaborative viewing.
- Authentication on the WS (local-dev only; bind 127.0.0.1).
- Time-travel scrubber across the event ring (compelling, but a separate UX problem).
- In-process subscription via `run.stream()` (the file-tail path is simpler and enough for the dogfood loop; in-process becomes interesting only when v2 needs round-trip command channels).
- Runner-process supervision (start/stop/restart from the studio).
- Cost dashboards beyond the per-node chip and container rollup.
- Visual components for `adversarial`, `ensemble`, `tournament`, `consensus` (composites). They render as `GenericNode` until v1.x ships dedicated chrome — the runtime overlay still works on the generic node.

## §11 Success Criteria

v1 is done when, in this order:

1. `pnpm check` exits 0 with all v1 tests added.
2. The fixture-based e2e spec passes (active spans → ochre, error spans → scar, emits → flash, costs → chip with container rollup).
3. Cross-validation fixture proves wire-format alignment with the current fascicle.
4. A real dogfood loop works: open a fascicle test that writes `filesystem_logger({ output_path: '/tmp/trajectory.jsonl' })`, run `weft-watch /tmp/tree.json --events /tmp/trajectory.jsonl`, watch the studio paint state in near-real-time as the test runs.
5. Killing the runner mid-execution leaves the canvas in its last-known state (no crash, no banner). Restarting the runner appends to the same file; the canvas resumes painting against the new run's events.

## §12 TBD (carried into v1.x or v2)

- Visual chrome for `adversarial` / `ensemble` / `tournament` / `consensus`.
- A run-picker UI that exposes `derive_runtime_state`'s `run_id` filter when the buffer contains multiple runs.
- A "clear runtime state" action on the toolbar (currently only happens via WS reconnect or page reload).
- Optional event-source via `run.stream()` for in-process harnesses that don't want a JSONL file at all.
- Latency overlays (per-step `span_duration_ms` from `span_start.ts`/`span_end.ts` differential).
- Token-count overlays for model calls (depends on fascicle deciding whether `usage` events get a stable wire shape).
