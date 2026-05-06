# weft v2 — Specification

**Status:** Ridgeline-ready, scope-staged. Sections are tagged `[v2.0]`, `[v2.1]`, `[v2.2]` so the build can decompose into three independently shippable phases.
**Sibling builds:** [`weft-v0`](../v0/spec.md) (static viewer — done), [`weft-v1`](../v1/spec.md) (live overlay — done as of v0.1.10).
**Companion documents:** [`../../constraints.md`](../../constraints.md) (hard rules), [`../../design.md`](../../design.md) (visual tokens), [`../../taste.md`](../../taste.md) (style preferences), [`../../learnings.md`](../../learnings.md) (retrospectives). Architectural shape and shipped behavior are documented in [`../../../docs/architecture.md`](../../../docs/architecture.md), [`../../../docs/primitives.md`](../../../docs/primitives.md), [`../../../docs/canvas-redesign-bc-deluxe.md`](../../../docs/canvas-redesign-bc-deluxe.md), and [`../../../docs/embedding.md`](../../../docs/embedding.md).
**Scope of this spec:** v2.0 adds a tree-diff view. v2.1 adds in-canvas structural editing with YAML export. v2.2 — the original "edit-in-place with round-trip to running fascicle code" promise — depends on fascicle shipping a DSL loader and is tracked here as a hard dependency.

---

## §0 Baseline — what is true on `main` as of this spec

This spec is written **after** v1 shipped and the post-v0 visual evolution settled. Ridgeline must treat the current implementation as the canonical baseline; the design choices below are not up for negotiation by this build.

### §0.1 Visual model (load-bearing — do not regress)

| Family | Members | Renders as | Source of truth |
| --- | --- | --- | --- |
| Work | `step` | Black pill ~220×60, label `id` + `<fn:name>`. Inline corner `WrapperBadge`s for any wrapping pipe / timeout / checkpoint / map. | `nodes/StepNode.tsx`, `nodes/WrapperBadges.tsx` |
| Junction | `branch`, `fallback`, `parallel` | 56×56 diamond. Children lift to peers. Outgoing edges role-tagged (`then`/`otherwise`, `primary`/`backup`) or port-keyed (`parallel.config.keys[i]`). | `walk_branching_as_junction`, `walk_parallel_as_junction` in `transform/tree_to_graph.ts` |
| Wrapper-as-badge | `pipe`, `timeout`, `checkpoint`, `map` | **No node.** Inner child is lifted; a `WrapperBadge { kind, label, position: 'before' \| 'after' }` is appended to its `WeftNodeData.wrappers`. | `transform/tree_to_graph.ts` |
| Wrapper-as-edge | `retry` | Self-loop arc on the wrapped step (`SelfLoopEdge`). | `walk_retry_as_edge` |
| Wrapper-as-container | `loop` | Labeled magenta container with body, optional guard, and a back-arc (`LoopBackEdge`). | `walk_loop_as_container` |
| Structural-only | `sequence`, `scope` | **No node.** Children lift to peers and chain via structural edges. `scope` additionally emits dashed `stash → use` overlay edges. | `walk_sequence_as_invisible`, `walk_scope_as_invisible` |
| Container | `compose` | The **only** kind producing a visible outer box. Defaults to expanded; click toggles into `collapsed_composes`. | `walk_compose` |
| Terminator | `end` (synthesized) | Single white `END` pill. Appended unless the chain ends in a divergent junction (parallel / branch / fallback). | `END_GRAPH_ID` in `transform/tree_to_graph.ts` |
| Sentinel | `<cycle>` | Gray pill labeled `↺ → <target_id>`. | `emit_cycle_node` |
| Unknown | any other `kind` | `GenericNode` with amber affordance. Children still recurse. | `nodes/GenericNode.tsx` |

Layout is ELK layered with `INCLUDE_CHILDREN` and ORTHOGONAL routing in a Web Worker; routes round-trip through `WeftEdgeData.waypoints` and render via the default `weft-orth` edge type. Defaults: `LR`, `node_spacing: 120`, `rank_spacing: 200`. The libavoid-js spike (LGPL-2.1) stays opt-in behind `?router=libavoid`.

The visual palette is the v0.1.2 "subway / paper" refresh: cream paper ground, saturated kind-family hues (orange / teal / yellow / blue / magenta / green / ink), thick non-scaling ink edges, mono-uppercase typography. v2 chrome (diff halos, edit-mode affordances) extends this palette; it does not replace it.

### §0.2 Data shapes already in tree

`WeftNodeData` (full current shape, mirrored from `transform/tree_to_graph.ts`):

```typescript
type WeftNodeData = {
  kind: string;
  id: string;
  config?: FlowNode['config'];
  meta?: StepMetadata;
  cycle_target?: string;
  generic?: true;
  warning?: 'cycle-guard';
  runtime?: NodeRuntimeState;
  is_expanded?: boolean;     // compose only
  is_container?: boolean;    // stash/use that wraps a child
  wrappers?: ReadonlyArray<WrapperBadge>;
};

type WrapperBadge = {
  kind: string;              // 'pipe' | 'timeout' | 'checkpoint' | 'map' (today)
  label: string;             // pre-formatted, e.g. "<fn:to_upper>", "⏱ 30s"
  position: 'before' | 'after';
};
```

`WeftEdgeData`:

```typescript
type WeftEdgeData = {
  kind:
    | 'structural'
    | 'overlay'
    | 'self-loop'
    | 'loop-back'
    | 'pipe-fn'
    | 'timeout-deadline'
    | 'checkpoint-key'
    | 'map-cardinality';
  wrapper_id?: string;
  wrapper_label?: string;
  role?: 'then' | 'otherwise' | 'primary' | 'backup';
  waypoints?: ReadonlyArray<{ readonly x: number; readonly y: number }>;
};
```

Graph node ids are parent-prefixed: `<parent_path>/<node.id>`. The local `FlowNode.id` survives in `WeftNodeData.id` for inspector lookups and is the **alignment key** for v2.0's diff (see §3.1).

`tree_id(root)` is FNV-1a over the serialized FlowTree. Identical trees produce identical hashes; v2.0 uses this as a fast path for `compute_diff(t, t) → identical` (§5.1).

`tree_to_graph(tree, options?)` accepts `{ collapsed_composes?: ReadonlySet<string> }`. v2.0 does **not** modify this signature. v2.1 may need to add an additional option (`{ diff_overlay?: ReadonlyMap<string, DiffStatus> }`) so per-node diff halos render via the existing per-kind components — see §5.3.

### §0.3 What is **not** changing in v2

