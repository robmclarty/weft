/**
 * CanvasShell — the primary studio surface that hosts WeftCanvas plus
 * the per-tree state, inspector, shortcut handling, and PNG export.
 *
 * The studio's view of the world:
 *   - `tree`: the most recently validated FlowTree the user wants to see.
 *     Validation failures never replace it (constraints §5.3).
 *   - `selected`: the currently inspected FlowNode (or null).
 *   - persisted state, keyed by `tree_id` per spec §3.
 *
 * Collapse is applied as a tree projection (see `state/collapse.ts`) and
 * passed to WeftCanvas. Double-click on a container toggles collapse.
 *
 * Search is handled via the `search` event channel: the header dispatches
 * the query, this component computes matches, tags React Flow node DOM,
 * and reports the count back for header display.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type ReactNode,
} from 'react';

import {
  WeftCanvas,
  derive_runtime_state,
  tree_id as compute_tree_id,
  type CanvasApi,
  type FlowNode,
  type FlowTree,
  type NodeRuntimeState,
  type ParsedTrajectoryEvent,
} from '@repo/weft';

import { apply_collapse } from '../state/collapse.js';
import { use_canvas_persistence } from '../state/use_canvas_persistence.js';
import {
  dispatch_search_result,
  matches_query,
  on_search_query,
} from '../state/search.js';
import { InspectorPanel } from './InspectorPanel.js';

export type CanvasShellProps = {
  readonly tree: FlowTree | null;
  readonly empty_message?: ReactNode;
  readonly search_input_id?: string;
  readonly side_top?: ReactNode | undefined;
  readonly banners?: ReactNode | undefined;
  readonly events?: ReadonlyArray<ParsedTrajectoryEvent>;
};

export function CanvasShell({
  tree,
  empty_message,
  search_input_id,
  side_top,
  banners,
  events,
}: CanvasShellProps): JSX.Element {
  const tid = useMemo(
    () => (tree === null ? null : compute_tree_id(tree.root)),
    [tree],
  );
  const { state, hydrated, set_state } = use_canvas_persistence(tid);
  const [selected, set_selected] = useState<FlowNode | null>(null);
  const canvas_api_ref = useRef<CanvasApi | null>(null);

  useEffect(() => {
    set_selected(null);
  }, [tid]);

  const projected_tree = useMemo(() => {
    if (tree === null) return null;
    return apply_collapse(tree, state.collapsed_node_ids);
  }, [tree, state.collapsed_node_ids]);

  const runtime_state = useMemo<ReadonlyMap<string, NodeRuntimeState> | undefined>(() => {
    if (events === undefined || events.length === 0) return undefined;
    return derive_runtime_state(events, tree);
  }, [events, tree]);

  const handle_node_click = useCallback(
    (node: FlowNode) => {
      set_selected(node);
      set_state({
        ...state,
        selected_node_ids: [node.id],
      });
    },
    [state, set_state],
  );

  const handle_node_double_click = useCallback(
    (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const node_el = target.closest('[data-weft-kind]');
      if (node_el === null) return;
      const id_el = node_el.closest('.react-flow__node');
      if (id_el === null) return;
      const graph_id = id_el.getAttribute('data-id');
      if (graph_id === null) return;
      const local_id = strip_path(graph_id);
      const next = state.collapsed_node_ids.includes(local_id)
        ? state.collapsed_node_ids.filter((c) => c !== local_id)
        : [...state.collapsed_node_ids, local_id];
      set_state({ ...state, collapsed_node_ids: next });
    },
    [state, set_state],
  );

  const handle_ready = useCallback((api: CanvasApi) => {
    canvas_api_ref.current = api;
  }, []);

  const handle_pane_click = useCallback(() => {
    set_selected(null);
  }, []);

  // Search wiring: subscribe to query events, walk the live React Flow node
  // DOM, tag matches, and surface the count for the header. Re-applied
  // whenever a new tree loads (via tid), since previous matches are stale.
  useEffect(() => {
    function recompute(query: string): void {
      const trimmed = query.trim();
      if (typeof document === 'undefined') return;
      const node_els = document.querySelectorAll<HTMLElement>(
        '.react-flow__node',
      );
      if (trimmed.length === 0) {
        for (const el of node_els) el.classList.remove('weft-search-match');
        dispatch_search_result(null);
        return;
      }
      let count = 0;
      for (const el of node_els) {
        const inner = el.querySelector('[data-weft-kind]');
        const kind = inner?.getAttribute('data-weft-kind') ?? '';
        const graph_id = el.getAttribute('data-id') ?? '';
        const id = strip_path(graph_id);
        const hit = matches_query(trimmed, { kind, id });
        el.classList.toggle('weft-search-match', hit);
        if (hit) count += 1;
      }
      dispatch_search_result(count);
    }
    const off = on_search_query(recompute);
    // Also re-run on tree change so a stale highlight from a previous tree
    // does not linger after load.
    recompute('');
    return () => {
      off();
    };
  }, [tid]);

  useEffect(() => {
    function handler(event: KeyboardEvent): void {
      const target = event.target;
      const tag =
        target instanceof HTMLElement ? target.tagName.toLowerCase() : '';
      const editing =
        tag === 'input' || tag === 'textarea' || tag === 'select';
      if (event.key === 'Escape') {
        if (selected !== null) {
          set_selected(null);
          event.preventDefault();
        }
        return;
      }
      if (editing) return;
      if (event.key === 'f' || event.key === 'F') {
        canvas_api_ref.current?.fit_view();
        event.preventDefault();
        return;
      }
      if (event.key === '/') {
        if (search_input_id !== undefined) {
          const el = document.getElementById(search_input_id);
          if (el instanceof HTMLInputElement) {
            el.focus();
            event.preventDefault();
          }
        }
      }
    }
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
    };
  }, [selected, search_input_id]);

  return (
    <>
      <div
        className="weft-canvas-region"
        onClick={(event) => {
          if (event.target === event.currentTarget) handle_pane_click();
        }}
        onDoubleClickCapture={(event) => {
          handle_node_double_click(event.nativeEvent);
        }}
      >
        {banners !== undefined ? (
          <div className="weft-banner-layer">{banners}</div>
        ) : null}
        {projected_tree === null ? (
          <div className="weft-empty">
            {empty_message ?? 'load a flow_tree to get started.'}
          </div>
        ) : (
          <WeftCanvas
            tree={projected_tree}
            on_node_click={handle_node_click}
            on_ready={handle_ready}
            {...(runtime_state !== undefined ? { runtime_state } : {})}
            {...(hydrated && is_meaningful_viewport(state)
              ? {
                  initial_viewport: {
                    x: state.viewport.x,
                    y: state.viewport.y,
                    zoom: state.zoom,
                  },
                }
              : {})}
          />
        )}
      </div>
      <aside className="weft-side" aria-label="side panel">
        {side_top}
        <InspectorPanel selected={selected} />
        <PngExportButton api_ref={canvas_api_ref} disabled={projected_tree === null} />
      </aside>
    </>
  );
}

function strip_path(graph_id: string): string {
  const idx = graph_id.lastIndexOf('/');
  return idx === -1 ? graph_id : graph_id.slice(idx + 1);
}

/**
 * Persistence "hydrates" with the default viewport {zoom:1,x:0,y:0} the first
 * time a tree is touched (the LRU-touch path stores the default to register
 * the entry). That is *not* a viewport the user pinned — restoring it would
 * skip the auto-fit and bury the graph at zoom 1.0 with no pan. Treat the
 * default as "no preference" and let the canvas auto-fit instead.
 */
