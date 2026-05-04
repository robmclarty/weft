# Embedding the canvas

`@robmclarty/weft` ships a single React component — `WeftCanvas` — that renders a fascicle `FlowTree`. Anything that mounts React can host it: docs sites, internal tools, post-mortem timelines, runtime overlays of in-flight executions.

The studio is one consumer. This guide covers everything the studio knows about so you can do the same.

## Install

```bash
npm install @robmclarty/weft
# or
pnpm add @robmclarty/weft
```

Peer requirement: React 18.

## Minimum example

```tsx
import { WeftCanvas, type FlowTree } from '@robmclarty/weft';

const tree: FlowTree = {
  version: 1,
  root: {
    kind: 'sequence',
    id: 'root',
    children: [
      { kind: 'step', id: 'fetch', config: { fn: { kind: '<fn>', name: 'fetch' } } },
      { kind: 'step', id: 'render', config: { fn: { kind: '<fn>', name: 'render' } } },
    ],
  },
};

export function MyDiagram() {
  return (
    <div style={{ width: '100%', height: 600 }}>
      <WeftCanvas tree={tree} />
    </div>
  );
}
```

The container needs an explicit height (React Flow won't grow itself). Width can be `100%`.

## Validate before you render

If your tree comes from outside the type system (a fetch, a file, an editor), validate first:

```ts
import { flow_tree_schema } from '@robmclarty/weft';

const parsed = flow_tree_schema.safeParse(json);
if (parsed.success) {
  setTree(parsed.data);
} else {
  setError(parsed.error.issues[0]);
}
```

The schema is permissive on extras (extra `meta`, extra `config` fields round-trip) and strict on shape (`parallel.config.keys` must be a string array of the same length as `children`).

## Imperative handle

Pass `on_ready` to receive a `CanvasApi` once the canvas is mounted:

```tsx
import { useRef } from 'react';
import { WeftCanvas, type CanvasApi } from '@robmclarty/weft';

function MyDiagram({ tree }) {
  const apiRef = useRef<CanvasApi | null>(null);
  return (
    <>
      <button onClick={() => apiRef.current?.fit_view()}>fit</button>
      <button onClick={() => apiRef.current?.focus_node('render')}>focus render</button>
      <button onClick={async () => {
        const blob = await apiRef.current?.export_png();
        // ... save blob
      }}>export PNG</button>
      <WeftCanvas tree={tree} on_ready={(api) => { apiRef.current = api; }} />
    </>
  );
}
```

`CanvasApi` surface:

```ts
type CanvasApi = {
  focus_node(id: string): void;        // pan/zoom to a node by id
  fit_view(): void;                    // fit the whole graph
  export_png(): Promise<Blob>;         // serialize the canvas to PNG
  get_viewport(): { x: number; y: number; zoom: number };
};
```

## Click handling

```tsx
<WeftCanvas
  tree={tree}
  on_node_click={(node) => {
    // node is the original FlowNode (with config, meta, kind)
    openInspector(node);
  }}
/>
```

The handler receives the `FlowNode` — not React Flow's wrapper — so you can read `node.config`, `node.meta.description`, etc. directly.

## Initial viewport

```tsx
<WeftCanvas
  tree={tree}
  initial_viewport={{ x: 0, y: 0, zoom: 0.8 }}
/>
```

When provided, the canvas restores this viewport on mount instead of auto-fitting. Useful when you persist the user's pan/zoom across reloads (the studio does this via `state/use_canvas_persistence.ts`).

If you omit `initial_viewport`, the canvas auto-fits once on first mount and once per compose-collapse toggle.

## Layout options

```tsx
import type { LayoutGraphOptions } from '@robmclarty/weft';

const layout: LayoutGraphOptions = {
  direction: 'LR',         // 'LR' (default) or 'TB'
  node_spacing: 120,       // gutter between siblings
  rank_spacing: 200,       // gutter between layers
  router: 'elk',           // 'elk' (default) or 'libavoid' (requires libavoid_wasm_url)
};

<WeftCanvas tree={tree} layout_options={layout} />
```

The defaults are tuned for thick orthogonal subway-style edges and assume LR direction. If you flip to TB, expect to re-tune `rank_spacing` (vertical gutter) and possibly `node_spacing` (horizontal gutter between sibling nodes within a layer).

See [layout.md](./layout.md) for the libavoid spike caveats.

## Runtime overlay

Render execution state on top of the structural graph by computing per-step `NodeRuntimeState` from a trajectory event stream:

```tsx
import { useMemo } from 'react';
import {
  WeftCanvas,
  derive_runtime_state,
  trajectory_event_schema,
  type ParsedTrajectoryEvent,
} from '@robmclarty/weft';

function LiveDiagram({ tree, events }: {
  tree: FlowTree;
  events: ParsedTrajectoryEvent[];
}) {
  const runtimeState = useMemo(
    () => derive_runtime_state(events, tree),
    [events, tree],
  );
  return <WeftCanvas tree={tree} runtime_state={runtimeState} />;
}
```

`derive_runtime_state` is a pure projection — same events in, same map out. Each `NodeRuntimeState` carries:

```ts
type NodeRuntimeState = {
  active: boolean;          // a span_start is open; node pulses ochre
  error: string | null;     // most recent span_end carried `error`; node scars
  last_emit_ts: number | null; // wall-clock of the most recent emit; brief flash
  cost_usd: number;         // sum of cost.total_usd attributed to step + descendants
  last_run_id: string | null;
  span_count: number;
};
```

Cost rolls up the parent chain (a `step` inside a `compose` charges the compose too). The canvas hot-path skips re-layout when only `runtime_state` changes, so streaming events at high frequency is cheap.

## Public API surface

Everything exported from `@robmclarty/weft`:

```ts
// Schemas
export {
  flow_node_schema,
  flow_tree_schema,
  flow_value_schema,
  step_metadata_schema,
  trajectory_event_schema,
  span_start_event_schema,
  span_end_event_schema,
  emit_event_schema,
  custom_event_schema,
};
export type { FlowNode, FlowTree, FlowValue, StepMetadata };
export type {
  ParsedTrajectoryEvent,
  SpanStartEvent,
  SpanEndEvent,
  EmitEvent,
  CustomTrajectoryEvent,
};

// Transform (advanced — usually you only render with WeftCanvas)
export { tree_to_graph };
export type {
  TreeToGraphResult,
  WeftEdge, WeftEdgeData,
  WeftNode, WeftNodeData,
};

// Layout (advanced — same)
export { layout_graph, fallback_layout, make_latest_wins_debounce };
export type {
  LayoutGraphOptions, LayoutOptions, LayoutDirection, LayoutRouter,
  DebouncedAsync,
};

// Canvas
export { WeftCanvas, node_types };
export type { WeftCanvasProps, CanvasApi, CanvasViewport, TrajectoryEvent };

// Tree id (for cache keys, persistence)
export { tree_id };

// Runtime overlay
export { derive_runtime_state, empty_runtime_state };
export type { NodeRuntimeState, DeriveRuntimeStateOptions };
```

The umbrella package (`@repo/weft`) is a re-export-only surface over `@repo/core`. If you find yourself wanting something not exported, file an issue rather than reaching into `@repo/core` directly — that's not a public boundary.

## CSS

`WeftCanvas` imports its own CSS at module scope, including `@xyflow/react/dist/style.css` and weft's `canvas.css`. You don't need to import anything separately. If your build pipeline tree-shakes side-effect imports too aggressively, mark `@robmclarty/weft` as having side effects in its package config (it does).

## Sizing and overflow

Two gotchas worth flagging:

- The canvas needs an explicit height on its container. `100vh` and `100%` (with a sized parent) both work.
- React Flow positions nodes absolutely inside the container. Don't put `overflow: hidden` on intermediate ancestors and expect the minimap or controls to escape — they won't.

## Server-side rendering

The Web Worker that hosts ELK is unavailable on the server. `layout_graph` detects this and falls back to a deterministic naive layout (`fallback_layout`) so SSR doesn't crash; one console warning fires per process. The result is laid out top-to-bottom in a single column — fine for a static fallback that hydrates into a real layout on the client.
