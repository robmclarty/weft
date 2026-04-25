# weft — Design

**Companion documents:** `constraints.md` (hard non-negotiables), `taste.md` (design philosophy), per-build `spec.md`

This document captures the *visualizable shape* of the system: the package layout, the data flow, and the file structure. It is the architectural skeleton that holds across builds. Specific component APIs, prop shapes, and behavioral semantics live in each `spec.md`.

Where the picture is genuinely uncertain (per-kind visual encoding, inspector layout, the exact set of canvas APIs), this document is silent.

---

## §1 — Layered Packages

```text
                  ┌──────────────────────────────┐
   consumers ──▶  │  @robmclarty/weft (umbrella) │  re-exports only
                  └──────────────┬───────────────┘
                                 │
                  ┌──────────────▼───────────────┐
                  │  @repo/core                  │  implementation
                  │  components, transforms,     │
                  │  layout, schemas             │
                  └─┬────────────┬───────────────┘
                    │            │
       ┌────────────▼─┐   ┌──────▼─────────┐
       │ react /      │   │ @xyflow/react  │
       │ react-dom    │   │ elkjs          │
       └──────────────┘   │ zod            │
                          │ @robmclarty/   │
                          │   fascicle (T) │
                          └────────────────┘

   ┌──────────────────────────────┐         ┌────────────────────────────────┐
   │  @repo/studio (app)          │ ──uses─▶│  @robmclarty/weft (umbrella)   │
   │  Vite SPA, file loader,      │         └────────────────────────────────┘
   │  router, inspector           │
   └──────────────────────────────┘

   ┌──────────────────────────────┐         ┌────────────────────────────────┐
   │  @robmclarty/weft-watch (CLI)│         │  no React, no canvas surface   │
   │  chokidar + ws + commander   │         │  bridge to studio via local WS │
   └──────────────────────────────┘         └────────────────────────────────┘
```

Dependency direction is downward and outward: studio → umbrella → core; watch is independent. No upward edges. Studio never imports `@repo/core` directly — it dogfoods the umbrella's published surface. Watch never imports anything in the React graph.

---

## §2 — Package Responsibilities

| Package | Owns | Does not own |
|---|---|---|
| `@repo/core` | React component implementations, the graph transform, the layout pipeline (worker + fallback), Zod schemas, the canvas API surface | application chrome, file loading, routing, persistence, watch transport |
| `@repo/weft` | the curated public surface; nothing else | implementation logic, JSX, non-trivial expressions — re-exports only |
| `@repo/studio` | file loaders (drag-drop, paste, URL fetch, watch socket), routes, inspector panel, keyboard shortcuts, per-tree localStorage | the canvas itself, the transform, the layout — those come from `@repo/weft` |
| `@repo/watch` | watching a file, validating its contents, forwarding changes over a localhost WebSocket | rendering, transforms, anything React |

---

## §3 — Data Flow

### Static path (v0)

```text
┌──────────────────┐
│ fascicle producer│   describe.json(flow) → FlowNode (plain JSON)
└────────┬─────────┘
         │
         ▼  (drag-drop / paste / URL fetch / watch socket)
┌──────────────────┐
│ studio loader    │   wraps FlowNode → flow_tree { version: 1, root }
│ (Zod validate)   │   on failure: surface JSON path; previous canvas stays
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ tree_to_graph    │   walks FlowNode → { nodes: RFNode[], edges: RFEdge[] }
│ (pure)           │   single dispatch on kind; cycle-safe
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ layout worker    │   elkjs layered; returns positioned nodes
│ (debounced)      │   fallback: main-thread layout with console warn
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ React Flow canvas│   custom nodeTypes registry; unknown kinds → generic
│                  │   handles, edges, subflows for containers
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ canvas state     │   zoom / viewport / selection / collapse
│ (per-tree)       │   localStorage keyed by hash(serialize(FlowNode))
└──────────────────┘
```

### Watch path (v0)

```text
┌──────────────────┐    chokidar    ┌──────────────────┐
│ filesystem file  │ ─────────────▶ │ @repo/watch      │  reads, validates,
│ /tmp/flow.json   │                │ ws server :PORT  │  pushes to clients
└──────────────────┘                └────────┬─────────┘
                                             │ ws://127.0.0.1:PORT
                                             ▼
                                    ┌──────────────────┐
                                    │ @repo/studio     │  /watch?ws=PORT
                                    │ subscribes;      │  re-runs the
                                    │ replaces tree    │  static path on each msg
                                    └──────────────────┘
```

### Reserved hooks for v1 / v2