- The `tree_to_graph` walk and the `walk_*` family of helpers. v2 transforms run **alongside** the existing transform; they do not replace it.
- The ELK layout pipeline.
- The `runtime_state` prop on `WeftCanvas` and the v1 overlay path. v2 routes do not need `runtime_state`; they ignore it.
- The watch CLI's WebSocket protocol.
- The umbrella seam (`@repo/weft` is re-exports only).
- The keyboard shortcut set on `/view` and `/watch`. v2 routes add their own; they must not collide with the existing set (see §5.4).

### §0.4 What changed since the v2 stub

The v2 stub assumed three things that turned out to be incorrect after re-checking fascicle:

1. **A round-trippable DSL is not shipped.** Fascicle exports `flow_schema` (the JSON Schema for `FlowNode`, re-exported from `@repo/core`) and `describe.json(step) → FlowNode` (the read direction), but **no `to_dsl(step)` or `load_from_dsl(yaml, registry)`**. Tracked as a fascicle dependency for v2.2 (§7.2); v2.0 and v2.1 do not block on it.
2. **`FlowNode` is descriptive, not constructive.** A `FlowNode` carries `kind`, `id`, `config`, `children`, `meta` — enough to render a diagram, not enough to run code. `step` nodes carry `<fn>` references but lose function bodies. Even with a perfect DSL loader, only "registered functions only" trees can round-trip.
3. **Dependencies are asymmetric.** v2's editing is structural surgery on a static `FlowNode` tree, independent of v1's live overlay. v2.0 and v2.1 can ship without v1; v2.0 and v2.1 are independent of each other.

This spec replaces the v2 stub with a staged plan that delivers value without waiting on fascicle.

## §1 Problem Statement

Reading a composition is solved by v0. Observing a run is solved by v1. The next two questions, in order of how much pain they cause today:

1. **"What did this PR change about the composition?"** A pure-text diff of a fascicle composition file is hard to map onto the structural change. *Adding a child to a parallel*, *wrapping a sequence in a retry*, *swapping the order of two steps*: each of these is a one-line code diff that has a large structural impact on the canvas. A side-by-side tree diff would let reviewers see the structural change at a glance — independent of any editing capability.

2. **"Can I shape this composition by dragging?"** Composition surgery on anything beyond a dozen nodes is currently edit-TS-then-re-read-the-tree. If the tree is already on screen, direct manipulation is faster, and the user is much less likely to make a topological mistake (orphaned `stash`, `use` reading an undefined key, retry around a parallel where each child should retry independently). Even without a DSL round-trip, a "design the composition on canvas, export the spec, paste-translate to fascicle code" loop is a cleaner authoring surface than starting from a blank `.ts` file.

## §2 Solution Overview

Three stages, each independently shippable.

### `[v2.0]` Diff view

Given two `FlowTree` values (current and baseline), render them as two canvases side-by-side with a unified pan/zoom and a third "merged" projection that shows added (green halo) / removed (red halo) / changed (amber halo) nodes inline. No editing, no spec format, no fascicle dependency beyond v0's.

The studio gets a `/diff?left=<src>&right=<src>` route. Sources accept the same shapes as v0's `/view` (file path via `weft-watch`, URL fetch, paste). The diff algorithm is structural: walk both trees by id-keyed alignment, mark nodes as added/removed/identical/config-changed/wrappers-changed.

### `[v2.1]` Edit then export

The canvas grows a small set of structural editing operations behind a new `/edit` route. Each operation produces a new `FlowTree` value and can be undone. The user exports the edited tree as a YAML "flow spec" file — a YAML rendering of the `FlowNode` shape — which is the input that `[v2.2]` will load back.

Until `[v2.2]` ships, the export is a one-way artifact: the user reads the YAML and writes fascicle code that mirrors it. Tedious, but already a meaningful uplift over edit-by-typing for users who think in graphs.

### `[v2.2]` True round-trip (blocked on fascicle)

Once fascicle ships:

- `to_dsl(step: Step<i, o>): string` — runtime → spec
- `load_from_dsl(spec: string, registry: Record<string, fn>): Step<i, o>` — spec → runtime

…weft's exported YAML becomes loadable as a runnable flow. The user's code shrinks to a function registry plus `run(load_from_dsl(yaml, registry), input)`.

This stage is tracked as a fascicle dependency (§7.2). Until fascicle commits to the API, the v2 build does not promise it.

## §3 Data Model

### §3.1 Diff representation `[v2.0]`

```typescript
type DiffStatus =
  | 'identical'
  | 'config_changed'
  | 'wrappers_changed'   // wrapping pipe/timeout/checkpoint/map/retry/loop set differs
  | 'meta_changed'       // FlowNode.meta differs
  | 'added'
  | 'removed';

type DiffConfigDelta = {
  readonly key: string;
  readonly left: FlowValue | undefined;
  readonly right: FlowValue | undefined;
};

type DiffNode = {
  readonly status: DiffStatus;
  readonly id: string;                  // FlowNode.id of the aligned pair, or of the present side when status is added/removed
  readonly left: FlowNode | null;       // null when status === 'added'
  readonly right: FlowNode | null;      // null when status === 'removed'
  readonly config_diff?: ReadonlyArray<DiffConfigDelta>;
  readonly meta_diff?: ReadonlyArray<DiffConfigDelta>;
  readonly wrapper_kinds_left?: ReadonlyArray<string>;   // ordered, only when wrappers_changed
  readonly wrapper_kinds_right?: ReadonlyArray<string>;  // ordered, only when wrappers_changed
  readonly children: ReadonlyArray<DiffNode>;
};

type FlowDiff = {
  readonly version: 1;
  readonly root: DiffNode;
};
```

