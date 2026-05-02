import { describe, expect, it } from 'vitest';

import { compute_loop_back_path, compute_self_loop_path } from './edge_paths.js';

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