- v1 extends watch to additionally tail a trajectory JSONL; the studio receives `trajectory_event`s on the same socket and threads them through `WeftCanvas`'s `events` prop. Components consume `execution_state` from `WeftNodeData`.
- v2 introduces edit commands originating in the studio; serialization to a fascicle DSL replaces the read-only loader path. The static-render path is preserved as a sibling mode.

---

## §4 — File Structure

The skeleton each package exposes. Specific files within each directory are a build decision; this layout reserves the slots.

```text
weft/
├── package.json                    workspace root
├── pnpm-workspace.yaml
├── tsconfig.json
├── AGENTS.md  CLAUDE.md  README.md
├── fallow.toml  vitest.config.ts  stryker.config.mjs  cspell.json  sgconfig.yml
├── rules/                          ast-grep structural rules
├── scripts/                        check pipeline, version skill backend
├── packages/
│   ├── core/                       @repo/core
│   │   ├── package.json
│   │   └── src/
│   │       ├── index.ts            public surface (re-exported by @repo/weft)
│   │       ├── canvas/             WeftCanvas, canvas_api
│   │       ├── nodes/              one component per primitive + GenericNode
│   │       ├── transform/          tree_to_graph, cycle handling, id paths
│   │       ├── layout/             layout_graph, layout.worker, fallback
│   │       └── schemas.ts          Zod schemas for FlowNode / flow_tree
│   ├── weft/                       @repo/weft → @robmclarty/weft
│   │   ├── package.json            "dependencies": { "@repo/core": "workspace:*" }
│   │   └── src/
│   │       └── index.ts            re-exports only
│   ├── studio/                     @repo/studio (unpublished)
│   │   ├── package.json            depends on @repo/weft (the umbrella)
│   │   └── src/
│   │       ├── main.tsx
│   │       ├── App.tsx
│   │       ├── routes/             empty / view / watch
│   │       ├── components/         loader, inspector, shortcuts overlay
│   │       └── state/              per-tree localStorage hooks
│   └── watch/                      @repo/watch → @robmclarty/weft-watch
│       ├── package.json            "bin": { "weft-watch": "./dist/bin.js" }
│       └── src/
│           ├── bin.ts              argv parsing, entry point
│           ├── watcher.ts          chokidar wrapper
│           └── ws_server.ts        localhost WebSocket
└── fixtures/                       sample FlowNode trees for tests + manual use
```

The directory names (`canvas/`, `nodes/`, `transform/`, `layout/`, `routes/`, `components/`, `state/`) are reserved by responsibility. Specific files within them are the build's choice. A build may add a directory at this level if it owns a fundamentally new responsibility (e.g. v1 may add `packages/core/src/reduce/` for the trajectory-event reducer).

---

## §5 — Public Surface (umbrella exports)

The umbrella's job is to publish a small, stable shape. The categories of exports are:

- **Canvas component.** A single React component plus a typed props object.
- **Imperative canvas API.** A small handle returned from a ready callback (focus, fit, export).
- **Transform.** A pure function from `flow_tree` to React Flow nodes and edges.
- **Layout.** A pure async function from nodes and edges to positioned nodes and edges.
- **Schemas.** Zod schemas for `flow_tree` and `FlowNode`, for callers who validate JSON themselves.
- **Types.** `flow_tree`, `WeftCanvasProps`, `WeftNodeData`, `canvas_api`, `layout_options`. `FlowNode` and `FlowValue` come from `@robmclarty/fascicle` and are re-exported by the umbrella.

Exact field-level shapes live in each build's `spec.md` §4. The umbrella's *categories* are stable across builds; field additions are minor bumps, removals are major.

---

## §6 — What This Document Does Not Cover

- The exact prop shape of `WeftCanvas`, the exact methods on `canvas_api`, or the exact fields of `WeftNodeData` → build `spec.md` §4.
- Per-kind visual encoding (handles, badges, colors, what `parallel`'s container looks like) → build `spec.md` §4.3 and component implementations.
- Layout direction defaults and node spacing → build `spec.md` §5.2.
- Inspector panel layout, keyboard shortcuts, route URL syntax → build `spec.md` §4.2.
- Watch CLI's WebSocket message envelope → `@repo/watch` build spec.
- Specific UI primitive library, routing library, styling system → build `spec.md` §6.
- v1 trajectory event shapes and overlay styling → `.ridgeline/builds/v1/spec.md`.
- v2 DSL grammar, edit command set, diff visualization → `.ridgeline/builds/v2/spec.md`.
- Code-level rationale (why dispatch on kind, why per-tree state, why workerized layout) → `taste.md`.
- Hard rules (no class, no default exports, ESM only, etc.) → `constraints.md`.
