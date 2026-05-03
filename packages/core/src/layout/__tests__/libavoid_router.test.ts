import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WeftEdge, WeftNode } from '../../transform/tree_to_graph.js';
import {
  apply_libavoid_routes,
  reset_libavoid_for_tests,
} from '../libavoid_router.js';

beforeEach(() => {
  reset_libavoid_for_tests();
});

describe('apply_libavoid_routes', () => {
  it('writes waypoints onto matching edges and leaves others untouched', () => {
    const edges: WeftEdge[] = [
      {
        id: 'e1',
        source: 'a',
        target: 'b',
        data: { kind: 'structural' },
      },
      {
        id: 'e2',
        source: 'a',
        target: 'c',
        data: { kind: 'structural' },
      },
    ];
    const routes = new Map([
      ['e1', [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]],
    ]);
    const out = apply_libavoid_routes(edges, routes);
    expect(out[0]?.data?.waypoints?.length).toBe(3);
    expect(out[1]?.data?.waypoints).toBeUndefined();
  });

  it('preserves a missing data object as a fresh structural edge', () => {
    const edges: WeftEdge[] = [{ id: 'e', source: 'a', target: 'b' }];
    const routes = new Map([['e', [{ x: 1, y: 2 }, { x: 3, y: 4 }]]]);
    const out = apply_libavoid_routes(edges, routes);
    expect(out[0]?.data?.kind).toBe('structural');
    expect(out[0]?.data?.waypoints?.length).toBe(2);
  });
});