**Alignment rule.** Walk both trees in parallel, depth-first. Pair nodes by `FlowNode.id`. A node present only in `left` is `removed`; present only in `right` is `added`. Same id, same kind, equal config / equal meta / equal wrapper-kind set / equal children → `identical`. Same id, different config → `config_changed` with per-key delta. Same id, different `meta` → `meta_changed`. Same id, kind unchanged but the *outer* wrapping primitives differ (e.g. `retry(step_3)` on left, plain `step_3` on right) → `wrappers_changed` with the ordered kind sets. Same id, different `kind` → treated as remove + add (rare; fascicle's id contract does not allow id reuse across kinds in well-formed trees).

A status priority resolves multiple changes on the same node: `kind change > wrappers_changed > config_changed > meta_changed > identical`. The render shows a single halo color per node based on the highest-priority change; the inspector surfaces every delta.

**Wrapper detection.** "Wrappers" here means the chain of single-child wrapping kinds (`pipe`, `timeout`, `checkpoint`, `map`, `retry`, `loop`) that wrap a given target's `FlowNode.id`. Walk parents from each tree's view of the target id and collect the kind sequence; compare as ordered arrays. This makes wrapper changes diff-visible without requiring the diff to peer inside the badge layer.

**Stable-id assumption.** Diff alignment by id requires `FlowNode.id` to be stable across structural edits within the same source file. v0 inherits whatever fascicle assigns; fascicle today emits monotonic per-kind ids (`sequence_3`, `step_7`) in `describe.json`, which are stable as long as nodes are not added/removed between consecutive `describe.json` calls on the same composition. v2.0 documents this assumption; if the user manually re-numbers ids in their fascicle source, the diff falls back to a positional alignment heuristic (LCS on the children sequence, see §5.1).

**Fast path.** If `tree_id(left.root) === tree_id(right.root)`, return `{ version: 1, root: { status: 'identical', id: left.root.id, left: left.root, right: right.root, children: [...identical children...] } }` without walking. The hash is FNV-1a over the serialized FlowTree; collisions are vanishingly unlikely on hand-authored trees.

### §3.2 Edit commands `[v2.1]`

Edits are typed commands with inverses. The command log is the undo stack.

```typescript
type WrapperKind = 'retry' | 'pipe' | 'timeout' | 'checkpoint' | 'map' | 'loop';
// Note: 'loop' wraps a single body (or body + guard); 'compose' is excluded
// because compose is a container, not a wrapper.

type EditCommand =
  | { readonly kind: 'add_child';      readonly parent_id: string; readonly index: number; readonly child: FlowNode }
  | { readonly kind: 'remove_child';   readonly parent_id: string; readonly index: number }
  | { readonly kind: 'reorder_child';  readonly parent_id: string; readonly from: number; readonly to: number }
  | { readonly kind: 'wrap';           readonly target_id: string; readonly wrapper_kind: WrapperKind; readonly wrapper_config?: FlowNode['config'] }
  | { readonly kind: 'unwrap';         readonly target_id: string }     // target is the wrapper to remove
  | { readonly kind: 'edit_config';    readonly target_id: string; readonly key: string; readonly value: FlowValue | undefined }
  | { readonly kind: 'edit_meta';      readonly target_id: string; readonly key: string; readonly value: FlowValue | undefined };

type EditResult = {
  readonly tree: FlowTree;
  readonly inverse: EditCommand;        // for the undo stack
};

apply_edit(tree: FlowTree, command: EditCommand): EditResult;
```

`apply_edit` is pure. The studio's edit reducer maintains `(tree, history: EditCommand[], cursor: number)`. Undo is `apply_edit(current, history[cursor].inverse)`; redo re-applies `history[cursor + 1]`. The cursor moves on every command (forks discard suffix).

#### Per-command target rules

These align with the kind families from §0.1; the editor's UX surfaces enabled commands based on the selection.

| Command | Allowed targets | Constraint |
| --- | --- | --- |
| `add_child` | `sequence`, `parallel`, `scope`, `compose` | N children. `parallel`: must also extend `config.keys`; the editor synthesizes a key. |
| `add_child` | `branch`, `fallback` | **Rejected** — these are 2-child junctions; mutate via `wrap`/`unwrap`/`remove_child`+`add_child` pair instead. |
| `add_child` | wrappers (`pipe`, `timeout`, `checkpoint`, `map`, `retry`, `loop`) | **Rejected** — wrappers hold one body (`loop` may also hold a guard, treated as a paired insert in v2.1.x). |
| `remove_child` | any container or 2-child junction | Rejected when `parent` is a wrapper and removing leaves the wrapper bodyless; rejected when `parent` is a 2-child junction with only one child remaining (would leave a malformed branch/fallback). |
| `reorder_child` | `sequence`, `parallel`, `scope`, `compose` | `parallel`: also reorders `config.keys` so the per-port edge labels track. Rejected on `branch`/`fallback` (the role-tagged outgoing edges depend on child position). |
| `wrap` | any node not currently the root | Replaces the target `T` with `{ kind: wrapper_kind, id: <new>, config: wrapper_config, children: [T] }` at `T`'s parent index. |
| `unwrap` | wrappers with exactly one body | Replaces the wrapper with its child at the wrapper's parent index. `loop` with a guard is a single command that drops both back up; v2.1 documents this as "you cannot unwrap a loop with a guard" and keeps the command rejected for that case. |
| `edit_config` | any node | `value === undefined` deletes the key. |
| `edit_meta` | any node | Same as `edit_config` but operates on `FlowNode.meta`. |

#### What is not editable

- **Function bodies.** `<fn>` references in `config` can be renamed (the user types a new `<fn:name>`) but the canvas does not bind those names to runtime functions — that is the user's registry, only meaningful at v2.2.
- **The root node's id or kind.** The root is anchored; structural changes happen below it.
- **`<cycle>` sentinels.** Cycle nodes are read-only — they exist only to prevent infinite recursion in the renderer.

#### ID generation

New nodes get `${kind}_${nanoid(6)}`. This deviates from fascicle's monotonic `${kind}_${n}` scheme so canvas-created ids never collide with fascicle-generated ones. The 6-char suffix puts collisions in the 1-in-billion range across a single canvas session.

After every command, the resulting tree is re-validated against `flow_tree_schema` (zod). A failure throws — the command list should not have produced an invalid tree, so this is an internal-bug detector, not a user-facing error.

### §3.3 Spec file `[v2.1]`

The exported "flow spec" is YAML. JSON was considered (no parser dep, simpler) but rejected: review-time readability and the ability to add comments are load-bearing for the "design on canvas, paste-translate to fascicle code" workflow.

```yaml
version: 1
root:
  kind: sequence
  id: sequence_1
  meta:
    description: top-level pipeline
  children:
    - kind: step
      id: step_1
      config:
        fn: { kind: <fn>, name: greet }
    - kind: retry
      id: retry_1
      config: { max_attempts: 3, backoff_ms: 200 }
      children:
        - kind: step
          id: step_2
          config:
            fn: { kind: <fn>, name: call_api }
```

Round-trip: parse YAML → validate against `flow_schema` (re-exported from `@repo/core`) → render. No fascicle runtime dep at this stage; YAML parser + ajv + the existing zod `flow_tree_schema` are enough.

The serializer:

- Emits a header comment `# weft spec — generated by @robmclarty/weft v<version> on <ISO-8601>`.
- Walks the tree depth-first, preserving child order.
- Emits compact flow-style for primitive leaves, block-style for composers (readability).
- Renders `<fn>` references as `{ kind: <fn>, name: <name> }` (or `{ kind: <fn> }` for anonymous).
- Includes `meta` only when present.
- If any `<fn>` reference is anonymous, prepends a second comment block: `# WARNING: contains N anonymous function references; spec is not loadable by load_from_dsl`.

The parser:

- Validates against the same `flow_schema` zod schema the studio loader uses.
- On failure, returns `{ ok: false, error: <zod path + message> }`. The /edit route surfaces it as a banner without replacing the canvas.

### §3.4 Studio state additions `[v2.0]` `[v2.1]`

| State | Lives in | Persisted? | Notes |
| --- | --- | --- | --- |
| Diff inputs (`left`, `right` URLs / paths / payloads) | URL search params on `/diff` | Yes (URL is shareable) | |
| Diff view mode (`side-by-side` / `merged`) | `localStorage`: `weft.diff.view_mode` | Yes | Defaults to `merged`. |
| Edit history (`commands`, `cursor`) | `EditRoute` component state | No (intentional) | Persisting an in-progress edit would surprise users on refresh. v2.1 is opt-in-by-page-load. |
| Edit history cap | constant | n/a | 200 commands. Oldest dropped on overflow. |
| Diff status overlay map | `DiffRoute` + studio shell | No | Computed from `compute_diff(left, right)` on every input change. |

`tree_id`-keyed canvas persistence (zoom, viewport, selection, container collapse) keeps working in v2 routes — the edit canvas is per-tree like the view canvas, so the user's pinned viewport survives a page reload as long as the tree's structural hash matches.

## §4 Interface Definitions

### §4.1 Studio routes

| Route | Stage | Purpose |
| --- | --- | --- |
| `/` | v0 | empty / loader |
| `/view?src=<url>` | v0 | static tree from URL (existing) |
| `/watch?ws=<port>` | v0 + v1 | watch socket (existing) |
| `/diff?left=<src>&right=<src>` | `[v2.0]` | side-by-side + merged diff view (new) |
| `/edit?src=<src>` | `[v2.1]` | edit canvas with command palette / context menu, export buttons (new) |
| `/edit?src=<src>&load=<spec>` | `[v2.2]` | edit a tree loaded from a spec file (no fascicle re-run yet) (new) |

`<src>` accepts the same shapes as v0's `/view`: file path (via weft-watch), URL (HTTP fetch with the same `https:` / `http://localhost` allowlist as v0), or `paste:` keyword (loader panel).

`/diff` and `/edit` reuse the existing studio shell (header tabs, search, inspector). v2.0 adds a `DIFF` tab; v2.1 adds an `EDIT` tab. The empty / view / watch tabs continue to work unchanged.

### §4.2 Library surface (`@robmclarty/weft`)

New exports, each implemented in `@repo/core` and re-exported via `packages/weft/src/index.ts`:

`[v2.0]`

```typescript
export { compute_diff } from '@repo/core';
export type {
  DiffStatus, DiffNode, FlowDiff, DiffConfigDelta,
} from '@repo/core';

export { DiffCanvas } from '@repo/core';
export type { DiffCanvasProps } from '@repo/core';
```

`[v2.1]`

```typescript
export { apply_edit, invert_edit } from '@repo/core';
export type {
  EditCommand, EditResult, WrapperKind,
} from '@repo/core';

export { serialize_to_spec, parse_spec } from '@repo/core';
// Returns { ok: true, tree } | { ok: false, error }
```

No new exports for `[v2.2]` — that stage is consumption-side (the user calls fascicle's `load_from_dsl` directly with a weft-exported YAML).

### §4.3 `<DiffCanvas>` props `[v2.0]`

```typescript
type DiffViewMode = 'side-by-side' | 'merged';

type DiffCanvasProps = {
  readonly left: FlowTree | null;
  readonly right: FlowTree | null;
  readonly diff: FlowDiff;                  // computed once by the route
  readonly view_mode: DiffViewMode;
  readonly on_node_click?: (id: string, side: 'left' | 'right') => void;
  readonly on_ready?: (api: DiffCanvasApi) => void;
  readonly layout_options?: LayoutGraphOptions;
};

type DiffCanvasApi = {
  readonly fit_view: () => void;
  readonly export_png: () => Promise<Blob>;
};
```

In `merged` mode, `<DiffCanvas>` projects the diff onto a **single** synthesized `FlowTree` (right-tree shape preferred; removed nodes inserted at their last-known position with status `removed`) and passes it through the existing `WeftCanvas` with a new `diff_overlay?: ReadonlyMap<string, DiffStatus>` prop. The per-kind components consume `data.diff_status` from `WeftNodeData` and render the halo via shared CSS classes (no per-kind branching — same dispatch rule as v0).

In `side-by-side` mode, `<DiffCanvas>` mounts two `WeftCanvas` instances inside a `ReactFlowProvider`-pair with a shared viewport-sync callback. Selecting a node on one side highlights its peer on the other (matched by `FlowNode.id`).

### §4.4 `<EditableCanvas>` props `[v2.1]`

```typescript
type EditableCanvasProps = {
  readonly tree: FlowTree;
  readonly on_command: (command: EditCommand) => void;     // emit; reducer lives one layer up
  readonly history?: ReadonlyArray<EditCommand>;           // for the redo / undo button states
  readonly history_cursor?: number;
  readonly on_ready?: (api: CanvasApi) => void;
  readonly layout_options?: LayoutGraphOptions;
};
```

The reducer (`use_edit_history` hook) lives in `@repo/studio/src/state/`. It owns the tree, the history, and the cursor; emits commands to a parent that decides when to export.

### §4.5 CLI additions

`[v2.0]`: `weft-watch --diff <a.json> <b.json>` opens the diff route directly.

```bash
git show HEAD~1:flow.json > /tmp/before.json
weft-watch --diff /tmp/before.json ./flow.json
```

The CLI watches both files (chokidar on each); on either file changing, a diff envelope is broadcast. New WS envelope:

```typescript
| { readonly kind: 'diff_pair'; readonly left: FlowTree; readonly right: FlowTree }
```

`/diff` clients consume `diff_pair`; `/view` clients ignore it (older studios drop unknown kinds, per the v0 protocol promise).

`[v2.1]`: no CLI changes; editing happens entirely in the browser. Spec files are downloaded via the browser download mechanism.

## §5 Business Logic

### §5.1 Diff algorithm `[v2.0]`

```text
compute_diff(left, right):
  if tree_id(left.root) === tree_id(right.root):
    return identical_diff(left, right)
  return diff_node(left.root, right.root)

diff_node(left, right):
  if left.kind !== right.kind:
    return { added: right, removed: left }    // emitted as a pair on the parent's children
  config_delta   = diff_record(left.config, right.config)
  meta_delta     = diff_record(left.meta, right.meta)
  wrapper_delta  = diff_wrapper_chain(left, right)
  child_pairs    = align_children(left.children ?? [], right.children ?? [])
  child_diffs    = child_pairs.map(diff_aligned)
  status         = max_priority(
    config_delta.length === 0 ? 'identical' : 'config_changed',
    meta_delta.length === 0   ? 'identical' : 'meta_changed',
    wrapper_delta             ? 'wrappers_changed' : 'identical',
  )
  return { status, id: left.id, left, right, config_diff, meta_diff, ..., children: child_diffs }
```

**Child alignment.** Primary: keyed by `FlowNode.id`. Walk both children arrays, pair entries with matching ids, mark unpaired entries as added/removed at the position they appear. Fallback (when ids are entirely disjoint between the two children arrays — rare): LCS over `(kind, hash(config))` pairs. The fallback mode is recorded in the route-level diff metadata so the inspector can surface "alignment fell back to positional" as a banner.

**Config diff.** Per-key. Arrays compared by element identity (no deep recursion into nested arrays). `<fn>` references compared by name (so `<fn:to_upper>` !== `<fn:to_lower>` is detected). Anonymous `<fn>` references are equal iff both are anonymous.

**Wrapper chain diff.** Build the ordered kind sequence of single-child wrapping kinds (`pipe`, `timeout`, `checkpoint`, `map`, `retry`, `loop`) reaching from each tree's root down to the aligned id. Compare as arrays. Different chains → `wrappers_changed`.

### §5.2 Edit operations `[v2.1]`

Each operation maps to a structural mutation that respects the kind contract from §3.2:

- **`add_child`** (containers only). Inserts at `index` in `parent.children`; if `parent.kind === 'parallel'`, also inserts a synthesized key in `parent.config.keys` at the same index. Inverse: `remove_child(parent_id, index)`.
- **`remove_child`** (containers + 2-child junctions). Removes at `index`. For `parallel`, also removes the corresponding key. Rejects when the parent is a wrapper (would leave the wrapper bodyless) or when removing would drop a `branch`/`fallback` below 2 children. Inverse: `add_child(parent_id, index, removed_child)`.
- **`reorder_child`** (sequence/parallel/scope/compose). Moves `from` → `to`. For `parallel`, also reorders `config.keys`. Inverse: `reorder_child(parent_id, to, from)`.
- **`wrap`**. Replaces the target node `T` at its parent's index with `{ kind: wrapper_kind, id: gen_id(), config: wrapper_config, children: [T] }`. Inverse: `unwrap(target_id: <new wrapper id>)`. Wrapping the root is rejected.
- **`unwrap`**. Replaces the wrapper with its only child at the wrapper's parent index. Rejects on `loop` with a guard. Inverse: `wrap(target_id: <child id>, wrapper_kind: <original>, wrapper_config: <original config>)`.
- **`edit_config`**. Sets / deletes a key in `config`. Inverse: previous value (or undefined if newly added).
- **`edit_meta`**. Same shape but on `meta`.

After every command, the resulting tree is re-validated against `flow_tree_schema`. A failure throws and the studio surfaces the violation as a "report a bug" modal.

### §5.3 Diff rendering `[v2.0]`

**View modes:**

- **Merged** (default). One `WeftCanvas` with `diff_overlay` populated. Halo classes:
  - `weft-node--diff-added`: green halo
  - `weft-node--diff-removed`: red halo, 50% opacity
  - `weft-node--diff-config_changed`: amber halo
  - `weft-node--diff-meta_changed`: amber halo, dotted
  - `weft-node--diff-wrappers_changed`: amber halo + a second outline indicating the badge change
  - `identical`: no halo
- **Side-by-side.** Two `WeftCanvas` instances. Selecting a node in one highlights its peer in the other via shared selection state.
- **Toggle.** Tab control top-right; defaults to `merged`. Persisted in `localStorage` under `weft.diff.view_mode`.

**Removed-inside-removed.** When a parent is `removed`, its children are `removed` transitively. Render the parent's halo only; do not render duplicate halos on transitively removed descendants. Inspector still surfaces the per-node deltas.

**Wrapper-changed visualization.** When a node's `wrappers_changed`, the halo highlights the inner step; the inspector lists the left and right wrapper-kind sequences side-by-side. Removed badges render with strikethrough; added badges render with a `+` prefix. Existing badges that survived render normally.

**Inspector contents in diff mode.** When a diff node is selected, the inspector shows: `kind`, `id`, status, `config_diff` (left-vs-right per-key with red/green coloring), `meta_diff` (same shape), wrapper chain diff (when applicable). PNG export via the existing `export_png` works on whichever canvas is focused.

### §5.4 Edit interaction `[v2.1]`

Three interaction surfaces:

- **Context menu** on right-click. Kind-aware. Examples:
  - Selection on `step`: "wrap in retry / pipe / timeout / checkpoint", "edit config", "edit metadata", "delete".
  - Selection on `sequence`: "add step", "add wrapper around children", "delete".
  - Selection on a wrapper: "edit config", "unwrap", "delete".
  - Selection on a `branch`/`fallback`: "swap children", "wrap diamond", "edit config" (wrap config has its own sub-menu).
  - Selection on `compose`: "add child", "expand / collapse", "rename id", "delete".
- **Drag-and-drop reorder** within container children. Drop indicator between siblings; drag onto another container to move into it.
- **Cmd-K command palette.** Fuzzy-search every legal command on the current selection. Discoverability surface; mirrors the context menu.

**Keyboard.** v2.1 must not collide with the v0 set on `/edit`. v0 binds: `f` (fit view), `/` (focus search), `Escape` (clear selection), `?` (shortcuts modal), double-click (toggle container collapse), single-click on compose (toggle compose collapse). New on `/edit`:

| Shortcut | Action | Notes |
| --- | --- | --- |
| `Cmd-Z` / `Ctrl-Z` | undo | Standard. Disabled at history start. |
| `Cmd-Shift-Z` / `Ctrl-Shift-Z` | redo | Disabled at history end. |
| `Cmd-K` / `Ctrl-K` | open command palette | New. |
| `Delete` / `Backspace` | remove selected (calls `remove_child` on its parent) | Disabled when removal would be rejected. |
| `Cmd-Shift-S` / `Ctrl-Shift-S` | export spec (downloads `flow.spec.yaml`) | `Cmd-S` left for the existing browser save-page; the export is explicit. |
| `Cmd-E` / `Ctrl-E` | export PNG | Mirrors the existing PNG button on `/view`. |

The shortcuts modal (`?`) on `/edit` lists the v0 set plus the v2.1 additions.

**Export buttons.** The right-side panel grows two buttons in `/edit` mode: `download spec` (YAML) and `download PNG`. Both reuse the existing download mechanism from v0.

### §5.5 Spec serialization `[v2.1]`

Serializer (`serialize_to_spec(tree: FlowTree): string`):

1. Header comment with version + ISO-8601 date.
2. If any `<fn>` references are anonymous, second comment listing the count and the warning that the spec is not loadable by `load_from_dsl`.
3. `version: 1` line.
4. `root:` block, depth-first walk. Block style for composers; flow style for leaves with two or fewer config keys.
5. `id` always emitted. `kind` always emitted. `config` emitted iff non-empty. `meta` emitted iff non-empty. `children` emitted iff non-empty.
6. Trailing newline.

Parser (`parse_spec(yaml: string): { ok: true; tree: FlowTree } | { ok: false; error: string }`):

1. `js-yaml.load(yaml, { schema: SAFE_SCHEMA })` — the safe schema explicitly rejects YAML tags that would invoke arbitrary code.
2. Validate against `flow_tree_schema` (the existing zod).
3. On success, return `{ ok: true, tree }`. On any validation error, return `{ ok: false, error: <zod path + message> }`. Never throw; the route reads the result.

### §5.6 Round-trip identity property `[v2.1]`

For every `tree` in `examples/`:

```typescript
const yaml = serialize_to_spec(tree);
const parsed = parse_spec(yaml);
expect(parsed.ok).toBe(true);
expect(parsed.tree).toEqual(tree);   // structural equality
```

Failure here is a serializer bug. The `examples/` corpus (the_loom, all_primitives, full_primitive_set, simple_sequence, parallel_ordering, nested_parallel, cycle_bug) exercises every primitive family.

## §6 Constraints

### §6.1 The "registered functions only" discipline

Editing a `step`'s function reference in the canvas only changes the *displayed name*. If the resulting spec is to be loadable by `[v2.2]`'s `load_from_dsl`, every `<fn:name>` must resolve in the user's runtime registry. Anonymous functions (`<fn>` with no name) are **not editable** in v2.1 — the canvas surfaces them with a "function source not editable" badge in the inspector.

### §6.2 No type checking across edits

`FlowNode` carries no static type info. Inserting a `step<string, number>` into a sequence that expects `string → string` is structurally legal and the canvas does not warn. Detection happens at runtime when the user reloads the spec into a real fascicle run. v2 accepts this degradation; better solutions (annotating `FlowNode` with type witnesses) are deferred indefinitely.

### §6.3 No collaboration

Single-user, single-browser, local. The studio writes spec files to disk via the existing browser download mechanism — no server-side persistence beyond `weft-watch`'s file watch.

### §6.4 ID stability is a reviewer-facing contract `[v2.0]`

The diff algorithm's correctness depends on `FlowNode.id` staying stable across structural edits within the same source file. v0 inherits whatever fascicle assigns; v2.1's editor preserves ids on existing nodes and only mints new ones for canvas-created nodes (`${kind}_${nanoid(6)}`). If a user manually re-numbers ids in their fascicle source, the diff falls back to positional alignment with reduced fidelity. Documented; not tooling.

### §6.5 No regressions on the v0 / v1 render path

v2 must not change `tree_to_graph`, `layout_graph`, the existing `WeftCanvas` props, the umbrella's pre-v2 exports, or the watch CLI's pre-v2 envelopes. Additions are minor bumps; modifications to existing surface are **major** and require revisiting `constraints.md` §8.

### §6.6 Keyboard discoverability

Every new shortcut on `/edit` must appear in the shortcuts modal (`?`) before it ships. Cmd-K must be discoverable from the modal even though it is itself a discoverability surface.

## §7 Dependencies

### §7.1 On v0 + v1

| Surface | Used by |
| --- | --- |
| `WeftCanvas`, `node_types`, `edge_types` | `[v2.0]`, `[v2.1]` |
| `tree_to_graph` (existing signature plus a new `diff_overlay?` option for `[v2.0]`'s merged mode) | `[v2.0]` |
| `tree_id`, `flow_tree_schema`, `flow_node_schema` | `[v2.0]`, `[v2.1]` |
| `tree_to_graph`'s parent-prefixed graph ids | rendered as-is in diff/edit canvases |
| Loader panel, route shell, inspector, persistence | `[v2.0]`, `[v2.1]` (re-skinned for diff/edit) |

### §7.2 On fascicle

| Surface | Stage | Status |
| --- | --- | --- |
| `flow_schema` (JSON Schema) | `[v2.1]` | already exported (`packages/core/src/index.ts`); used to ajv-validate parsed YAML specs. |
| `describe.json(step) → FlowNode` | `[v2.0]` | already exported; emits the trees that v2 consumes. |
| `to_dsl(step) → string` | `[v2.2]` | **NOT shipped.** Tracked as a fascicle issue. Without it, the edit→export→reload loop is one-way (export only). |
| `load_from_dsl(spec, registry) → Step` | `[v2.2]` | **NOT shipped.** Tracked as a fascicle issue. Without it, the spec the user exports is a documentation artifact, not a runnable flow. |
| Stable ids in `describe.json` output | `[v2.0]` | already true: fascicle's `describe.json` echoes the per-kind monotonic ids (`scope_1`, `step_3`). v2.0 piggybacks on this; if fascicle later changes the id scheme, v2.0's diff degrades to positional alignment. |

### §7.3 New runtime deps (in weft)

- `[v2.0]` none. Diff is a pure transform on existing data.
- `[v2.1]` `js-yaml@^4` (~30KB minified) and `ajv@^8` (~50KB minified). Both runtime-side in `@repo/core`. Add to `packages/core/package.json` `dependencies`. Lockstep version bump per `constraints.md` §8.
- `[v2.2]` no weft additions; the user installs `@robmclarty/fascicle` to consume `load_from_dsl`.

### §7.4 Boundary discipline

- `compute_diff`, `apply_edit`, `serialize_to_spec`, `parse_spec` live in `@repo/core` and are re-exported through `@repo/weft`. Studio imports through the umbrella, never `@repo/core` directly.
- `<DiffCanvas>` and `<EditableCanvas>` live in `@repo/core` (they consume React Flow). The studio's route components compose them with the loader / inspector chrome.
- `@repo/watch` does not gain a dependency on `@repo/core` for `[v2.0]`'s diff broadcast — it sends the two FlowTrees verbatim and lets the studio call `compute_diff`.

## §8 Failure Modes

| ID | Stage | Scenario | Handling |
| --- | --- | --- | --- |
| F1 | v2.0 | Trees have completely disjoint ids | Diff degenerates to "everything added + everything removed". Inspector banner: "no shared ids; trees may be from different sources or fascicle re-numbered". |
| F2 | v2.0 | One side is missing | Render the present side as a regular `/view`. No banner; the route silently downgrades. |
| F3 | v2.0 | A `<cycle>` sentinel on one side, a real cycle target on the other | Sentinel and target compared by id; if ids match, treat as identical (the runtime equivalence). If ids differ, treat as added + removed. |
| F4 | v2.1 | User attempts an illegal edit (e.g. `add_child` on a wrapper) | Command palette entry is grayed out; if invoked anyway via API, `apply_edit` throws and the studio surfaces a toast. |
| F5 | v2.1 | Exported spec fails its own re-parse (round-trip identity check) | Internal-bug detector. Show a modal with the diff and a "report a bug" link. Should not happen in practice; covered by §5.6. |
| F6 | v2.1 | User exports a spec containing anonymous `<fn>` references | Spec exports successfully but with the warning header described in §5.5. |
| F7 | v2.1 | Undo stack grows beyond 200 commands | Oldest commands drop with no warning (matches typical editor UX). |
| F8 | v2.1 | User edits a tree loaded from `/watch` (live source) | The /edit route does not subscribe to the watch socket — it loads the tree once at mount. If the user wants live editing, they re-load. v2 does not support edit-while-running. |
| F9 | v2.0 | `tree_id` collision (FNV-1a hits identically on different trees) | Vanishingly unlikely on hand-authored trees. If detected (full diff still walks and finds non-identity), fast path is bypassed and the regular walk runs. Test fixture exercises this. |
| F10 | v2.2 | `load_from_dsl` rejects spec because a `<fn:name>` is missing from the registry | Out of weft's hands; fascicle surfaces the error. weft's spec exporter optionally writes a comment with all function names used (deferred to v2.2.x). |

## §9 Test Strategy

### §9.1 `[v2.0]`

- **Unit** (`compute_diff.test.ts` in `@repo/core`):
  - identical: every tree in `examples/` against itself returns `status: 'identical'` (root + every descendant).
  - all-added: `compute_diff(empty_root, examples.all_primitives)` marks every node `added`.
  - all-removed: symmetric.
  - config-only: clone a tree, change one `config.fn.name` on a deep `step`, assert exactly one `config_changed` node.
  - meta-only: same shape on `FlowNode.meta`.
  - kind change at same id: assert remove + add pair.
  - wrapper-chain change: take `examples.all_primitives`, unwrap a `retry`, assert exactly one `wrappers_changed` node and identical descendants.
  - id-disjoint trees: confirm fallback to positional alignment fires; banner metadata is set.
  - `tree_id` fast path: assert that `compute_diff(t, t)` returns the all-identical result without walking (instrumented with a `walk_count` counter).
- **Component / snapshot** (`DiffCanvas.test.tsx`):
  - merged mode renders halo classes correctly across the fixture matrix.
  - side-by-side mode renders both canvases.
  - selecting a node in one side highlights the peer in the other.
- **Property** (vitest with fast-check):
  - `compute_diff(t, t).root.status === 'identical'` for any tree drawn from the existing fixture set.
  - `compute_diff(t1, t2).root.status === reverse(compute_diff(t2, t1).root.status)` (added ↔ removed swap).

### §9.2 `[v2.1]`

- **Unit** (`apply_edit.test.ts`):
  - one test per `EditCommand` shape, including its inverse.
  - rejection cases: every row of the §3.2 "rejected" table.
  - validation: every successful command produces a tree that passes `flow_tree_schema`.
- **Property**:
  - `apply_edit(tree, c).inverse` applied to the result yields the original tree (round-trip identity).
  - `parse_spec(serialize_to_spec(tree)).tree === tree` for every tree in `examples/`.
- **Integration** (`edit_session.test.ts`):
  - load `examples/all_primitives.json`, run a sequence of 10 random valid commands, undo all 10, expect the original tree.
- **Playwright e2e** (`edit_route.test.ts`):
  - drag-reorder + wrap-in-retry + export, then reload the exported file via `/view` and assert the canvas matches the edited state.
  - keyboard: assert Cmd-Z undoes, Cmd-Shift-Z redoes, Cmd-K opens the palette.
  - context menu: right-click a step, select "wrap in timeout", assert the resulting badge appears.

### §9.3 `[v2.2]`

Cross-repo. A fixture in fascicle's test suite asserts `load_from_dsl(serialize_to_spec(describe.json(flow))) ≈ flow` for the canonical fixture set. Tracked when fascicle commits to the API.

### §9.4 Coverage floor

`pnpm check`'s coverage floor (70% lines / functions / branches / statements per `constraints.md` §9) applies to all new code. v2.0's pure transforms are easy to clear; v2.1's reducer + serializer should be the same. UI components have lower bars but every legal command must have a test.

### §9.5 Visual regression

Screenshots:

- `pnpm screenshots` baseline for `/diff?left=<a>&right=<b>` on a fixture pair (e.g. `examples/all_primitives.json` vs a hand-modified copy). Halo colors must round-trip.
- `pnpm screenshots` baseline for `/edit` on a tree before / after a 5-command session.

`pnpm metrics:vision` (the Claude vision-LLM rubric) should be re-run on the diff merged view to score halo readability before locking the visual.

## §10 Non-goals for v2

- In-canvas function-body editing (weft is not a code editor).
- Collaboration / multi-user.
- Hot-edit of *running* flows (would require v1's transport to grow a command channel; v3-ish).
- Type inference or type-aware editing.
- Visual encoding of `adversarial` / `ensemble` / `tournament` / `consensus` (carried over from v0; orthogonal to v2's editing/diff scope; tracked as a v1.x follow-up).
- Persistent server-side spec storage.
- Time-travel scrubbing across the v1 event ring (a separate UX problem).
- Run-picker UI exposing `derive_runtime_state`'s `run_id` filter (carried over from v1.x).
- Edit-while-running (the /edit route does not subscribe to the watch socket).

## §11 Success Criteria

### `[v2.0]`

1. `pnpm check` exits 0.
2. `compute_diff` unit + property tests pass on every tree in `examples/`.
3. The `/diff?left=…&right=…` route renders any pair of `examples/` trees with the documented halo colors.
4. Reviewer workflow demo: take two consecutive commits of `examples/all_primitives.json` (one with a child added to a sequence) and produce a side-by-side that makes the structural change obvious in <5 seconds of reading.
5. `weft-watch --diff a.json b.json` opens a working `/diff` page; both files re-broadcast on change.

### `[v2.1]`

1. `pnpm check` exits 0.
2. All `EditCommand` shapes have round-trip property tests passing.
3. End-to-end: open a tree, perform a five-edit session on canvas, export the spec, re-import it via `/view`, assert the resulting tree equals the post-edit canvas tree.
4. `serialize_to_spec / parse_spec` round-trip is identity for every tree in `examples/`.
5. Keyboard set on `/edit` does not collide with the v0 set; shortcuts modal lists every binding.

### `[v2.2]`

Conditional on fascicle shipping `to_dsl` / `load_from_dsl`. Success criterion at that point: a real fascicle test loads a weft-exported spec, runs it, and produces the same output it would have if the user had hand-coded the tree in TypeScript.

## §12 Phase Decomposition (build hint for ridgeline)

A suggested decomposition for the ridgeline plan stage. The build is free to revise, but the cost of the v0 mistake (one phase ballooning to $44 / 56 min — see `learnings.md` "Patterns to Avoid") is the floor here.

### `[v2.0]` — three phases

1. **`v2.0-diff-engine`** — `compute_diff` + types + unit/property tests. Pure code in `@repo/core`. No UI. Closes when the test matrix in §9.1 is green and umbrella exports are added.
2. **`v2.0-diff-canvas`** — `<DiffCanvas>` component, `diff_overlay` option in `tree_to_graph` (or merged-mode synthesizer), per-kind halo CSS. Visual only. Closes when the screenshot baseline + `pnpm metrics:vision` pass.
3. **`v2.0-route-and-cli`** — `/diff` route in studio, `weft-watch --diff` flag, `diff_pair` envelope. Wires the engine + canvas through the existing studio shell. Closes when the e2e Playwright spec passes and the `weft-watch --diff` flow demo works.

### `[v2.1]` — four phases

1. **`v2.1-edit-reducer`** — `apply_edit` + `EditCommand` types + per-command tests + round-trip property test. Pure code. Closes when the test matrix in §9.2 is green.
2. **`v2.1-spec-serdes`** — `serialize_to_spec` + `parse_spec` + `js-yaml` / `ajv` deps + round-trip property test. Pure code. Closes when the test matrix in §9.2 is green.
3. **`v2.1-edit-canvas`** — `<EditableCanvas>` + `use_edit_history` hook + context menu + drag-reorder. UI. Closes when keyboard / context-menu tests pass.
4. **`v2.1-route-and-export`** — `/edit` route + Cmd-K palette + export buttons + shortcuts modal update. Closes when the e2e Playwright spec passes.

### `[v2.2]` — gated on fascicle

One phase whose start is conditional on fascicle merging the `to_dsl` / `load_from_dsl` API. Out of scope for the v2 ridgeline run.

## §13 Open questions resolved by current implementation

The v2 stub left several questions open. Resolutions, anchored against the current code:

- **Spec format.** YAML, decided. JSON's lack of comments would block the "warning header for anonymous fns" workflow.
- **ID scheme alignment.** `${kind}_${nanoid(6)}` for canvas-created nodes; fascicle keeps monotonic `${kind}_${n}`. Verified safe because fascicle's `describe.json` echoes whatever id is on the node — nanoid suffixes survive a round-trip through fascicle when v2.2 lands.
- **Merge view: how to render an `added` node inside a `removed` parent?** Render the parent's `removed` halo only; do not duplicate halos transitively. Inspector still surfaces the per-node deltas.
- **Edit command palette discoverability.** Both. Right-click context menu (kind-aware) plus Cmd-K palette (fuzzy search).
- **Spec validation strictness.** Strict by default — every parse runs `flow_tree_schema`. Add an opt-out only if a user reports the strictness blocks a real workflow.
- **Cross-repo coordination for v2.2.** Out of scope until fascicle commits to the API. The spec format weft commits to here (§3.3) is the proposal weft would put forward to fascicle.

## §14 Open questions still TBD

- **Per-kind halo CSS palette.** The v0 subway palette has six kind families; the diff palette adds three states (added / removed / changed). Pick concrete halo colors during `[v2.0]`-phase-2 design with `pnpm metrics:vision` in the loop.
- **Where does the 200-command undo cap live?** Current proposal: a constant in `use_edit_history`. If users hit it in dogfood, expose as a prop.
- **Fallback alignment heuristic for fully-disjoint ids.** Spec says LCS over `(kind, hash(config))` pairs. Worth measuring against a synthetic adversarial fixture before locking; if too slow on large trees, fall back to "all added + all removed" with a clearer banner.
- **Edit-canvas auto-fit behavior.** v0's auto-fit fires once per tree mount. After a 5-command edit session, should the canvas auto-fit again, or honor the user's pinned viewport? Recommend: only re-fit when the structural change is large (e.g. a new top-level child), measured via a bounding-box delta threshold. Decide during `[v2.1]`-phase-3 design.
- **Diff visualization for runtime-state overlays.** If the user passes `runtime_state` to `<DiffCanvas>`, what do they see? v2.0 punts: the diff route ignores `runtime_state`. Revisit when there is a concrete user need.

## §15 Cross-references

- **Constraints:** [`../../constraints.md`](../../constraints.md). v2 must not violate §1–§7. Rule additions for v2 (mechanically-checkable invariants): all new files in `packages/core/src/diff/` and `packages/core/src/edit/` and `packages/core/src/spec/` must follow the same boundary rules as the existing core code (no `@repo/studio` imports, no `process.env`, named exports only).
- **Design:** [`../../design.md`](../../design.md). v2 chrome (diff halos, edit-canvas affordances) extends the cream-paper subway palette; halo tokens to be added under "v2 additions" during `[v2.0]`-phase-2 design.
- **Taste:** [`../../taste.md`](../../taste.md). Best-effort stylistic preferences; reviewer does not enforce.
- **Learnings:** [`../../learnings.md`](../../learnings.md). The "Patterns to apply to v2" section calls out reserving the seam early (e.g. `WeftNodeData.diff_status?` in v0 / v1 surface before v2.0 builder runs), strip-types resolver helper, badge-and-arc beats marker-peers, vision-LLM rubric in the visual loop.
- **v0 spec:** [`../v0/spec.md`](../v0/spec.md). Static viewer; defines the `WeftCanvas` contract v2 layers on top of.
- **v1 spec:** [`../v1/spec.md`](../v1/spec.md). Live overlay; v2 routes are independent of it but coexist in the same studio shell.
- **Shipped state docs:** [`../../../docs/architecture.md`](../../../docs/architecture.md), [`../../../docs/primitives.md`](../../../docs/primitives.md), [`../../../docs/canvas-redesign-bc-deluxe.md`](../../../docs/canvas-redesign-bc-deluxe.md). Authoritative for "what v2 is building on top of."
