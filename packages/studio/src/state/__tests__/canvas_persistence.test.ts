import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  INDEX_CAP,
  INDEX_KEY,
  persist_state,
  read_index,
  read_state,
  state_key,
  STATE_KEY_PREFIX,
  touch_index,
  type CanvasState,
  type IndexEntry,
} from '../canvas_persistence.js';

function make_state(zoom: number): CanvasState {
  return {
    zoom,
    viewport: { x: 0, y: 0 },
    selected_node_ids: [],
    collapsed_node_ids: [],
  };
}

function make_storage(): Storage {
  const map = new Map<string, string>();
  return {
    get length(): number {
      return map.size;
    },
    clear: () => {
      map.clear();
    },
    getItem: (k: string): string | null => map.get(k) ?? null,
    setItem: (k: string, v: string): void => {
      map.set(k, v);
    },
    removeItem: (k: string): void => {
      map.delete(k);
    },
    key: (i: number): string | null => Array.from(map.keys())[i] ?? null,
  } satisfies Storage;
}

describe('state_key', () => {
  it('builds a prefixed key', () => {
    expect(state_key('abc')).toBe(`${STATE_KEY_PREFIX}abc`);
  });
});

describe('touch_index', () => {
  it('appends a new entry to the end', () => {
    const next = touch_index([], 'tree-a', 100);
    expect(next).toEqual([{ tree_id: 'tree-a', last_access: 100 }]);
  });

  it('moves an existing entry to the end with the new ts', () => {
    const seed: IndexEntry[] = [
      { tree_id: 'tree-a', last_access: 100 },
      { tree_id: 'tree-b', last_access: 200 },
    ];
    const next = touch_index(seed, 'tree-a', 300);
    expect(next).toHaveLength(2);
    expect(next.at(-1)).toEqual({ tree_id: 'tree-a', last_access: 300 });
  });
});

describe('read_index', () => {
  it('returns [] when the index is missing', () => {
    expect(read_index(make_storage())).toEqual([]);
  });

  it('returns [] when the index is malformed', () => {
    const s = make_storage();
    s.setItem(INDEX_KEY, 'not json');
    expect(read_index(s)).toEqual([]);
  });

  it('filters out non-conforming entries', () => {
    const s = make_storage();
    s.setItem(
      INDEX_KEY,
      JSON.stringify([
        { tree_id: 'a', last_access: 1 },
        { tree_id: 42, last_access: 2 },
        { tree_id: 'b', last_access: 'oops' },
        { tree_id: 'c', last_access: 3 },
      ]),
    );
    const idx = read_index(s);
    expect(idx).toHaveLength(2);
    expect(idx[0]?.tree_id).toBe('a');
    expect(idx[1]?.tree_id).toBe('c');
  });
});

describe('read_state', () => {
  it('returns the parsed CanvasState when present', () => {
    const s = make_storage();
    s.setItem(state_key('tid'), JSON.stringify(make_state(2)));
    const out = read_state(s, 'tid');
    expect(out?.zoom).toBe(2);
  });

  it('returns null when missing', () => {
    expect(read_state(make_storage(), 'tid')).toBeNull();
  });

  it('returns null when malformed JSON', () => {
    const s = make_storage();
    s.setItem(state_key('tid'), 'oops');
    expect(read_state(s, 'tid')).toBeNull();
  });

  it('returns null when not a CanvasState shape', () => {
    const s = make_storage();
    s.setItem(state_key('tid'), JSON.stringify({ zoom: 'oops' }));
    expect(read_state(s, 'tid')).toBeNull();
  });
});

