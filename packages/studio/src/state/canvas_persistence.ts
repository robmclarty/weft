/**
 * Per-tree canvas-state persistence (localStorage).
 *
 * Per spec §3 and §5.4:
 *   - Key: `weft.canvas.<tree_id>`, where `tree_id` is the FNV-1a hash from
 *     `@repo/weft`'s `tree_id`.
 *   - Index: `weft.canvas.index` carries `{ tree_id, last_access }[]`,
 *     capped at 50 entries; oldest is evicted on overflow.
 *   - Every `setItem` is wrapped in try/catch. On `QuotaExceededError`,
 *     evict aggressively from the index and retry; failure to persist
 *     never crashes the canvas (spec §8 F10).
 *
 * The persisted shape matches spec §3 `canvas_state`.
 *
 * Side effects (localStorage reads + writes) are performed by the small
 * helpers below. Higher layers (React hook in `use_canvas_persistence.ts`)
 * compose them. Constraints §5.4 forbids module-global canvas state — the
 * functions in this file take the `Storage` instance as an argument.
 */

export type CanvasViewport = {
  readonly x: number;
  readonly y: number;
};

export type CanvasState = {
  readonly zoom: number;
  readonly viewport: CanvasViewport;
  readonly selected_node_ids: ReadonlyArray<string>;
  readonly collapsed_node_ids: ReadonlyArray<string>;
};

export type IndexEntry = {
  readonly tree_id: string;
  readonly last_access: number;
};

export const STATE_KEY_PREFIX = 'weft.canvas.';
export const INDEX_KEY = 'weft.canvas.index';
export const INDEX_CAP = 50;

export function state_key(tree_id: string): string {
  return `${STATE_KEY_PREFIX}${tree_id}`;
}

export function read_state(storage: Storage, tree_id: string): CanvasState | null {
  const raw = storage.getItem(state_key(tree_id));
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!is_canvas_state(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function read_field(value: object, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(value, key)
    ? Reflect.get(value, key)
    : undefined;
}

export function read_index(storage: Storage): ReadonlyArray<IndexEntry> {
  const raw = storage.getItem(INDEX_KEY);
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: IndexEntry[] = [];
    for (const entry of parsed) {
      if (typeof entry !== 'object' || entry === null) continue;
      const tree_id_value = read_field(entry, 'tree_id');
      const last_access_value = read_field(entry, 'last_access');
      if (
        typeof tree_id_value === 'string' &&
        typeof last_access_value === 'number'
      ) {
        out.push({
          tree_id: tree_id_value,
          last_access: last_access_value,
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}

export type PersistOk = { readonly ok: true };
export type PersistErr = { readonly ok: false; readonly reason: 'quota' | 'unknown' };
export type PersistResult = PersistOk | PersistErr;

export type Now = () => number;

export function persist_state(
  storage: Storage,
  tree_id: string,
  state: CanvasState,
  now: Now = () => Date.now(),
): PersistResult {
  const next_index = touch_index(read_index(storage), tree_id, now());
  const trimmed = next_index.slice(-INDEX_CAP);
  const initial_excess = next_index.length - trimmed.length;
  const result = try_write_state_and_index(storage, tree_id, state, trimmed);
  if (result.ok) return result;
  if (result.reason !== 'quota') return result;
  return retry_after_evicting(storage, tree_id, state, trimmed, initial_excess);
}

function retry_after_evicting(
  storage: Storage,
  tree_id: string,
  state: CanvasState,
  initial_index: ReadonlyArray<IndexEntry>,
  already_evicted: number,
): PersistResult {
  let evict_count = Math.max(1, already_evicted + 1);
  let attempts = 0;
  while (attempts < 8) {
    const drop = initial_index.slice(0, evict_count);
    for (const entry of drop) {
      try {
        storage.removeItem(state_key(entry.tree_id));
      } catch {
        // ignore — best-effort eviction
      }
    }
    const remaining = initial_index.slice(evict_count);
    const result = try_write_state_and_index(storage, tree_id, state, remaining);
    if (result.ok) return result;
    if (result.reason !== 'quota') return result;
    evict_count = Math.min(initial_index.length, evict_count * 2 + 1);
    if (evict_count >= initial_index.length) {
      // give up; clear index and the target entry was already removed
      try {
        storage.removeItem(INDEX_KEY);
      } catch {
        // ignore
      }
      return { ok: false, reason: 'quota' };
    }
    attempts += 1;
  }
  return { ok: false, reason: 'quota' };
}

function try_write_state_and_index(
  storage: Storage,
  tree_id: string,
  state: CanvasState,
  index: ReadonlyArray<IndexEntry>,
): PersistResult {
  try {
    storage.setItem(state_key(tree_id), JSON.stringify(state));
  } catch (err) {
    return classify_storage_error(err);
  }
  try {
    storage.setItem(INDEX_KEY, JSON.stringify(index));
  } catch (err) {
    return classify_storage_error(err);
  }
  return { ok: true };
}

export function touch_index(
  current: ReadonlyArray<IndexEntry>,
  tree_id: string,
  ts: number,
): ReadonlyArray<IndexEntry> {
  // Order is "first = oldest, last = most recent". Touching pulls the
  // existing entry out and appends a fresh one at the end so the oldest
  // remains at index 0 for eviction. ts is provided by the caller (Date.now)
  // and assumed monotonic across calls within a session.
  const without = current.filter((entry) => entry.tree_id !== tree_id);
  return [...without, { tree_id, last_access: ts }];
}

function classify_storage_error(err: unknown): PersistErr {
  if (is_quota_error(err)) return { ok: false, reason: 'quota' };
  return { ok: false, reason: 'unknown' };
}

function is_quota_error(err: unknown): boolean {
  if (err instanceof Error) {
    if (err.name === 'QuotaExceededError') return true;
    if (err.name === 'NS_ERROR_DOM_QUOTA_REACHED') return true;
  }
  if (typeof err === 'object' && err !== null) {
    const name = read_field(err, 'name');
    if (name === 'QuotaExceededError') return true;
    const code = read_field(err, 'code');
    if (typeof code === 'number' && (code === 22 || code === 1014)) {
      return true;
    }
  }
  return false;
}

function is_canvas_state(value: unknown): value is CanvasState {
  if (typeof value !== 'object' || value === null) return false;
  const zoom = read_field(value, 'zoom');
  if (typeof zoom !== 'number') return false;
  const viewport = read_field(value, 'viewport');
  if (typeof viewport !== 'object' || viewport === null) return false;
  const x = read_field(viewport, 'x');
  const y = read_field(viewport, 'y');
  if (typeof x !== 'number' || typeof y !== 'number') return false;
  const selected_ids = read_field(value, 'selected_node_ids');
  if (!Array.isArray(selected_ids)) return false;
  if (!selected_ids.every((s) => typeof s === 'string')) return false;
  const collapsed_ids = read_field(value, 'collapsed_node_ids');
  if (!Array.isArray(collapsed_ids)) return false;
  if (!collapsed_ids.every((s) => typeof s === 'string')) return false;
  return true;
}
