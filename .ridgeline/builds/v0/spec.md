# weft v0 — Specification

**Status:** Draft, implementation-ready
**Packages:** `@robmclarty/weft` (= `@repo/weft`, the published library umbrella) + `@robmclarty/weft-watch` (= `@repo/watch`, the CLI). Internal workspace also contains `@repo/core` (implementation) and `@repo/studio` (unpublished app).
**Sibling builds:** `weft-v1` (live execution overlay), `weft-v2` (edit-in-place)
**Scope of this spec:** A React Flow-based *static* visualizer for fascicle composition trees. First downstream consumer of fascicle's composition layer. Live execution and edit-in-place are deferred to v1 / v2 siblings.

---

## §1 Problem Statement

Fascicle composition trees are plain data: a step is a value, composers take steps and return steps, and `describe(flow)` emits the entire tree. This is load-bearing for fascicle's philosophy, but the reward is only realized when the tree becomes visible. A composition with more than five or six primitives is already hard to read in TypeScript source, and `describe()` is a linear text projection that loses the parallel, branching, and loop structure that made the composition worth writing.

The pain today is threefold: no way to see a composition at a glance without building a mental model from source; no way to observe a composition running without tailing a jsonl log; no visual vocabulary for new primitives as fascicle's composer set grows. Without a visualizer, fascicle risks selling introspectability as a feature while keeping it inaccessible.

Secondary motivation: this project is also the author's React Flow bootcamp. Canvas layout, custom node rendering, interaction design, and live state overlays all transfer directly to longer-horizon visual tooling.

## §2 Solution Overview

Weft v0 is a local dev tool: a Vite-built React app plus a small library of React Flow node components. It reads a `FlowNode` tree produced by fascicle's `describe.json(flow)` and renders it as an auto-laid-out graph. Each composition primitive maps to a node type with a dedicated visual encoding. Container composers render as React Flow subflows. Layout runs in a Web Worker (elkjs) so the canvas stays responsive for large trees.

**v0 delivers static mode only.** Paste or load a JSON tree, render it on the canvas, pan/zoom/click-to-inspect, export PNG, watch a file for changes. v1 adds a live execution overlay via WebSocket; v2 adds edit-in-place with serialization back to a DSL. This spec does not preclude either; contracts for execution state on nodes (§5.3) and future edit hooks are specified so v0 does not box them out.

### Architecture

```text
+------------------------------------------------------------------+
|              @repo/studio (Vite + React app)                     |
|                                                                  |
|  +----------------+     +--------------------+                   |
|  | file loader    +---->+  tree_to_graph     |  <-- @repo/core   |
|  | (drag-drop,    |     |  (FlowNode ->      |                   |
|  |  paste, watch) |     |   RFNode+RFEdge)   |                   |
|  +----------------+     +---------+----------+                   |
|                                   |                              |
|                         +---------v----------+                   |
|                         |  layout (elkjs     |  <-- @repo/core   |
|                         |  in Web Worker)    |                   |
|                         +---------+----------+                   |
|                                   |                              |
|                         +---------v----------+                   |
|                         |  React Flow canvas |  <-- @repo/core   |
|                         |  custom node types |                   |
|                         +--------------------+                   |
+------------------------------------------------------------------+
                                   ^
                                   | file changes
                                   |
                         +---------+----------+
                         |  @repo/watch       |
                         |  (CLI, chokidar,   |
                         |   local WebSocket) |
                         +--------------------+
```

### Packages

Four internal workspace packages, two published npm packages:

