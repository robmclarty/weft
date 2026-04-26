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
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
} from 'react';

import {
  WeftCanvas,
  tree_id as compute_tree_id,
  type CanvasApi,
  type FlowNode,
  type FlowTree,
} from '@repo/weft';

import { apply_collapse } from '../state/collapse.js';
import { use_canvas_persistence } from '../state/use_canvas_persistence.js';
import { InspectorPanel } from './InspectorPanel.js';
import { ShortcutsModal } from './ShortcutsModal.js';

export type CanvasShellProps = {
  readonly tree: FlowTree | null;
  readonly empty_message?: string;
  readonly search_input_id?: string;
  readonly side_top?: JSX.Element | undefined;
  readonly banners?: JSX.Element | undefined;
};

export function CanvasShell({
  tree,
  empty_message,
  search_input_id,
  side_top,
  banners,
}: CanvasShellProps): JSX.Element {
  const tid = useMemo(
    () => (tree === null ? null : compute_tree_id(tree.root)),
    [tree],
  );
  const { state, set_state } = use_canvas_persistence(tid);
  const [selected, set_selected] = useState<FlowNode | null>(null);
  const [shortcuts_open, set_shortcuts_open] = useState(false);
  const canvas_api_ref = useRef<CanvasApi | null>(null);

  useEffect(() => {
    set_selected(null);
  }, [tid]);

  const projected_tree = useMemo(() => {
    if (tree === null) return null;
    return apply_collapse(tree, state.collapsed_node_ids);
  }, [tree, state.collapsed_node_ids]);

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

  useEffect(() => {
    function handler(event: KeyboardEvent): void {
      const target = event.target;
      const tag =
        target instanceof HTMLElement ? target.tagName.toLowerCase() : '';
      const editing =
        tag === 'input' || tag === 'textarea' || tag === 'select';
      if (event.key === 'Escape') {
        if (shortcuts_open) {
          set_shortcuts_open(false);
          event.preventDefault();
          return;
        }
        if (selected !== null) {
          set_selected(null);
          event.preventDefault();
        }
        return;
      }
      if (editing) return;
      if (event.key === '?') {
        set_shortcuts_open((prev) => !prev);
        event.preventDefault();
        return;
      }
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
  }, [selected, shortcuts_open, search_input_id]);

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
        {banners}
        {projected_tree === null ? (
          <div className="weft-empty">
            {empty_message ?? 'load a flow_tree to get started.'}
          </div>
        ) : (
          <WeftCanvas
            tree={projected_tree}
            on_node_click={handle_node_click}
            on_ready={handle_ready}
            initial_viewport={{
              x: state.viewport.x,
              y: state.viewport.y,
              zoom: state.zoom,
            }}
          />
        )}
      </div>
      <aside className="weft-side" aria-label="side panel">
        {side_top}
        <InspectorPanel selected={selected} />
        <PngExportButton api_ref={canvas_api_ref} />
      </aside>
      <ShortcutsModal
        open={shortcuts_open}
        on_close={() => {
          set_shortcuts_open(false);
        }}
      />
    </>
  );
}

function strip_path(graph_id: string): string {
  const idx = graph_id.lastIndexOf('/');
  return idx === -1 ? graph_id : graph_id.slice(idx + 1);
}

type PngExportButtonProps = {
  readonly api_ref: { current: CanvasApi | null };
};

function PngExportButton({ api_ref }: PngExportButtonProps): JSX.Element {
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
        disabled={busy}
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
