# weft v2 — Specification (stub)

**Status:** Stub. Detailed spec to be written after v0 and v1 ship.
**Sibling builds:** `weft-v0` (static viewer — prerequisite), `weft-v1` (live overlay — prerequisite).
**Scope:** Edit-in-place. The canvas becomes a composition editor: add, remove, reorder, re-wrap nodes; serialize back to a Flow DSL; diff two trees.

---

## §1 Problem Statement (stub)

Reading a composition is a solved problem after v0. Observing one run is solved after v1. The next natural question is whether the canvas can also be where compositions get *built*. Typing nested composers in TypeScript is expressive but cognitively taxing past a certain size; dragging nodes around a canvas could be faster for certain kinds of edits (reorder a sequence, add a retry wrapper, split a step out of a scope).

The pain this addresses: composition surgery on anything larger than a dozen nodes is currently edit-TypeScript-then-re-read-the-tree. If the tree is already visible, direct manipulation is faster and produces fewer mistakes. Diff view makes review of composition changes much cheaper than reading a TS diff.

This is also the version that tests whether weft has legs as a tool, not just a viewer.

## §2 Solution Overview (stub)

Three layers of editing, each more ambitious:

1. **Structural edits.** Add a step to a sequence, remove a child from a parallel, wrap a node in `retry` or `pipe`, move a subtree between scopes. These are pure tree-structure operations; they do not require understanding semantics beyond "what kinds can contain what children."
2. **Config edits.** Change `retry.max_attempts`, rename a `stash.key`, edit the function reference of a `pipe`. These need UI per kind. Plain function bodies cannot be round-tripped (weft is not a code editor), but function *references by name* can — the DSL binds function names to a registry provided by the user's own fascicle setup.
3. **Round-trip to DSL.** The edited tree serializes to the fascicle Flow DSL (a YAML/JSON shape covering all sixteen primitives plus `ref` for cross-references). Fascicle ships the JSON Schema today (`packages/core/src/flow-schema.json`, exported as `flow_schema` from `@robmclarty/fascicle`); a runtime DSL loader is the missing piece this build depends on.

Diff view is a parallel concern: given two `FlowNode` trees, render them side-by-side with added / removed / changed nodes highlighted (green halo / red halo / amber halo as the initial visual language).

## §3 Open questions and ideas

- **What serialization format.** YAML was the initial preference (human-editable, comments supported). JSON is simpler but lossy without comments. A TS-like mini-DSL is maximally expressive but a bigger project. Decision deferred; probably YAML.
- **Round-trip fidelity.** Not every TS composition is round-trippable. Function references that aren't named symbols are lost; closures over outer state are lost. v2 needs to either (a) refuse to edit compositions it can't faithfully round-trip, or (b) accept degradation with explicit warnings. Probable answer: both — the DSL imposes a "registered functions only" discipline; trees that violate it can be *viewed* and *diffed* but not *edited*.
- **Where does the registry of functions live?** A user's project has its own set of named functions. The DSL needs to bind `<fn:name>` references to real functions at runtime. This is a user-provided map — probably a simple TS module exporting `{ [name]: fn }` that the adapter imports.
- **Diff granularity.** Diffs at the node level are obvious. Diffs at the config level (which field changed within a `retry`?) are the next layer. Structural diffs across renames (did this node get renamed, or was it deleted + added?) require ids to be stable across edits, which in turn requires ids to come from the DSL, not from composer auto-generation. Implication: the DSL should persist explicit ids.
- **Undo / redo.** Structural edits compose into history. Standard pattern: represent each edit as a typed command; store the command log; undo = inverse command. Maybe `patch` / `inverse_patch` helpers on the core library.
- **Collaboration.** Explicitly out of scope. Single-user, local, filesystem-backed.
- **Validation in the editor.** When a user drops a `step<string, number>` into a sequence that expects `string → string`, the canvas should refuse (or warn). Type information is lost in `FlowNode` — it's structural, not typed. v2 either gives up on type-checking (accept that the resulting tree might not run) or annotates `FlowNode` with richer type info. Probable answer: accept the degradation; runtime validation catches it when the user reloads the DSL.

## §4 Dependencies on v0 and v1

- v0: the canvas, node types, `tree_to_graph`, and inspector panel all extend here. Editing reuses the selection and panel UI.
- v1: live mode operates on a *running* composition; edit mode operates on a *static* tree. A thoughtful user can toggle between them. Edit actions on a running flow are a separate concern (hot-swap composer subtrees?) and likely a v3.

## §5 Dependencies on fascicle

Already shipped:

- The Flow DSL JSON Schema (`flow_schema` export, `packages/core/src/flow-schema.json`) covering all sixteen primitives plus `ref`. Documentation-only today, but stable enough for weft to validate against.

Still needed from fascicle (or weft can ship them itself):

- A DSL loader: `load_from_dsl(yaml: string, registry: Record<string, fn>): step`. Substantial new API — most likely lives in fascicle, since the dispatch table for the sixteen composers is already there.
- A serializer `to_dsl(step): string` — though weft can also generate DSL directly from its edited tree without going through fascicle.
- An "id stability" contract: explicit ids in the DSL must round-trip through `describe.json` unchanged. Today, `describe.json` already echoes whatever id the composer assigned; the requirement is just that DSL-loaded trees keep using the DSL-supplied ids rather than regenerating them.

## §6 Non-goals for v2

- In-canvas function-body editing (weft is not a code editor).
- Collaboration / multi-user.
- Live edits of running flows (v3-ish).
- Automatic type inference across structural edits.

## §7 TBD

- Full interface definitions (edit commands, canvas interaction model, panel UI per kind).
- Diff view interaction model (three-pane: old / new / canvas).
- Concrete DSL mapping from `FlowNode` to YAML and back, including id stability rules.
- Test strategy (property tests: tree → DSL → tree is identity for round-trippable trees).
- Failure modes and recovery.
- Success criteria.
