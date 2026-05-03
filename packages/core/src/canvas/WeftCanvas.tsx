/**
 * WeftCanvas — the React surface that renders a `flow_tree`.
 *
 * Responsibilities (spec §4.1):
 *   - Accept a `tree` prop and render it via React Flow.
 *   - Run `tree_to_graph` then `layout_graph`, debounced 200ms (latest wins).
 *   - Expose an imperative `canvas_api` through `on_ready`.
 *   - Forward node clicks to `on_node_click`.
 *   - Honor an `initial_viewport` if provided.
 *   - Accept (and ignore) the v1-reserved `events` prop.
 *
 * Performance hardening (spec §6 / research F12):
 *   - Above the configurable `large_threshold` (default 200), enable
 *     `onlyRenderVisibleElements` and disable the minimap while panning.
 *   - Custom node components are memoized in `nodes/registry.ts`.
 */

import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  type DefaultEdgeOptions,
  type ReactFlowInstance,
  type Viewport,
} from '@xyflow/react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
} from 'react';

import { make_latest_wins_debounce } from '../layout/debounce.js';
import {
  layout_graph,
  type LayoutGraphOptions,
} from '../layout/layout_graph.js';
import type { FlowNode, FlowTree } from '../schemas.js';
import type { NodeRuntimeState } from '../runtime_state.js';
import {
  tree_to_graph,
  type WeftEdge,
  type WeftNode,
} from '../transform/tree_to_graph.js';
import { node_types } from '../nodes/registry.js';
import { edge_types } from '../edges/registry.js';
import type { CanvasApi, CanvasViewport } from './canvas_api.js';
import { export_canvas_png } from './png_export.js';

// eslint-disable-next-line import/no-unassigned-import -- side-effect CSS import
import '@xyflow/react/dist/style.css';
// eslint-disable-next-line import/no-unassigned-import -- side-effect CSS import
import './canvas.css';

const LAYOUT_DEBOUNCE_MS = 200;
const DEFAULT_LARGE_THRESHOLD = 200;

// Subway-style edge routing: `weft-orth` renders the orthogonal polyline
// ELK actually computed (with rounded corners), instead of letting React
// Flow's built-in `smoothstep` re-route from source/target handles and
// throw the bend points away. The closed arrowhead is sized to read at the
// 4.5px stroke weight; ink color matches `--weft-color-edge-default`.
const DEFAULT_EDGE_OPTIONS: DefaultEdgeOptions = {
  type: 'weft-orth',
  markerEnd: {
    type: MarkerType.ArrowClosed,
    width: 18,
    height: 18,
    color: '#1a1611',
  },
};

export type FlowTreeEnvelope = FlowTree;

/**
 * Kept for backwards compatibility with v0 callers; now superseded by
 * `runtime_state` driven by `derive_runtime_state` in `@repo/core`.
 */
export type TrajectoryEvent = unknown;

export type WeftCanvasProps = {
  readonly tree: FlowTreeEnvelope;
  readonly on_node_click?: (node: FlowNode) => void;
  readonly on_ready?: (api: CanvasApi) => void;
  readonly initial_viewport?: CanvasViewport;
  /** Optional reserved hook for future async event subscription. Ignored. */
  readonly events?: AsyncIterable<TrajectoryEvent>;
  /**
   * Per-step runtime overlay state (active / error / cost / last_emit_ts).
   * The canvas does not derive this itself; callers compose it with
   * `derive_runtime_state(events, tree)` and re-pass on every event tick.
   */
  readonly runtime_state?: ReadonlyMap<string, NodeRuntimeState>;
  readonly layout_options?: LayoutGraphOptions;
  readonly large_threshold?: number;
};

type CanvasInternalProps = WeftCanvasProps;

