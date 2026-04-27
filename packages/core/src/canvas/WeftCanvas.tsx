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
  MiniMap,
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
import {
  tree_to_graph,
  type WeftEdge,
  type WeftNode,
} from '../transform/tree_to_graph.js';
import { node_types } from '../nodes/registry.js';
import type { CanvasApi, CanvasViewport } from './canvas_api.js';
import { export_canvas_png } from './png_export.js';

// eslint-disable-next-line import/no-unassigned-import -- side-effect CSS import
import '@xyflow/react/dist/style.css';
// eslint-disable-next-line import/no-unassigned-import -- side-effect CSS import
import './canvas.css';

const LAYOUT_DEBOUNCE_MS = 200;
const DEFAULT_LARGE_THRESHOLD = 200;

export type FlowTreeEnvelope = FlowTree;

export type TrajectoryEvent = unknown;

export type WeftCanvasProps = {
  readonly tree: FlowTreeEnvelope;
  readonly on_node_click?: (node: FlowNode) => void;
  readonly on_ready?: (api: CanvasApi) => void;
  readonly initial_viewport?: CanvasViewport;
  readonly events?: AsyncIterable<TrajectoryEvent>;
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
  layout_options,
  large_threshold = DEFAULT_LARGE_THRESHOLD,
}: CanvasInternalProps): JSX.Element {
  const container_ref = useRef<HTMLDivElement | null>(null);
  const instance_ref = useRef<ReactFlowInstance<WeftNode, WeftEdge> | null>(null);
  const has_auto_fit_ref = useRef(false);
  const [nodes, set_nodes] = useState<WeftNode[]>([]);
  const [edges, set_edges] = useState<WeftEdge[]>([]);
  const [is_panning, set_is_panning] = useState(false);

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
    const { nodes: raw_nodes, edges: raw_edges } = tree_to_graph(tree);
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
  }, [tree, layout_options, debounced_layout]);

  // After each layout settles, if the user did not pre-supply an
  // initial_viewport, fit the tree once so it lands centered. Subsequent
  // re-layouts of the same tree leave the viewport alone so user pan/zoom
  // sticks. New trees reset the guard via the effect above.
  //
  // The fit must wait for React Flow to mount and measure every node — its
  // bounds calculation reads `node.measured.{width,height}` and returns a
  // clipped result if measurement hasn't happened yet. Two `rAF` ticks is
  // empirically enough to clear both the React commit and the React Flow
  // internal measurement pass; one tick raced the layout commit at start.
  useEffect(() => {
    if (nodes.length === 0) return;
    if (has_auto_fit_ref.current) return;
    if (initial_viewport !== undefined) {
      has_auto_fit_ref.current = true;
      return;
    }
    const instance = instance_ref.current;
    if (instance === null) return;
    has_auto_fit_ref.current = true;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        void instance.fitView({ duration: 250, padding: 0.08, minZoom: 0.1 });
      });
    });
  }, [nodes, initial_viewport]);

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
    (_event: unknown, rf_node: { id: string; data: { id: string } }) => {
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
        <Background variant={BackgroundVariant.Dots} gap={18} size={1.2} />
        <Controls showInteractive={false} />
        {show_minimap ? <MiniMap pannable zoomable maskColor="rgba(15, 17, 21, 0.7)" /> : null}
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