function is_meaningful_viewport(state: {
  zoom: number;
  viewport: { x: number; y: number };
}): boolean {
  if (state.zoom !== 1) return true;
  if (state.viewport.x !== 0) return true;
  if (state.viewport.y !== 0) return true;
  return false;
}

type PngExportButtonProps = {
  readonly api_ref: { current: CanvasApi | null };
  readonly disabled: boolean;
};

function PngExportButton({ api_ref, disabled }: PngExportButtonProps): JSX.Element {
  const [busy, set_busy] = useState(false);
  const [err, set_err] = useState<string | null>(null);

  const handle_click = useCallback(async () => {
    const api = api_ref.current;
    if (api === null) {
      set_err('canvas is not ready');
      return;
    }
    set_busy(true);
    set_err(null);
    try {
      const blob = await api.export_png();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'weft-canvas.png';
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      set_err(message);
    } finally {
      set_busy(false);
    }
  }, [api_ref]);

  return (
    <section className="weft-panel" aria-label="Export">
      <h2>export</h2>
      <button
        type="button"
        onClick={() => {
          void handle_click();
        }}
        disabled={busy || disabled}
        data-weft-png-export="true"
      >
        {busy ? 'exporting…' : 'download PNG'}
      </button>
      {err !== null ? (
        <div className="weft-error-text" style={{ marginTop: 6 }}>
          {err}
        </div>
      ) : null}
    </section>
  );
}