function find_flow_node(root: FlowNode, id: string): FlowNode | undefined {
  if (root.id === id) return root;
  if (root.children === undefined) return undefined;
  for (const child of root.children) {
    const hit = find_flow_node(child, id);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

function strip_graph_path(graph_id: string): string {
  const idx = graph_id.lastIndexOf('/');
  return idx === -1 ? graph_id : graph_id.slice(idx + 1);
}

function CanvasInner({
  tree,
  on_node_click,
  on_ready,
  initial_viewport,
  runtime_state,
  layout_options,
  large_threshold = DEFAULT_LARGE_THRESHOLD,
}: CanvasInternalProps): JSX.Element {
  const container_ref = useRef<HTMLDivElement | null>(null);
  const instance_ref = useRef<ReactFlowInstance<WeftNode, WeftEdge> | null>(null);
  const has_auto_fit_ref = useRef(false);
  const [nodes, set_nodes] = useState<WeftNode[]>([]);
  const [edges, set_edges] = useState<WeftEdge[]>([]);
  const [is_panning, set_is_panning] = useState(false);
  // Compose nodes start collapsed — the abstraction the user opted into
  // with phase D is what they see first. Clicking a compose toggles its
  // graph id in this set, which re-runs tree_to_graph + layout.
  const [expanded_composes, set_expanded_composes] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );

  const debounced_layout = useMemo(
    () => make_latest_wins_debounce(layout_graph, LAYOUT_DEBOUNCE_MS),
    [],
  );

  // Reset the auto-fit guard when the tree itself changes (a new tree gets a
  // fresh fit; subsequent layout passes for the same tree do not).
  useEffect(() => {
    has_auto_fit_ref.current = false;
  }, [tree]);

  useEffect(() => {
    let cancelled = false;
    const { nodes: raw_nodes, edges: raw_edges } = tree_to_graph(tree, {
      expanded_composes,
    });
    void debounced_layout
      .call(raw_nodes, raw_edges, layout_options)
      .then((laid) => {
        if (cancelled) return;
        set_nodes(laid.nodes);
        set_edges(laid.edges);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error('[weft] layout failed:', err);
        set_nodes(raw_nodes);
        set_edges(raw_edges);
      });
    return () => {
      cancelled = true;
    };
  }, [tree, layout_options, debounced_layout, expanded_composes]);

  // Overlay runtime state onto the already-laid-out nodes without triggering
  // a re-layout. The id segment after the last `/` is the FlowNode.id (the key
  // the runtime_state map uses); container-rolled-up state cascades naturally
  // because derive_runtime_state already rolls cost up the parent chain.
  // Re-run when either the runtime_state reference changes *or* the layout
  // commits a new node set (otherwise runtime_state supplied at mount time
  // never lands, since the layout effect's set_nodes overwrites the data).
  useEffect(() => {
    if (runtime_state === undefined) return;
    set_nodes((current) =>
      current.map((node) => {
        const idx = node.id.lastIndexOf('/');
        const local_id = idx === -1 ? node.id : node.id.slice(idx + 1);
        const runtime = runtime_state.get(local_id);
        if (runtime === node.data.runtime) return node;
        const { runtime: _existing, ...rest } = node.data;
        const next_data: WeftNode['data'] =
          runtime === undefined ? rest : { ...rest, runtime };
        return { ...node, data: next_data };
      }),
    );
  }, [runtime_state, nodes.length]);

  // After React Flow finishes mounting and measuring every node, fit the
  // graph once so it lands centered. `useNodesInitialized` flips to true
  // exactly when every node's measured.{width,height} is available, which is
  // the moment fitView's bounding-box calculation becomes correct.
  // `has_auto_fit_ref` ensures we only fit on first load — subsequent
  // runtime-state overlays leave the user's pan/zoom alone. New trees reset
  // the guard via the tree-change effect above.
  // After the first non-empty layout commit, fit the graph once so it lands
  // centered. Refs survive StrictMode's double-invocation, so the guard
  // ensures we only fit on first load — runtime-state overlays leave the
  // user's pan/zoom alone. New trees reset the guard above. The retry fan
  // catches React Flow's late measurement pass on deeply-nested subflows;
  // useNodesInitialized() proved unreliable here because ELK-provided sizes
  // bypass its ResizeObserver path.
  const fit_timers_ref = useRef<ReadonlyArray<ReturnType<typeof setTimeout>>>([]);
  useEffect(() => {
    if (has_auto_fit_ref.current) return;
    if (nodes.length === 0) return;
    if (initial_viewport !== undefined) {
      has_auto_fit_ref.current = true;
      return;
    }
    const instance = instance_ref.current;
    if (instance === null) return;
    has_auto_fit_ref.current = true;
    const fit = (): void => {
      void instance.fitView({ duration: 220, padding: 0.12, minZoom: 0.1 });
    };
    fit_timers_ref.current = [80, 220, 480].map((ms) => setTimeout(fit, ms));
  }, [nodes.length, initial_viewport]);

  useEffect(
    () => () => {
      for (const t of fit_timers_ref.current) clearTimeout(t);
    },
    [],
  );

  useEffect(
    () => () => {
      debounced_layout.cancel();
    },
    [debounced_layout],
  );

  const handle_init = useCallback(
    (instance: ReactFlowInstance<WeftNode, WeftEdge>) => {
      instance_ref.current = instance;
      if (initial_viewport !== undefined) {
        void instance.setViewport({
          x: initial_viewport.x,
          y: initial_viewport.y,
          zoom: initial_viewport.zoom,
        });
      }
      if (on_ready === undefined) return;
      const api: CanvasApi = {
        focus_node(id: string) {
          const node = instance.getNode(id);
          if (node === undefined) return;
          void instance.fitView({ nodes: [{ id }], duration: 200 });
        },
        fit_view() {
          void instance.fitView({ duration: 200 });
        },
        async export_png() {
          const container = container_ref.current;
          if (container === null) {
            throw new Error('weft.export_png: canvas not mounted');
          }
          return export_canvas_png(instance, container);
        },
        get_viewport() {
          const v: Viewport = instance.getViewport();
          return { x: v.x, y: v.y, zoom: v.zoom };
        },
      };
      on_ready(api);
    },
    [on_ready, initial_viewport],
  );

  const handle_node_click = useCallback(
    (_event: unknown, rf_node: { id: string; data: { id: string; kind?: string } }) => {
      // Compose nodes also toggle expansion on click. This keeps the
      // gesture single — one click both inspects the compose and reveals
      // / hides its inner subgraph — instead of forcing a separate
      // chevron hit-target.
      if (rf_node.data?.kind === 'compose') {
        const id = rf_node.id;
        set_expanded_composes((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
      }
      if (on_node_click === undefined) return;
      const flat_id = rf_node.data?.id ?? strip_graph_path(rf_node.id);
      const found = find_flow_node(tree.root, flat_id);
      if (found !== undefined) on_node_click(found);
    },
    [on_node_click, tree],
  );

  const is_large = nodes.length >= large_threshold;
  const show_minimap = !is_large || !is_panning;

  const handle_move_start = useCallback(() => {
    if (is_large) set_is_panning(true);
  }, [is_large]);

  const handle_move_end = useCallback(() => {
    if (is_large) set_is_panning(false);
  }, [is_large]);

  return (
    <div
      ref={container_ref}
      className="weft-canvas"
      data-weft-canvas="true"
      data-weft-large={String(is_large)}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={node_types}
        edgeTypes={edge_types}
        defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={true}
        onInit={handle_init}
        onNodeClick={handle_node_click}
        onMoveStart={handle_move_start}
        onMoveEnd={handle_move_end}
        onlyRenderVisibleElements={is_large}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} color="#c8b896" />
        <Controls showInteractive={false} position="bottom-left" />
        {show_minimap ? (
          <MiniMap
            pannable
            zoomable
            position="top-right"
            maskColor="rgba(244, 236, 221, 0.6)"
          />
        ) : null}
      </ReactFlow>
    </div>
  );
}

export function WeftCanvas(props: WeftCanvasProps): JSX.Element {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