describe('persist_state', () => {
  let now_value = 0;
  const now = (): number => {
    now_value += 1;
    return now_value;
  };

  beforeEach(() => {
    now_value = 0;
  });

  it('writes state and updates the index', () => {
    const s = make_storage();
    const r = persist_state(s, 'tid', make_state(1.5), now);
    expect(r.ok).toBe(true);
    expect(read_state(s, 'tid')?.zoom).toBe(1.5);
    expect(read_index(s)).toHaveLength(1);
  });

  it('caps the index at INDEX_CAP and evicts the oldest', () => {
    const s = make_storage();
    for (let i = 0; i < INDEX_CAP + 5; i += 1) {
      const r = persist_state(s, `tid-${String(i)}`, make_state(1), now);
      expect(r.ok).toBe(true);
    }
    const idx = read_index(s);
    expect(idx.length).toBeLessThanOrEqual(INDEX_CAP);
  });

  it('two trees keep separate state', () => {
    const s = make_storage();
    persist_state(s, 'tree-a', make_state(1), now);
    persist_state(s, 'tree-b', make_state(7), now);
    expect(read_state(s, 'tree-a')?.zoom).toBe(1);
    expect(read_state(s, 'tree-b')?.zoom).toBe(7);
  });

  it('recovers from QuotaExceededError by evicting older entries', () => {
    const inner = make_storage();
    // Pre-populate the index so eviction has something to drop.
    persist_state(inner, 'old-tree-1', make_state(1), now);
    persist_state(inner, 'old-tree-2', make_state(1), now);
    // Now build a flaky proxy that throws QuotaExceeded once, then succeeds.
    let post_calls = 0;
    const flaky: Storage = {
      get length(): number {
        return inner.length;
      },
      clear: () => {
        inner.clear();
      },
      getItem: (k: string) => inner.getItem(k),
      setItem: (k: string, v: string): void => {
        post_calls += 1;
        if (post_calls === 1) {
          const err: Error & { name: string } = Object.assign(
            new Error('quota'),
            { name: 'QuotaExceededError' },
          );
          throw err;
        }
        inner.setItem(k, v);
      },
      removeItem: (k: string): void => {
        inner.removeItem(k);
      },
      key: (i: number) => inner.key(i),
    };
    const r = persist_state(flaky, 'new-tree', make_state(2), now);
    expect(r.ok).toBe(true);
    expect(read_state(inner, 'new-tree')?.zoom).toBe(2);
  });

  it('returns ok:false with reason quota when retries cannot evict enough', () => {
    const inner = make_storage();
    const always_quota: Storage = {
      get length(): number {
        return inner.length;
      },
      clear: () => {
        inner.clear();
      },
      getItem: (k: string) => inner.getItem(k),
      setItem: (_k: string, _v: string): void => {
        const err: Error & { name: string } = Object.assign(
          new Error('quota'),
          { name: 'QuotaExceededError' },
        );
        throw err;
      },
      removeItem: (k: string): void => {
        inner.removeItem(k);
      },
      key: (i: number) => inner.key(i),
    };
    const r = persist_state(always_quota, 'tid', make_state(1), now);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('quota');
  });

  it('returns ok:false with reason unknown for unexpected errors', () => {
    const inner = make_storage();
    const always_throw: Storage = {
      get length(): number {
        return inner.length;
      },
      clear: () => {
        inner.clear();
      },
      getItem: (k: string) => inner.getItem(k),
      setItem: (): void => {
        throw new Error('disk on fire');
      },
      removeItem: (k: string): void => {
        inner.removeItem(k);
      },
      key: (i: number) => inner.key(i),
    };
    const r = persist_state(always_throw, 'tid', make_state(1), now);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('unknown');
  });
});

describe('LRU eviction across many trees (AC 13)', () => {
  it('writes 60 trees and asserts the index never exceeds 50 entries', () => {
    const s = make_storage();
    let ts = 0;
    const now = (): number => {
      ts += 1;
      return ts;
    };
    for (let i = 0; i < 60; i += 1) {
      persist_state(s, `tid-${String(i)}`, make_state(1), now);
    }
    const idx = read_index(s);
    expect(idx.length).toBeLessThanOrEqual(INDEX_CAP);
    // The most recent should be at the end.
    expect(idx.at(-1)?.tree_id).toBe('tid-59');
    // The oldest should have been evicted.
    expect(idx.find((e) => e.tree_id === 'tid-0')).toBeUndefined();
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
