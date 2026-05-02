# weft v2 — Specification

**Status:** Draft, scope-staged. Sections marked `[v2.0]`, `[v2.1]`, `[v2.2]` indicate the staged build (see §0).
**Sibling builds:** `weft-v0` (static viewer — done), `weft-v1` (live overlay — see [`../v1/spec.md`](../v1/spec.md)).
**Scope of this spec:** The canvas becomes more than a viewer. v2.0 adds a tree-diff view. v2.1 adds in-canvas structural editing with export to a DSL spec file. v2.2 — the original "edit-in-place with round-trip to running fascicle code" promise — depends on fascicle shipping a DSL loader and is tracked here as a hard dependency.

---

## §0 What changed since the v2 stub

The v2 stub assumed three things that turned out to be incorrect after re-checking fascicle:

1. **A round-trippable DSL is *not* shipped.** Fascicle exports `flow_schema` (the JSON Schema for `FlowNode`) and `describe.json(step) → FlowNode` (the read direction), but **no `to_dsl(step)` or `load_from_dsl(yaml, registry)`**. The reverse direction — taking a serialized tree and re-instantiating it as a runnable `Step<i, o>` — does not exist anywhere in fascicle today. The stub treated this as "missing piece, weft depends on it"; in reality it is not yet on fascicle's roadmap as a publicly documented surface.
2. **`FlowNode` is descriptive, not constructive.** A `FlowNode` carries `kind`, `id`, `config`, and `children` — enough to render a diagram, not enough to *run* code. `step` nodes carry `<fn>` references but lose the function body; closures over outer scope are gone. Even with a perfect DSL loader, only "registered functions only" trees can round-trip — the same constraint v0 already documents in §3.
3. **The dependency on v0 / v1 is asymmetric.** v2's editing is *structural surgery* on a static `FlowNode` tree, which is independent of v1's live overlay. v2.0 (diff view) and v2.1 (edit-then-export) can ship without v1 done; v2.2 (true round-trip) is independent of v1 entirely.

This spec replaces the v2 stub with a staged plan that delivers value without waiting on fascicle.

## §1 Problem Statement

Reading a composition is solved by v0. Observing a run is solved by v1. The next two questions, in order of how much pain they cause today:

1. **"What did this PR change about the composition?"** A pure-text diff of a fascicle composition file is hard to map onto the structural change. *Adding a child to a parallel*, *wrapping a sequence in a retry*, *swapping the order of two steps*: each of these is a one-line code diff that has a large structural impact on the canvas. A side-by-side tree diff would let reviewers see the structural change at a glance — independent of any editing capability.

2. **"Can I shape this composition by dragging?"** Composition surgery on anything beyond a dozen nodes is currently edit-TS-then-re-read-the-tree. If the tree is already on screen, direct manipulation is faster, and the user is much less likely to make a topological mistake (orphaned `stash`, `use` reading an undefined key, retry around a parallel where each child should retry independently). Even without a DSL round-trip, a "design the composition on canvas, export the spec, paste-translate to fascicle code" loop is a cleaner authoring surface than starting from a blank `.ts` file.

## §2 Solution Overview

Three stages, each independently shippable.

### `[v2.0]` Diff view

Given two `FlowTree` values (current and baseline), render them as two canvases side-by-side with a unified pan/zoom and a third "merged" projection that shows added (green halo) / removed (red halo) / changed (amber halo) nodes inline. No editing, no DSL, no fascicle dependency beyond v0's.

The studio gets a `/diff?left=<src>&right=<src>` route. Sources can be paths (loaded by `weft-watch` or by drag-drop) or URLs (per v0 §5.4). The diff algorithm is structural: walk both trees by id-keyed alignment, mark nodes as added/removed/identical/config-changed.

### `[v2.1]` Edit then export

The canvas grows a small set of structural editing operations. Each operation produces a new `FlowTree` value and can be undone. The user exports the edited tree as a "flow spec" file — a YAML rendering of the `FlowNode` shape — which is the input that `[v2.2]` will be able to load back.

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
type DiffStatus = 'identical' | 'config_changed' | 'added' | 'removed';