- **`@repo/core`** (workspace-only) — implementation: React components, node types, `tree_to_graph` transform, elkjs layout helpers, Zod schemas for `FlowNode`. Internal-only; consumers should never import `@repo/core` directly.
- **`@repo/weft`** (workspace-only, published as `@robmclarty/weft`) — the umbrella library. A thin package whose only job is to re-export the curated public surface from `@repo/core`. This is the single, explicit "what we export" boundary; `@repo/core` can refactor freely behind it.
- **`@repo/studio`** (workspace-only, unpublished) — Vite-built SPA consuming `@repo/weft` via workspace symlink (uses the umbrella, not `@repo/core` directly — the studio is its own first dogfooder of the public surface). File loader, inspector panel, URL routing, localStorage persistence of canvas UI state. Runs locally via `pnpm dev`; eventually a hosted demo.
- **`@repo/watch`** (workspace-only, published as `@robmclarty/weft-watch`) — Node CLI that tails a file and pushes changes to the studio over a local WebSocket. Published as a separate package so CLI users (`npm i -g @robmclarty/weft-watch`) don't pull in React peer dependencies.

v1 extends `@repo/watch` to also tail fascicle trajectory JSONL streams (no separate bridge package; fascicle already ships `filesystem_logger` and `run.stream()`, so the studio reads the same way it reads tree JSON).

## §3 Data Model

Weft has no database and no persistent storage in v0 beyond browser localStorage for canvas UI state. The only structured data is the `FlowNode` tree produced by fascicle.

### `FlowNode` — the canonical input

Weft consumes the exact `FlowNode` type that fascicle's `describe.json()` already emits. This is a public export of `@robmclarty/fascicle` (re-exported from `@repo/core`), which means weft does **not** need to redeclare the type — it imports it.

```typescript
// Exported from @robmclarty/fascicle
type FlowValue =
  | string
  | number
  | boolean
  | null
  | ReadonlyArray<FlowValue>
  | Readonly<{ [key: string]: FlowValue }>
  | { readonly kind: '<fn>'; readonly name?: string }
  | { readonly kind: '<schema>' }
  | { readonly kind: string; readonly id: string };  // step reference or <cycle>

type FlowNode = {
  readonly kind: string;
  readonly id: string;
  readonly config?: Readonly<{ [key: string]: FlowValue }>;
  readonly children?: ReadonlyArray<FlowNode>;
};
```

