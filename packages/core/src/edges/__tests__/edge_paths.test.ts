import { describe, expect, it } from 'vitest';

import {
  compute_loop_back_path,
  compute_orthogonal_path,
  compute_self_loop_path,
} from '../edge_paths.js';

describe('compute_self_loop_path', () => {
  it('arcs UP and LEFT of the source point with measured bounds', () => {
    const { path, peak } = compute_self_loop_path(
      { x: 200, y: 100 },
      { width: 200, height: 100 },
    );
    // Peak sits to the LEFT of source (x lower) and ABOVE (y lower).
    expect(peak.x).toBeLessThan(200);
    expect(peak.y).toBeLessThan(100);
    // SVG path begins at the source and uses a cubic Bezier.
    expect(path.startsWith('M 200 100')).toBe(true);
    expect(path).toContain('C ');
  });

  it('falls back to default leaf bounds when measured size is missing', () => {
    const { peak } = compute_self_loop_path({ x: 0, y: 0 });
    // 184 * 0.85 = 156.4, half = 78.2 — peak.x ≈ -78.2.
    expect(peak.x).toBeLessThan(-70);
    expect(peak.x).toBeGreaterThan(-90);
    // 60 * 0.9 = 54, peak.y ≈ -54.
    expect(peak.y).toBeLessThan(-50);
    expect(peak.y).toBeGreaterThan(-60);
  });

  it('honors the minimum arc envelope on tiny nodes so the loop stays legible', () => {
    const { peak } = compute_self_loop_path(
      { x: 0, y: 0 },
      { width: 10, height: 10 },
    );
    // Min width 80 / 2 = 40 → peak.x ≈ -40.
    expect(peak.x).toBeCloseTo(-40, 0);
    // Min height 40 → peak.y === -40.
    expect(peak.y).toBeCloseTo(-40, 0);
  });

  it('treats partial size hints as falling back per dimension', () => {
    const { peak } = compute_self_loop_path(
      { x: 0, y: 0 },
      { width: 400 },
    );
    // Width was given (400 * 0.85 = 340, half = 170) — height falls back.
    expect(peak.x).toBeCloseTo(-170, 0);
    expect(peak.y).toBeLessThan(-50);
  });
});

describe('compute_loop_back_path', () => {
  it('sweeps from source above the node to the target', () => {
    const { path, peak } = compute_loop_back_path(
      { x: 200, y: 100 },
      { x: 16, y: 100 },
      { height: 60 },
    );
    expect(peak.y).toBeLessThan(100);
    // Mid-x sits between source and target.
    expect(peak.x).toBeCloseTo(108, 0);
    expect(path.startsWith('M 200 100')).toBe(true);
    expect(path.endsWith('16 100')).toBe(true);
  });

  it('respects the minimum arc height for short nodes', () => {
    const { peak } = compute_loop_back_path(
      { x: 100, y: 0 },
      { x: 0, y: 0 },
      { height: 10 },
    );
    // Min arc height 56 — peak.y ≈ -56.
    expect(peak.y).toBeCloseTo(-56, 0);
  });

  it('scales bezier outreach with the span between source and target', () => {
    // Wide span: span * 0.4 should win over the 32px floor.
    const wide = compute_loop_back_path(
      { x: 1000, y: 0 },
      { x: 0, y: 0 },
      { height: 60 },
    );
    expect(wide.path).toContain('1400 -60');
    // Narrow span: 32px floor should win.
    const narrow = compute_loop_back_path(
      { x: 50, y: 0 },
      { x: 0, y: 0 },
      { height: 60 },
    );
    expect(narrow.path).toContain('82 -60');
  });

  it('falls back to default node height when measured is missing', () => {
    const { peak } = compute_loop_back_path(
      { x: 100, y: 0 },
      { x: 0, y: 0 },
    );
    // Default height 60 → arc height max(60, 56) = 60.
    expect(peak.y).toBeCloseTo(-60, 0);
  });
});

describe('compute_orthogonal_path', () => {
  it('renders a straight line when no bend points are supplied', () => {
    const { path, midpoint } = compute_orthogonal_path(
      { x: 0, y: 50 },
      { x: 100, y: 50 },
      [],
    );
    expect(path).toBe('M 0 50 L 100 50');
    expect(midpoint).toEqual({ x: 50, y: 50 });
  });

  it('rounds interior corners with a quadratic bezier whose control point is the corner', () => {
    const { path } = compute_orthogonal_path(
      { x: 0, y: 0 },
      { x: 100, y: 100 },
      [{ x: 100, y: 0 }],
    );
    // Should approach the corner along the X axis, turn at (100, 0), then descend.
    // The Q control point must be the literal corner (100, 0).
    expect(path).toContain('Q 100 0');
    // Path begins at the source, ends at the target.
    expect(path.startsWith('M 0 0')).toBe(true);
    expect(path.endsWith('100 100')).toBe(true);
  });

  it('clamps the corner radius to half the shorter incident segment so adjacent corners do not overlap', () => {
    // Z-shape with a 4px middle segment: between-corner distance is the
    // bottleneck so the default 8px radius must clamp to 2.
    const { path } = compute_orthogonal_path(
      { x: 0, y: 0 },
      { x: 4, y: 8 },
      [
        { x: 4, y: 0 }, // corner 1
        { x: 0, y: 4 }, // corner 2 — middle segment length sqrt(32) ≈ 5.66
        { x: 4, y: 4 }, // corner 3
      ],
    );
    // Path is well-formed with rounded turns.
    expect(path.startsWith('M 0 0')).toBe(true);
    expect(path).toMatch(/Q /);
  });

  it('drops the corner round when the incident segment is shorter than 1px (degenerate elbow)', () => {
    const { path } = compute_orthogonal_path(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      [{ x: 0.1, y: 0 }],
    );
    // No Q expected: the radius gets clamped to ≈0 and the helper falls
    // back to a plain L through the corner.
    expect(path).not.toContain('Q ');
    expect(path).toContain('L 0.1 0');
  });

  it('places the label at the midpoint of the longest segment', () => {
    // Z-shape: short top run, long middle run, short bottom run. Label must
    // anchor in the middle of the long run, not at a corner.
    const { midpoint } = compute_orthogonal_path(
      { x: 0, y: 0 },
      { x: 200, y: 20 },
      [
        { x: 20, y: 0 },
        { x: 20, y: 20 },
        { x: 180, y: 20 },
      ],
    );
    expect(midpoint.x).toBeCloseTo(100, 5);
    expect(midpoint.y).toBeCloseTo(20, 5);
  });

  it('places the label at the straight midpoint when the polyline has no bends', () => {
    const { midpoint } = compute_orthogonal_path(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      [],
    );
    expect(midpoint).toEqual({ x: 50, y: 0 });
  });
});