type DiffNode = {
  readonly status: DiffStatus;
  readonly left: FlowNode | null;     // null when status === 'added'
  readonly right: FlowNode | null;    // null when status === 'removed'
  readonly config_diff?: ReadonlyArray<{
    readonly key: string;
    readonly left: FlowValue | undefined;
    readonly right: FlowValue | undefined;
  }>;
  readonly children: ReadonlyArray<DiffNode>;
};

type FlowDiff = {
  readonly version: 1;
  readonly root: DiffNode;
};
```

Alignment rule: walk both trees in parallel; nodes with matching `id` align. A node present only in `left` is `removed`; present only in `right` is `added`. Same `id`, same `kind`, but differing `config` is `config_changed` with the per-key delta. Same `id` and different `kind` is treated as a remove + add (rare; the FlowNode contract does not allow id reuse across kinds in well-formed trees, but the diff handles it gracefully).

This requires `FlowNode.id` to be stable across edits. Today fascicle assigns ids from monotonic counters per kind (`sequence_3`, `step_7`); for diff to be meaningful, ids should be **persistent across structural edits within the same source file**. v0 already accepts this — when a user edits a fascicle source file, the new tree typically reuses the same ids unless they introduced or removed a step. v2.0 documents this assumption; if it bites in practice, v2.0 falls back to a positional alignment heuristic (LCS on the children sequence).

### §3.2 Edit commands `[v2.1]`

Edits are typed commands with inverses. The command log is the undo stack.

```typescript
type EditCommand =
  | { readonly kind: 'add_child';     readonly parent_id: string; readonly index: number; readonly child: FlowNode }
  | { readonly kind: 'remove_child';  readonly parent_id: string; readonly index: number }
  | { readonly kind: 'reorder_child'; readonly parent_id: string; readonly from: number; readonly to: number }
  | { readonly kind: 'wrap';          readonly target_id: string; readonly wrapper_kind: 'retry' | 'pipe' | 'timeout' | 'checkpoint'; readonly wrapper_config?: FlowNode['config'] }
  | { readonly kind: 'unwrap';        readonly target_id: string }
  | { readonly kind: 'edit_config';   readonly target_id: string; readonly key: string; readonly value: FlowValue };

type EditResult = {
  readonly tree: FlowTree;
  readonly inverse: EditCommand;     // for the undo stack
};

apply_edit(tree: FlowTree, command: EditCommand): EditResult;
```

`apply_edit` is pure. The studio's edit reducer maintains `(tree, history: EditCommand[], cursor: number)`. Undo is `apply_edit(current, history[cursor].inverse)`; redo re-applies `history[cursor + 1]`.

**What is not editable:** function bodies. `<fn>` references in `config` can be renamed (the user types a new `<fn:name>`) but the canvas does not bind those names to runtime functions — that's the user's registry, only meaningful at `[v2.2]`.

### §3.3 Spec file `[v2.1]`

The exported "flow spec" is a YAML rendering of `FlowTree`:

```yaml
version: 1
root:
  kind: sequence
  id: sequence_1
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

