import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import {
  use_canvas_persistence,
} from '../use_canvas_persistence.js';
import {
  read_state,
  state_key,
  type CanvasState,
} from '../canvas_persistence.js';

let mounted_root: Root | null = null;
let host: HTMLDivElement | null = null;

function harness<T extends Record<string, unknown>>(
  use_hook: (props: T) => unknown,
  initial: T,
): { read: () => unknown; rerender: (next: T) => void } {
  let captured: unknown;
  const Probe = (props: { args: T }): null => {
    captured = use_hook(props.args);
    return null;
  };
  host = document.createElement('div');
  document.body.append(host);
  mounted_root = createRoot(host);
  act(() => {
    mounted_root!.render(<Probe args={initial} />);
  });
  return {
    read: () => captured,
    rerender: (next) => {
      act(() => {
        mounted_root!.render(<Probe args={next} />);
      });
    },
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  if (mounted_root !== null) {
    act(() => {
      mounted_root!.unmount();
    });
    mounted_root = null;
  }
  if (host !== null) {
    host.remove();
    host = null;
  }
  window.localStorage.clear();
});

describe('use_canvas_persistence', () => {
  it('returns default state when tree_id is null', () => {
    const h = harness(
      ({ tree_id }: { tree_id: string | null }) => use_canvas_persistence(tree_id),
      { tree_id: null },
    );
    const result = h.read() as { state: CanvasState };
    expect(result.state.zoom).toBe(1);
    expect(result.state.viewport).toEqual({ x: 0, y: 0 });
  });

  it('persists state across remounts under the per-tree key', () => {
    const h = harness(
      ({ tree_id }: { tree_id: string | null }) => use_canvas_persistence(tree_id),
      { tree_id: 'tree-a' },
    );
    const before = h.read() as {
      state: CanvasState;
      set_state: (next: CanvasState) => void;
    };
    act(() => {
      before.set_state({
        zoom: 2.5,
        viewport: { x: 10, y: 20 },
        selected_node_ids: ['n:1'],
        collapsed_node_ids: ['n:2'],
      });
    });
    const persisted = read_state(window.localStorage, 'tree-a');
    expect(persisted?.zoom).toBe(2.5);
    expect(persisted?.selected_node_ids).toEqual(['n:1']);
    expect(persisted?.collapsed_node_ids).toEqual(['n:2']);
  });

  it('two trees do not share state (AC 15)', () => {
    const h = harness(
      ({ tree_id }: { tree_id: string | null }) => use_canvas_persistence(tree_id),
      { tree_id: 'tree-a' },
    );
    const a = h.read() as {
      state: CanvasState;
      set_state: (next: CanvasState) => void;
    };
    act(() => {
      a.set_state({
        zoom: 7,
        viewport: { x: 100, y: 200 },
        selected_node_ids: [],
        collapsed_node_ids: [],
      });
    });
    h.rerender({ tree_id: 'tree-b' });
    const b = h.read() as { state: CanvasState };
    expect(b.state.zoom).toBe(1);
    expect(b.state.viewport).toEqual({ x: 0, y: 0 });
    h.rerender({ tree_id: 'tree-a' });
    const a_again = h.read() as { state: CanvasState };
    expect(a_again.state.zoom).toBe(7);
    expect(a_again.state.viewport).toEqual({ x: 100, y: 200 });
    expect(window.localStorage.getItem(state_key('tree-a'))).not.toBeNull();
  });
});
