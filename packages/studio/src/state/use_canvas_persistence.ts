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
  readonly hydrated: boolean;
  readonly set_state: (next: CanvasState) => void;
  readonly reset: () => void;
};

export function use_canvas_persistence(
  tree_id: string | null,
): UseCanvasPersistenceResult {
  const storage = typeof window === 'undefined' ? null : window.localStorage;
  const [state, set_internal] = useState<CanvasState>(() => {
    if (tree_id === null || storage === null) return DEFAULT_STATE;
    return (read_state(storage, tree_id) ?? DEFAULT_STATE);
  });
  const [hydrated, set_hydrated] = useState<boolean>(() => {
    if (tree_id === null || storage === null) return false;
    return read_state(storage, tree_id) !== null;
  });

  useEffect(() => {
    if (tree_id === null || storage === null) {
      set_internal(DEFAULT_STATE);
      set_hydrated(false);
      return;
    }
    const stored = read_state(storage, tree_id);
    set_internal(stored ?? DEFAULT_STATE);
    set_hydrated(stored !== null);
    // Touch the LRU index on mount so loading a tree counts as the same
    // kind of access as clicking a node. Without this, a user who loads a
    // tree but never clicks would never appear in the cap accounting and
    // would never be subject to eviction. Writes the existing state when
    // present so live data is not regressed; writes the default state for
    // a never-seen tree so an index entry exists.
    const touched = persist_state(storage, tree_id, stored ?? DEFAULT_STATE);
    if (!touched.ok) {
      console.warn(`[weft] canvas state touch failed: ${touched.reason}`);
    }
  }, [tree_id, storage]);

  const set_state = useCallback(
    (next: CanvasState) => {
      set_internal(next);
      set_hydrated(true);
      if (tree_id === null || storage === null) return;
      const result = persist_state(storage, tree_id, next);
      if (!result.ok) {
        console.warn(`[weft] canvas state persist failed: ${result.reason}`);
      }
    },
    [tree_id, storage],
  );

  const reset = useCallback(() => {
    set_internal(DEFAULT_STATE);
    set_hydrated(false);
  }, []);

  return { state, hydrated, set_state, reset };
}
