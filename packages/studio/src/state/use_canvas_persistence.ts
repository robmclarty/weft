/**
 * React hook: per-tree canvas state stored in localStorage.
 *
 * Per spec §3 §5.4. Loads the persisted state on mount or when `tree_id`
 * changes, exposes a setter that writes through to localStorage with
 * try/catch + LRU eviction (see `canvas_persistence.ts`). Failure to
 * persist never crashes the canvas — it is logged via `console.warn`
 * and the in-memory state continues to advance.
 */

import { useCallback, useEffect, useState } from 'react';

import {
  persist_state,
  read_state,
  type CanvasState,
} from './canvas_persistence.js';

const DEFAULT_STATE: CanvasState = {
  zoom: 1,
  viewport: { x: 0, y: 0 },
  selected_node_ids: [],
  collapsed_node_ids: [],
};

export type UseCanvasPersistenceResult = {
  readonly state: CanvasState;
  readonly set_state: (next: CanvasState) => void;
  readonly reset: () => void;
};

export function use_canvas_persistence(
  tree_id: string | null,
): UseCanvasPersistenceResult {
  const storage = typeof window === 'undefined' ? null : window.localStorage;
  const [state, set_internal] = useState<CanvasState>(() => {
    if (tree_id === null || storage === null) return DEFAULT_STATE;
    return read_state(storage, tree_id) ?? DEFAULT_STATE;
  });

  useEffect(() => {
    if (tree_id === null || storage === null) {
      set_internal(DEFAULT_STATE);
      return;
    }
    set_internal(read_state(storage, tree_id) ?? DEFAULT_STATE);
  }, [tree_id, storage]);

  const set_state = useCallback(
    (next: CanvasState) => {
      set_internal(next);
      if (tree_id === null || storage === null) return;
      const result = persist_state(storage, tree_id, next);
      if (!result.ok) {
        console.warn(`[weft] canvas state persist failed: ${result.reason}`);
      }
    },
    [tree_id, storage],
  );

  const reset = useCallback(() => {
    set_state(DEFAULT_STATE);
  }, [set_state]);

  return { state, set_state, reset };
}
