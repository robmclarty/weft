# weft v1 — Specification (stub)

**Status:** Stub. Detailed spec to be written after v0 ships.
**Sibling builds:** `weft-v0` (static viewer — prerequisite), `weft-v2` (edit-in-place).
**Scope:** Live execution overlay. Weft connects to a running fascicle runner, receives trajectory events, and paints execution state onto the static canvas from v0.

---

## §1 Problem Statement (stub)

v0 makes compositions visible but inert. When a flow is actually running, the only feedback channel today is tailing a jsonl trajectory log. The tree on canvas should reflect what the runner is doing: which span is live, which succeeded, which failed, what payloads flowed where.

The pain this addresses: debugging a multi-step agent flow is currently a grep exercise against a log file while mentally maintaining a model of which composer owns which span. A live overlay on the tree collapses that mental work into recognition.

## §2 Solution Overview (stub)

Three moving parts, no new packages:

1. **`@repo/watch` extension** — the existing v0 watch CLI gains a second mode: in addition to tailing a tree JSON file, it tails a fascicle trajectory JSONL log (the format `filesystem_logger` from `@repo/observability` already writes) and forwards each event over the same local WebSocket. No separate "bridge" package — fascicle's `run.stream()` and `filesystem_logger` already do the subscription work; weft just needs to read what's there.
2. **`@repo/core/reduce`** — a pure reducer. Folds `TrajectoryEvent` values into `live_state` (a `Map<node_id, execution_state>` + latest emit payloads). Lives inside `@repo/core`, exported through `@repo/weft`.
3. **Node components** — consume `execution_state` and `latest_event` from their data prop (already reserved in v0's `WeftNodeData` type). Color / badge / pulse changes reflect state transitions.

The canvas structure from v0 is unchanged; only the node chrome gains state-driven styling. No new layout logic.

## §3 Open questions and ideas

- **Watch protocol: WebSocket vs SSE.** WebSocket is bidirectional, which matters for v2's edit-from-canvas. SSE is simpler and sufficient for pure observation. Leaning WebSocket to avoid a protocol migration between v1 and v2 (and to share the same socket the v0 watch CLI already uses for tree updates), but cost/benefit to reevaluate when v1 starts.
- **Span-to-node mapping.** Trajectory spans carry a `span_id`. The tree carries `node.id`. The runner must emit the originating `node.id` as span metadata (or the watch CLI infers from `name`). Whichever way, the mapping needs to survive nested composer calls where one `node.id` produces many spans over time. Likely mapping: `span.meta.flow_node_id` → `FlowNode.id` (with the path prefix weft uses to disambiguate).
- **Event buffer and playback.** Recording recent events lets a late-joining studio client see what happened. Also opens the door to a playback slider — step forward/back through events to see how execution evolved. Scope TBD; possibly a `weft-v1.5` concern.
- **Latency / cost overlays.** Trajectory events already carry timing. Once state is wired, the next natural overlay is a latency bar per node and a token-count bar for model calls. Good candidates to include in v1 if the trajectory event shape has the data; otherwise defer.
- **Multiple concurrent flows.** A runner may execute several composition trees in parallel. v1 assumption: one studio connection views one tree. Multi-tree support probably unnecessary for the solo-developer workflow this is aimed at.
- **Backpressure and drop policy.** If events arrive faster than the studio can render (unlikely in practice but worth defining), what gets dropped? Probable answer: coalesce by `span_id` + `kind` — only the latest `span_start`/`span_end` per span matters for state; `emit` events coalesce to "latest payload".

## §4 Dependencies on v0

- `WeftCanvas` must already accept an `events: AsyncIterable<trajectory_event>` prop (reserved in v0, ignored there).
- `WeftNodeData.execution_state` and `latest_event` fields already defined.
- Node components must render an "idle" state cleanly so v0's zero-events path renders the same way after v1 lands.

## §5 Dependencies on fascicle

Already shipped in `@robmclarty/fascicle`:

- `TrajectoryEvent` and `TrajectoryLogger` types exported from `@repo/core`.
- A filesystem JSONL trajectory logger (`@repo/observability` → `filesystem_logger({ output_path })`) — usable as the v1 file source.
- `run.stream(flow, input)` returns `{ events, result }` with an `events: AsyncIterable<TrajectoryEvent>` — usable as the v1 in-process subscription source.

Open against fascicle (to verify when v1 starts):

- Whether `TrajectoryEvent` reliably carries the originating `FlowNode.id` (or enough metadata for the watch CLI to reconstruct it) for every primitive that emits spans. The adversarial / ensemble / tournament / consensus primitives are the most likely sources of friction.

Two viable subscription paths, both shipped:

- **In-process:** `run.stream(flow, input)` consumed by a harness that owns the runner. The harness publishes events directly over WebSocket — the watch CLI is bypassed.
- **Out-of-process file tail:** harness writes events with `filesystem_logger`; the v1-extended `@repo/watch` tails the JSONL.

File-tailing is lower-risk for v1 (zero coupling to runner code, reuses the v0 watch CLI infrastructure) but loses the ability to round-trip commands back to the runner (relevant only for v2). Probable path: start with file-tailing, upgrade to an in-process subscription when v2 forces the issue.

## §6 Non-goals for v1

- Edit-in-place (→ v2).
- Multi-user collaborative viewing.
- Authentication of the watch WebSocket connection. Local dev only; bind to `127.0.0.1`.
- Time-travel debugging with full payload reconstruction (maybe later; v1 keeps emit payloads but doesn't let you resume execution).

## §7 TBD

- Full interface definitions.
- Concrete protocol message shapes.
- Test strategy (headless runner + headless studio + event fixtures).
- Failure modes: watch CLI dies mid-stream, studio reconnects with a gap, event arrives referencing an unknown node id.
- Success criteria.