**Shape notes (fascicle reality, mirrored verbatim into weft's expectations):**

- All composers use flat positional `children`. There is no separate `named_children` field and no `wraps` field.
- `parallel` stores child order in `children` and child names in `config.keys: string[]`. Weft zips the two to recover `{ name: child }` pairs.
- Wrapper-like composers (`retry`, `pipe`, `timeout`, `checkpoint`) have `children.length === 1`. Weft treats single-child wrapper kinds by kind-name lookup, not by field.
- Cycles render as `{ kind: '<cycle>', id }` in loose mode; fascicle throws `describe_cycle_error` in strict mode.
- Function references carry `name` when the function has one. Anonymous functions serialize as `{ kind: '<fn>' }`.
- Schema references (zod) serialize as `{ kind: '<schema>' }`.

### `flow_tree` — weft's ingest envelope

Weft wraps the `FlowNode` in a versioned envelope on ingest so watch streams and saved exports can be format-versioned without requiring fascicle to carry a wrapper:

```typescript
type flow_tree = {
  version: 1;
  root: FlowNode;
};
```

The envelope is constructed on weft's side. Fascicle emits a bare `FlowNode`.

### v0-covered kinds

Fascicle ships sixteen composition primitives today (`step`, `sequence`, `parallel`, `branch`, `map`, `pipe`, `retry`, `fallback`, `timeout`, `adversarial`, `ensemble`, `tournament`, `consensus`, `checkpoint`, `suspend`, `scope` with internal `stash` / `use`). Weft v0 ships dedicated node components for the seven that exercise the layout patterns the canvas needs to prove out:

`step`, `sequence`, `parallel`, `pipe`, `retry`, `scope`, and scope's internal `stash` / `use`.

The other nine shipped kinds (`branch`, `map`, `fallback`, `timeout`, `adversarial`, `ensemble`, `tournament`, `consensus`, `checkpoint`, `suspend`) and any future kinds render as a **generic container node with a warning badge** until their dedicated components ship. Children still render; only the parent chrome is generic. The dedicated components for the remaining nine are planned follow-ups within v0's bootcamp scope, not blockers.

### Canvas state (localStorage)

The studio persists non-essential UI state to localStorage under `weft.canvas.<tree_hash>`:

```typescript
type canvas_state = {
  zoom: number;
  viewport: { x: number; y: number };
  selected_node_ids: string[];
  collapsed_node_ids: string[];
};
```

`tree_hash` is a SHA-256 of the serialized `FlowNode` so state is keyed to a specific composition. A new tree starts with fresh state.

## §4 Interface Definitions

### §4.1 Library public API (`@repo/weft`, published as `@robmclarty/weft`; re-exports curated surface from `@repo/core`)

One entry component plus a handful of pure helpers.

```typescript
type WeftCanvasProps = {
  tree: flow_tree;
  on_node_click?: (node: FlowNode) => void;
  on_ready?: (api: canvas_api) => void;
  initial_viewport?: { x: number; y: number; zoom: number };
  // Reserved for v1; ignored in v0:
  events?: AsyncIterable<trajectory_event>;
};

const WeftCanvas: React.FC<WeftCanvasProps>;

type canvas_api = {
  focus_node: (id: string) => void;
  fit_view: () => void;
  export_png: () => Promise<Blob>;
  get_viewport: () => { x: number; y: number; zoom: number };
};

function tree_to_graph(tree: flow_tree): {
  nodes: RFNode[];
  edges: RFEdge[];
};

function layout_graph(
  nodes: RFNode[],
  edges: RFEdge[],
  options?: layout_options,
): Promise<{ nodes: RFNode[]; edges: RFEdge[] }>;

type layout_options = {
  direction?: 'LR' | 'TB';   // default 'LR'
  node_spacing?: number;     // default 40
  rank_spacing?: number;     // default 80
};
```

### §4.2 Studio app interface (`@repo/studio`)

Interface surface = URL routes, file loader, keyboard shortcuts.

**URL routes:**

- `/` — empty canvas with loader panel
- `/view?src=<url>` — fetch a `flow_tree` JSON and render
- `/watch?ws=<port>` — connect to a local `weft-watch` server

**File loader accepts:**

- Drag-drop of a `.json` file containing a `flow_tree` (or a bare `FlowNode` — studio auto-wraps)
- Paste of JSON into a textarea
- URL fetch via `?src=`
- WebSocket stream from `weft-watch`

**Keyboard shortcuts:**

- `f` — fit view
- `/` — focus search box
- `Escape` — clear selection
- `?` — show shortcut help

### §4.3 Node type contracts

Each v0 kind has a React component registered as a React Flow custom node type. Components receive standard React Flow node data plus weft-specific metadata:

```typescript
type WeftNodeData = {
  kind: string;
  id: string;
  config?: FlowNode['config'];
  // v1 additions (ignored in v0):
  execution_state?: 'idle' | 'running' | 'succeeded' | 'failed' | 'aborted';
  latest_event?: trajectory_event;
};
```

**Visual encoding (v0):**

- **step** — leaf node. Prominent `id` label, secondary line shows the function reference (`<fn:name>` / `<fn>`). Single input handle on the left, single output on the right.
- **sequence** — parent container. Children render as child nodes with auto-routed edges between them in order.
- **parallel** — fan-out container. Container has one input; each child is labeled with its name (zipped from `config.keys`). Edges split from the input to every child and converge at a container-level output handle.
- **pipe** — wrapper. Thin border with a small "pipe" glyph indicating the tail transform (`config.fn` rendered as `<fn:name>` / `<fn>`). Inner node renders as its single child.
- **retry** — wrapper. Border badge showing `max_attempts × backoff_ms`. Inner node renders normally.
- **scope** — container. Children render in order. `stash` entries show a "key" badge with the stash name. `use` entries show a "reads:" badge with the list of names. A dashed `stash → use` overlay edge (non-structural) indicates which `use` reads which key.

Unknown kinds: generic rounded-rect container with the kind name centered and an amber warning badge.

### §4.4 Trajectory event contract (v1-reserved)

Defined here only so v0 node components can declare the field; not wired up in v0.

```typescript
type trajectory_event =
  | { kind: 'span_start'; span_id: string; name: string; parent_span_id?: string; meta?: Record<string, unknown> }
  | { kind: 'span_end'; span_id: string; meta?: Record<string, unknown>; error?: string }
  | { kind: 'emit'; span_id: string; payload: Record<string, unknown> };
```

## §5 Business Logic

### §5.1 Tree-to-graph conversion

`tree_to_graph(tree)` walks `tree.root` depth-first and emits one RFNode per `FlowNode` plus edges for parent-child and sibling relationships.

Rules:

1. Every `FlowNode` produces one RFNode with `id = <parent_path>/<node.id>`. Path prefix guarantees uniqueness across the tree even when local ids collide.
2. Container kinds (`sequence`, `scope`, `parallel`) produce RFNodes whose children are linked via React Flow's `parentNode` relationship. This engages subflow rendering.
3. Wrapper kinds (`retry`, `pipe`) produce an RFNode with their single child as a `parentNode`-linked child.
4. Edges are emitted for sibling ordering in `sequence` (each child → next), fan-out in `parallel` (container input → each child, with edge label from `config.keys[i]`), and for any future kind's structural wiring.
5. Scope bindings: `stash` nodes get a dashed outgoing edge labeled with the stash key to any downstream `use` node that declares that key in `config.keys`. This is the only non-structural edge type in v0.
6. Function references in `config` render as plain strings (`<fn:name>` or `<fn>`). No source-code deep-linking in v0.

### §5.2 Layout

elkjs `layered` algorithm, direction `RIGHT` by default. Container nodes get `nodeSize.constraints = ['NODE_LABELS', 'PORTS']` so extents grow to fit children.

Layout runs in a Web Worker. The canvas sends the graph over `postMessage`, receives positioned nodes back, and applies them in a single React state update.

Debounce: layout recomputes no more often than once per 200ms. Latest request wins.

### §5.3 Node interaction

Clicking a node selects it and opens a side panel with:

- `kind`, `id`
- `config` (pretty-printed JSON)
- For wrappers: the wrapped child's `id` + `kind`
- Counts of children; for `parallel`, the `keys` list; for `scope`, the stash/use summary

Clicking the background clears selection. Double-clicking a container toggles collapsed state (collapsed containers render as a single node with a child-count badge).

### §5.4 File loading and validation

Incoming documents validate against a Zod schema mirroring `FlowNode`. On failure:

- Inline error in the loader panel with the offending JSON path.
- No partial tree rendered. Previous canvas remains visible.

### §5.5 Watch mode

`weft-watch <path>` CLI:

1. Reads the file, validates it, opens a local WebSocket on `127.0.0.1:<random port>`.
2. Opens `http://localhost:5173/watch?ws=<port>` in the default browser (studio is assumed to be running, or can be started separately).
3. Watches the file with chokidar. On change, re-reads, re-validates, sends the new tree to connected clients.

Intended loop during fascicle development: write a test that calls `describe.json(flow)` and writes the result to `/tmp/flow.json`, point the CLI at that file, iterate.

## §6 Constraints

### Technical

- **Language:** TypeScript 5.x, `strict: true`.
- **Style:** Functional and procedural. No `class`, no `this`, no `extends`. React components are function components.
- **Naming:** snake_case for variables, functions, parameters, files; PascalCase for types, React components, and React Flow node type keys; SCREAMING_SNAKE_CASE for constants.
- **Module format:** ESM only.
- **Frontend stack:** Vite, React 18+, TypeScript, Tailwind CSS, `@xyflow/react`, elkjs, Zod, Vitest.
- **No ambient singletons.** No module-level mutable state.
- **No global CSS** beyond Tailwind base.

### Scope

**In scope for v0:**

- File-based loading of a `FlowNode` tree (via drag-drop, paste, URL, or watch CLI).
- Rendering of the seven MVP primitives.
- elkjs auto-layout in a Web Worker.
- Pan, zoom, click-to-inspect, fit-view, PNG export.
- Watch mode via companion CLI.

**Out of scope for v0 (tracked in sibling builds):**

- Execution state, trajectory overlay (via watch CLI extended to tail fascicle's trajectory JSONL) → `weft-v1`.
- Edit-in-place, DSL round-trip, diff view → `weft-v2`.
- Persistent server-side storage, multi-user, auth, cloud deployment, mobile, full accessibility, analytics, sharing links → deferred indefinitely.

### Operational

- **Distribution:** `@robmclarty/weft` (= `@repo/weft`) published to npm as the library umbrella, re-exporting `@repo/core`'s curated public surface. `@robmclarty/weft-watch` (= `@repo/watch`) published separately as a CLI. `@repo/studio` is built as a static site the user runs locally (or accessed as a hosted demo); not published.
- **Runtime:** modern browsers (Chrome/Firefox/Safari, latest two majors).
- **Watch CLI:** Node.js ≥ 20.
- **Repo:** separate from fascicle (see §9). Depends on fascicle via its published `FlowNode` / `FlowValue` exports.

## §7 Dependencies

### Upstream (fascicle)

Weft v0 depends on fascicle exposing:

1. `describe.json(flow): FlowNode` — **already shipped** (`@repo/core`, re-exported from `@robmclarty/fascicle`).
2. Exported types `FlowNode`, `FlowValue`, `DescribeOptions` — **already shipped**.
3. Function-name capture on `<fn>` values — **already shipped** (function `name` included when non-empty).
4. Cycle handling in `describe.json` (loose mode emits `<cycle>` sentinels; `{ strict: true }` throws `describe_cycle_error`) — **already shipped**.
5. The sixteen composition primitives all enumerated as stable `kind` values in the `FlowNode` output — **already shipped**.

No further fascicle changes are required to build weft v0.

### Runtime (`@repo/core`)

| Package | Purpose |
| --- | --- |
| `react` (peer) | UI framework |
| `react-dom` (peer) | DOM renderer |
| `@xyflow/react` | Canvas and graph rendering |
| `elkjs` | Auto-layout (layered) |
| `zod` | `FlowNode` schema validation |
| `@robmclarty/fascicle` | Shared `FlowNode` type |

### Runtime (`@repo/studio`, in addition)

| Package | Purpose |
| --- | --- |
| `react-router-dom` | URL routing |
| `tailwindcss` | Styling |
| `@radix-ui/react-dialog` (+ friends) | Inspector / shortcut modal primitives |

### Watch CLI

| Package | Purpose |
| --- | --- |
| `chokidar` | File watching |
| `ws` | Local WebSocket server |
| `commander` | CLI argument parsing |

### Development

`vite`, `vitest`, `@testing-library/react`, `@vitest/browser`, `typescript`, `eslint` + `@typescript-eslint`.

## §8 Failure Modes

### F1: Malformed JSON input

Loader shows the Zod validation error with the offending path. Studio does not crash; previous canvas remains visible.

### F2: Cyclic tree (`<cycle>` sentinel)

Fascicle already renders cycles as `{ kind: '<cycle>', id }` in loose mode. Weft renders these as a small "cycle" badge node linking back to the cycle target by id. If somehow a cycle sneaks past (buggy producer), `tree_to_graph` guards with its own visited set and emits a warning-shaped node instead of infinite-recursing.

### F3: Very large tree (>1000 nodes)

Layout completes in < 5s in the worker. Canvas pan/zoom stays at 60fps up to 2000 nodes.

### F4: elkjs timeout (>10s)

Fall back to a deterministic naive layout (simple layered grid), show a banner indicating the fallback.

### F5: Web Worker unavailable

Layout runs on the main thread. Console warning logged; no user-visible banner (environment property, not a user error).

### F6: Unknown `flow_kind`

Generic container node + amber warning badge. Children still render.

### F7: Watch file deleted or moved

Banner indicates the file is unreachable. Canvas retains the last known tree. Banner clears when the file reappears.

## §9 Success Criteria

### Automated tests

- Unit tests for `tree_to_graph`: depth 1–5, every v0 kind exercised, expected nodes/edges.
- Zod schema tests: valid and invalid `FlowNode` fixtures with expected outcomes.
- Component tests: each node type renders expected handles, labels, badges for representative configs.
- Cycle detection (F2), worker fallback (F5), unknown kind (F6).

### Integration tests

- End-to-end: load a real `describe.json(flow)` output from an fascicle test fixture, render, assert expected node count and primitive kinds.
- Watch mode: CLI against a fixture file, headless browser connected, modify the file, assert canvas updates within 500ms.
- PNG export: trigger export, assert non-zero blob with correct MIME.

### Architectural validation

- `@repo/core` has zero dependencies on `@repo/studio`. `@repo/weft` depends only on `@repo/core` and contains no implementation logic of its own — only re-exports.
- No ambient singletons in any package.
- Every v0 kind has a rendering component; every future kind has an explicit entry in the generic-fallback list.
- No React classes; no module-level mutable state.

### Learning outcomes (bootcamp goals)

After shipping v0, the author should be able to articulate: which React Flow patterns (handles, subflows, custom nodes, hooks) pay for themselves, and which add complexity without matching return.

## §10 File Structure (separate `weft/` repo)

```text
weft/
  package.json                     # workspace root (devDeps + scripts)
  pnpm-workspace.yaml
  tsconfig.base.json
  README.md

  packages/
    weft/                          # @repo/weft — published as @robmclarty/weft
      package.json                 # name: @robmclarty/weft, deps: @repo/core (workspace:*)
      src/
        index.ts                   # re-exports the curated public surface of @repo/core

    core/                          # @repo/core (workspace-only)
      src/
        index.ts                   # public exports
        schemas.ts                 # zod schemas for FlowNode
        canvas/
          WeftCanvas.tsx
          canvas_api.ts
        nodes/
          StepNode.tsx
          SequenceNode.tsx
          ParallelNode.tsx
          PipeNode.tsx
          RetryNode.tsx
          ScopeNode.tsx
          StashNode.tsx
          UseNode.tsx
          GenericNode.tsx
          index.ts                 # node_types registry
        transform/
          tree_to_graph.ts
          cycle_detect.ts
          id_path.ts
        layout/
          layout_graph.ts
          layout.worker.ts
          fallback_layout.ts
        __tests__/...

    studio/                        # @repo/studio (workspace-only, unpublished)
      src/
        main.tsx
        App.tsx
        routes/ (Empty, View, Watch)
        components/ (LoaderPanel, InspectorPanel, Shortcuts)
        state/use_canvas_persistence.ts
        index.css
        __tests__/...

    watch/                         # @repo/watch — published as @robmclarty/weft-watch
      package.json                 # name: @robmclarty/weft-watch, bin: { weft-watch: ./dist/bin.js }
      src/
        bin.ts
        watcher.ts
        ws_server.ts

  fixtures/
    simple_sequence.json
    nested_parallel.json
    full_primitive_set.json
    cycle_bug.json
```

## §11 Environment Variables

None required for v0. Studio and watch CLI configure via CLI flags and URL parameters.

## §12 Open Questions

1. ~~**Name.**~~ **Resolved.** "Weft" — the threads woven horizontally through the warp; pairs with `fascicle` (a small bundle of fibers) in the textile/binding theme.
2. ~~**Fascicle `describe.json` addition.**~~ **Resolved.** `describe.json` is shipped, function-name capture is in place, and the `FlowNode` / `FlowValue` types are public exports of `@robmclarty/fascicle`.
3. **Subflow collapse default.** Everything expanded on first render, or auto-collapse beyond depth N? Initial: everything expanded; revisit after seeing real compositions.
4. **PNG export scale.** Full canvas (fit-view first, then render) or just visible viewport? Initial: full canvas.
5. **`stash → use` overlay edges.** React Flow edges with distinct styling, or separate SVG overlay layer? Initial: React Flow edges; revisit if clutter becomes a problem.
6. **Inspector panel depth.** All fields as pretty JSON initially; later, kind-aware richer views (e.g., `retry` timeline visualization).
7. **Hot-reload loop for library-on-studio development.** Verify pnpm workspace linking + Vite caching plays well on day one; document in root README.