describe('route_with_libavoid', () => {
  it('returns null and warns once when libavoid-js fails to load', async () => {
    vi.resetModules();
    vi.doMock('libavoid-js', () => {
      throw new Error('simulated load failure');
    });
    const warn_spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const { reset_libavoid_for_tests: reset, route_with_libavoid: route } =
      await import('../libavoid_router.js');
    reset();

    const nodes: WeftNode[] = [
      { id: 'a', position: { x: 0, y: 0 }, width: 100, height: 40, data: { kind: 'step', id: 'a' } },
      { id: 'b', position: { x: 200, y: 0 }, width: 100, height: 40, data: { kind: 'step', id: 'b' } },
    ];
    const edges: WeftEdge[] = [
      { id: 'e', source: 'a', target: 'b', data: { kind: 'structural' } },
    ];
    const result = await route(nodes, edges);
    expect(result).toBeNull();
    expect(warn_spy).toHaveBeenCalledTimes(1);
    expect(warn_spy.mock.calls[0]?.[0]).toContain('libavoid-js unavailable');

    // Second call must not re-warn (load_attempted latch).
    const second = await route(nodes, edges);
    expect(second).toBeNull();
    expect(warn_spy).toHaveBeenCalledTimes(1);

    warn_spy.mockRestore();
    vi.doUnmock('libavoid-js');
    vi.resetModules();
  });

  it('returns null when the imported module lacks an AvoidLib export', async () => {
    vi.resetModules();
    vi.doMock('libavoid-js', () => ({}));
    const { reset_libavoid_for_tests: reset, route_with_libavoid: route } =
      await import('../libavoid_router.js');
    reset();
    const result = await route([], []);
    expect(result).toBeNull();
    vi.doUnmock('libavoid-js');
    vi.resetModules();
  });

  it('returns null when AvoidLib is the wrong shape', async () => {
    vi.resetModules();
    vi.doMock('libavoid-js', () => ({ AvoidLib: { not_a_function: 'oops' } }));
    const { reset_libavoid_for_tests: reset, route_with_libavoid: route } =
      await import('../libavoid_router.js');
    reset();
    const result = await route([], []);
    expect(result).toBeNull();
    vi.doUnmock('libavoid-js');
    vi.resetModules();
  });

  it('threads node positions through the mocked router and emits waypoints in absolute space', async () => {
    type FakePoint = { x: number; y: number };
    type FakeRectangle = { centre: FakePoint; w: number; h: number };
    type FakeShape = { id: number; rect: FakeRectangle };
    type FakeConn = { id: number; src: FakePoint; dst: FakePoint };

    let next_id = 0;
    const shapes: FakeShape[] = [];
    const conns: FakeConn[] = [];

    const fake_avoid = {
      OrthogonalRouting: 1,
      Router: class {
        kind: number;
        constructor(kind: number) { this.kind = kind; }
        processTransaction(): void { /* no-op */ }
      },
      Point: class {
        x: number;
        y: number;
        constructor(x: number, y: number) { this.x = x; this.y = y; }
      },
      Rectangle: class {
        centre: FakePoint;
        w: number;
        h: number;
        constructor(centre: FakePoint, w: number, h: number) {
          this.centre = centre;
          this.w = w;
          this.h = h;
        }
      },
      ShapeRef: class {
        id: number;
        rect: FakeRectangle;
        constructor(_router: unknown, rect: FakeRectangle) {
          this.id = next_id++;
          this.rect = rect;
          shapes.push({ id: this.id, rect });
        }
      },
      ConnEnd: class {
        pt: FakePoint;
        constructor(pt: FakePoint) { this.pt = pt; }
      },
      ConnRef: class {
        id_val: number;
        src: FakePoint;
        dst: FakePoint;
        constructor(_router: unknown, src: { pt: FakePoint }, dst: { pt: FakePoint }) {
          this.id_val = next_id++;
          this.src = src.pt;
          this.dst = dst.pt;
          conns.push({ id: this.id_val, src: src.pt, dst: dst.pt });
        }
        id(): number { return this.id_val; }
        displayRoute(): { size: () => number; get_ps: (i: number) => FakePoint } {
          // Synthesize a 3-point orthogonal polyline for inspection.
          const mid: FakePoint = { x: this.dst.x, y: this.src.y };
          const points = [this.src, mid, this.dst];
          return {
            size: () => points.length,
            get_ps: (i: number) => points[i] ?? { x: 0, y: 0 },
          };
        }
      },
    };

    vi.resetModules();
    vi.doMock('libavoid-js', () => ({
      AvoidLib: {
        load: () => Promise.resolve(),
        getInstance: () => fake_avoid,
      },
    }));
    const { reset_libavoid_for_tests: reset, route_with_libavoid: route } =
      await import('../libavoid_router.js');
    reset();

    // Hierarchy: root container 'parent' with child 'child' inside it,
    // plus a sibling leaf 'sib' at root. parent's child position is
    // relative to parent — we expect compute_origin_offsets to add 100,50.
    const nodes: WeftNode[] = [
      { id: 'parent', position: { x: 100, y: 50 }, width: 400, height: 200, data: { kind: 'compose', id: 'parent' } },
      { id: 'child', parentId: 'parent', position: { x: 20, y: 30 }, width: 80, height: 40, data: { kind: 'step', id: 'child' } },
      { id: 'sib', position: { x: 600, y: 100 }, width: 100, height: 40, data: { kind: 'step', id: 'sib' } },
    ];
    const edges: WeftEdge[] = [
      { id: 'e1', source: 'child', target: 'sib', data: { kind: 'structural' } },
    ];
    const routes = await route(nodes, edges);
    expect(routes).not.toBeNull();
    const points = routes?.get('e1');
    expect(points?.length).toBe(3);
    // child centre = parent_offset(100,50) + child_pos(20,30) + half(80,40) = (160, 100)
    expect(points?.[0]).toEqual({ x: 160, y: 100 });
    // sib centre = (600,100) + half(100,40) = (650, 120)
    expect(points?.[2]).toEqual({ x: 650, y: 120 });

    // Containers must NOT register as obstacles — only leaves do. With this
    // graph that means 'child' and 'sib', not 'parent'.
    expect(shapes.length).toBe(2);
    expect(conns.length).toBe(1);

    vi.doUnmock('libavoid-js');
    vi.resetModules();
  });
});