Round-trip: parse YAML → validate against `flow_schema` (re-using fascicle's exported JSON Schema) → render. No fascicle runtime dep at this stage; YAML parser + ajv + the existing zod `flow_tree_schema` are enough.

## §4 Interface Definitions

### §4.1 Studio routes

| Route | Stage | Purpose |
| --- | --- | --- |
| `/diff?left=<src>&right=<src>` | `[v2.0]` | side-by-side + merged diff view |
| `/edit?src=<src>` | `[v2.1]` | edit canvas with command palette / context menu, export button |
| `/edit?src=<src>&load=<spec>` | `[v2.2]` | edit a tree loaded from a spec file (no fascicle re-run yet) |

`<src>` accepts the same shapes as v0's `/view`: file path (via weft-watch), URL (HTTP fetch), or `paste:` keyword (loader panel).

### §4.2 Library surface (`@repo/weft`)

New exports:

- `[v2.0]` `compute_diff(left: FlowTree, right: FlowTree): FlowDiff`
- `[v2.0]` `<DiffCanvas left right merged?>` — React component
- `[v2.1]` `apply_edit(tree, command): EditResult`
- `[v2.1]` `serialize_to_spec(tree: FlowTree): string` (YAML)
- `[v2.1]` `parse_spec(yaml: string): { tree: FlowTree } | { error: string }`

No new exports for `[v2.2]` — that stage is *consumption-side* (the user calls fascicle's `load_from_dsl` directly).

### §4.3 CLI additions

`[v2.0]`: `weft-watch --diff <a.json> <b.json>` opens the diff route directly. Useful for `git`-style workflow:

```bash
git show HEAD~1:flow.json > /tmp/before.json
weft-watch --diff /tmp/before.json ./flow.json
```

`[v2.1]`: no CLI changes; editing happens entirely in the browser.

## §5 Business Logic

### §5.1 Diff algorithm `[v2.0]`

```text
diff(left, right):
  if left.id != right.id or left.kind != right.kind:
    return { added: right, removed: left }
  if config_eq(left.config, right.config) and children_match(left, right):
    return { identical }
  config_delta = diff_config(left.config, right.config)
  child_pairs = align_children(left.children, right.children)
  return { config_changed: config_delta, children: child_pairs.map(diff) }
```

Child alignment uses id as the primary key. When ids don't align (rare, e.g. user re-numbered nodes by hand), fall back to LCS on `(kind, normalized_config_hash)` pairs. Config diff is structural per-key; arrays compared by element identity, not by deep equal recursion.

### §5.2 Edit operations `[v2.1]`

Each operation maps to a structural mutation that respects the kind contract:

- `add_child`: target must be a container kind (`sequence`, `parallel`, `scope`, `branch`, `map`). Wrappers (`retry`, `pipe`, `timeout`, `checkpoint`) reject `add_child` — wrap accepts at most one child.
- `remove_child`: rejects when target is the *only* child of a wrapper (would leave the wrapper invalid).
- `wrap`: replaces the target node `T` with `{ kind: wrapper, id: gen_id(), children: [T] }`. The new wrapper inherits the target's parent index.
- `unwrap`: only legal on wrappers with exactly one child. Replaces the wrapper with its child.
- `edit_config`: free-form; validation deferred to `flow_schema`.

ID generation for new nodes uses `${kind}_${nanoid(6)}`. This deviates from fascicle's monotonic `${kind}_${n}` scheme so canvas-created ids never collide with fascicle-generated ones; the suffix length is chosen to make collisions vanishingly unlikely.

After every command, the resulting tree is re-validated against `flow_tree_schema` (zod). A failure throws — the command list should not have produced an invalid tree, so this is an internal-bug detector, not a user-facing error.

### §5.3 Diff rendering `[v2.0]`

Three view modes:

- **Side-by-side.** Two `WeftCanvas` instances with synchronized pan/zoom (selecting a node in one highlights its peer in the other).
- **Merged.** One `WeftCanvas` with diff-status halos:
  - green halo: node only in right tree (added)
  - red halo + 50% opacity: node only in left tree (removed)
  - amber halo: same id/kind, config delta. Inspector panel shows the delta.
- **Toggle.** Tab control top-right; defaults to merged. Persisted in localStorage.

### §5.4 Edit interaction `[v2.1]`

Two surfaces:

- **Context menu** on right-click: kind-aware. On a sequence: "add child", "wrap in retry/pipe/timeout/checkpoint", "delete". On a wrapper: "unwrap", "edit config".
- **Drag-and-drop reorder** within container children. Drop indicator between siblings; drag onto another container to move into it.

Keyboard:

- `Cmd-Z` / `Cmd-Shift-Z`: undo / redo against the command log.
- `Delete`: remove selected node (calls `remove_child` on its parent).
- `Cmd-S`: export current spec (downloads `flow.spec.yaml`).

## §6 Constraints

### §6.1 The "registered functions only" discipline

Editing a `step`'s function reference in the canvas only changes the *displayed name*. If the resulting spec is to be loadable by `[v2.2]`'s `load_from_dsl`, every `<fn:name>` must resolve in the user's runtime registry. Anonymous functions (`<fn>` with no name) are **not editable** in v2.1 — the canvas surfaces them with a "function source not editable" badge.

### §6.2 No type checking across edits

`FlowNode` carries no static type info. Inserting a `step<string, number>` into a sequence that expects `string → string` is structurally legal and the canvas does not warn. Detection happens at runtime when the user reloads the spec into a real fascicle run. v2 accepts this degradation; better solutions (annotating `FlowNode` with type witnesses) are deferred indefinitely.

### §6.3 No collaboration

Single-user, single-browser, local. The studio writes spec files to disk via the existing browser download mechanism — no server-side persistence beyond `weft-watch`'s file watch.

### §6.4 ID stability is a reviewer-facing contract `[v2.0]`

The diff algorithm's correctness depends on `FlowNode.id` staying stable across structural edits. v0 inherits whatever fascicle assigns; v2.1's editor preserves ids on existing nodes and only mints new ones for canvas-created nodes. If a user manually re-numbers ids in their fascicle source, the diff falls back to positional alignment with reduced fidelity. Documented; not tooling.

## §7 Dependencies

### §7.1 On v0

Reuses `WeftCanvas`, `node_types`, `tree_to_graph`, `flow_tree_schema`, the loader panel, and the studio shell. v2 adds new components (`DiffCanvas`, `EditableCanvas`, command-palette UI) without modifying the v0 components.

### §7.2 On fascicle

| Surface | Stage | Status |
| --- | --- | --- |
| `flow_schema` (JSON Schema) | `[v2.1]` | already exported (`packages/core/src/index.ts:67`); used to ajv-validate parsed YAML specs. |
| `describe.json(step) → FlowNode` | `[v2.0]` | already exported; emits the trees that v2 consumes. |
| `to_dsl(step) → string` | `[v2.2]` | **NOT shipped.** Tracked as a fascicle issue. Without it, the edit→export→reload loop is one-way (export only). |
| `load_from_dsl(spec, registry) → Step` | `[v2.2]` | **NOT shipped.** Tracked as a fascicle issue. Without it, the spec the user exports is a documentation artifact, not a runnable flow. |
| Stable ids in `describe.json` output | `[v2.0]` | already true: fascicle's `describe.json` echoes the per-kind monotonic ids (`scope_1`, `step_3`). v2.0 piggybacks on this; if fascicle later changes the id scheme, v2.0's diff degrades to positional alignment. |

### §7.3 New runtime deps (in weft)

- `[v2.0]` none. Diff is a pure transform on existing data.
- `[v2.1]` `js-yaml` (or equivalent) for YAML serialize/parse. ~30KB minified. `ajv` for JSON-Schema validation against `flow_schema`. ~50KB minified. Both runtime-side in `@repo/weft`.
- `[v2.2]` no weft additions; the user installs `@robmclarty/fascicle` to consume `load_from_dsl`.

## §8 Failure Modes

| ID | Stage | Scenario | Handling |
| --- | --- | --- | --- |
| F1 | v2.0 | Trees have completely disjoint ids | Diff degenerates to "everything added + everything removed". Inspector banner: "no shared ids; trees may be from different sources". |
| F2 | v2.0 | One side is missing | Render the present side as a regular `/view`. No banner; the route silently downgrades. |
| F3 | v2.1 | User attempts an illegal edit (e.g. `add_child` on a wrapper) | Command-palette entry is grayed out; if invoked anyway via API, `apply_edit` throws and the studio surfaces a toast. |
| F4 | v2.1 | Exported spec fails its own re-parse (round-trip identity check) | Internal-bug detector. Show a modal with the diff and a "report a bug" link. Should not happen in practice. |
| F5 | v2.1 | User exports a spec containing anonymous `<fn>` references | Spec exports successfully but with a header comment: `# WARNING: contains N anonymous function references; spec is not loadable by load_from_dsl`. |
| F6 | v2.1 | Undo stack grows unbounded during a long editing session | Cap at 200 commands; oldest commands drop with no warning (matches typical editor UX). |
| F7 | v2.2 | `load_from_dsl` rejects spec because a `<fn:name>` is missing from the registry | Out of weft's hands; fascicle surfaces the error. weft's spec exporter could optionally write a comment with all function names used; deferred. |

## §9 Test Strategy

### §9.1 `[v2.0]`

- Unit tests for `compute_diff`: identical, all-added, all-removed, config-only change, kind change at same id, deeply nested mixed changes.
- Snapshot tests for `<DiffCanvas merged>` rendering across the same fixture matrix.
- Property test: `compute_diff(t, t).status === 'identical'` for any tree drawn from the existing fixture set.

### §9.2 `[v2.1]`

- Unit tests for every `EditCommand` shape, including its inverse.
- Property test: `apply_edit(tree, c).inverse` applied to the result yields the original tree (round-trip identity).
- Property test: `parse_spec(serialize_to_spec(tree)) === tree` for trees in the fixture set.
- Integration: load a tree, run a sequence of 10 random valid commands, undo all 10, expect the original tree.
- Playwright spec: drag-reorder + wrap-in-retry + export, then reload the exported file via `/view` and assert the canvas matches the edited state.

### §9.3 `[v2.2]`

Cross-repo. A fixture in fascicle's test suite asserts `load_from_dsl(serialize_to_spec(describe.json(flow))) ≈ flow` for the canonical fixture set. Tracked when fascicle commits to the API.

## §10 Non-goals for v2

- In-canvas function-body editing (weft is not a code editor).
- Collaboration / multi-user.
- Hot-edit of *running* flows (would require v1's transport to grow a command channel; v3-ish).
- Type inference or type-aware editing.
- Visual encoding of `adversarial` / `ensemble` / `tournament` / `consensus` (carried over from v0; orthogonal to v2's editing/diff scope).
- Persistent server-side spec storage.

## §11 Success Criteria

### `[v2.0]`

1. `pnpm check` exits 0.
2. The diff route renders any pair of fixtures from `fixtures/` with the documented halo colors.
3. Reviewer workflow demo: take two consecutive commits of `fixtures/all_primitives.json` (one with a child added to a sequence) and produce a side-by-side that makes the structural change obvious in <5 seconds of reading.

### `[v2.1]`

1. `pnpm check` exits 0.
2. All `EditCommand` shapes have round-trip property tests passing.
3. End-to-end: open a tree, perform a five-edit session on canvas, export the spec, re-import it, assert the resulting tree equals the post-edit canvas tree.

### `[v2.2]`

Conditional on fascicle shipping `to_dsl` / `load_from_dsl`. Success criterion at that point: a real fascicle test loads a weft-exported spec, runs it, and produces the same output it would have if the user had hand-coded the tree in TypeScript.

## §12 Open questions / TBD

- **Spec format.** YAML chosen tentatively for human editability and comment support. JSON would be simpler and avoid the extra parser dep. Decision deferred until `[v2.1]` build start; revisit if `js-yaml`'s footprint is unattractive.
- **ID scheme alignment.** weft mints `${kind}_${nanoid(6)}` for canvas-created nodes; fascicle uses monotonic `${kind}_${n}`. When v2.2 round-trips a weft-exported spec back through fascicle, do those nanoid ids survive (probably yes, since fascicle's `describe.json` echoes whatever id was on the step) or do they get rewritten? Verify when `load_from_dsl` lands.
- **Diff merge view: how to render an `added` node inside a `removed` parent?** Probably collapse: if a parent is removed, its children are removed transitively and shown only via the parent's removed halo. Edge case; specify before `[v2.0]` start.
- **Edit command palette discoverability.** Right-click context menu is the obvious surface. A `Cmd-K` palette is the more powerful one. Decide during `[v2.1]` design.
- **Spec validation strictness.** ajv-validate against fascicle's `flow_schema` on every import? Or only on demand? Strict-by-default is safer; opt-out for users who pre-trust the source.
- **Cross-repo coordination for v2.2.** Open a fascicle issue (or RFC) explicitly proposing the `to_dsl` / `load_from_dsl` API before starting `[v2.1]` design — the spec format weft commits to *is* the DSL fascicle would have to load. Best to align both repos at the same time.
