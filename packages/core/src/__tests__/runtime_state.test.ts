import { describe, expect, it } from 'vitest';

import type { FlowTree } from '../schemas.js';
import type { ParsedTrajectoryEvent } from '../trajectory.js';
import { derive_runtime_state } from '../runtime_state.js';

const SIMPLE_TREE: FlowTree = {
  version: 1,
  root: {
    kind: 'sequence',
    id: 'sequence_1',
    children: [
      { kind: 'step', id: 'fetch' },
      { kind: 'step', id: 'parse' },
    ],
  },
};

describe('derive_runtime_state', () => {
  it('returns an empty map when there are no events', () => {
    const state = derive_runtime_state([], SIMPLE_TREE);
    expect(state.size).toBe(0);
  });

  it('marks a step active while its span is open', () => {
    const events: ParsedTrajectoryEvent[] = [
      { kind: 'span_start', span_id: 's1', name: 'step', id: 'fetch' },
    ];
    const state = derive_runtime_state(events, SIMPLE_TREE);
    expect(state.get('fetch')?.active).toBe(true);
    expect(state.get('fetch')?.span_count).toBe(1);
  });

  it('clears active when the span closes', () => {
    const events: ParsedTrajectoryEvent[] = [
      { kind: 'span_start', span_id: 's1', name: 'step', id: 'fetch' },
      { kind: 'span_end', span_id: 's1', id: 'fetch' },
    ];
    const state = derive_runtime_state(events, SIMPLE_TREE);
    expect(state.get('fetch')?.active).toBe(false);
    expect(state.get('fetch')?.span_count).toBe(1);
  });

  it('records an error when span_end carries error meta', () => {
    const events: ParsedTrajectoryEvent[] = [
      { kind: 'span_start', span_id: 's1', name: 'step', id: 'fetch' },
      { kind: 'span_end', span_id: 's1', id: 'fetch', error: 'network down' },
    ];
    const state = derive_runtime_state(events, SIMPLE_TREE);
    expect(state.get('fetch')?.error).toBe('network down');
    expect(state.get('fetch')?.active).toBe(false);
  });

  it('attributes emit events to the most recently opened span', () => {
    const events: ParsedTrajectoryEvent[] = [
      { kind: 'span_start', span_id: 's1', name: 'step', id: 'fetch', ts: 1 },
      { kind: 'emit', label: 'progress', ts: 100 },
    ];
    const state = derive_runtime_state(events, SIMPLE_TREE);
    expect(state.get('fetch')?.last_emit_ts).toBe(100);
  });

  it('rolls cost up to ancestors via the parent index', () => {
    const events: ParsedTrajectoryEvent[] = [
      { kind: 'span_start', span_id: 's1', name: 'step', id: 'fetch' },
      { kind: 'cost', total_usd: 0.05, step_index: 0 },
      { kind: 'span_end', span_id: 's1', id: 'fetch' },
    ];
    const state = derive_runtime_state(events, SIMPLE_TREE);
    expect(state.get('fetch')?.cost_usd).toBeCloseTo(0.05);
    expect(state.get('sequence_1')?.cost_usd).toBeCloseTo(0.05);
  });

  it('sums cost across multiple steps for a shared parent', () => {
    const events: ParsedTrajectoryEvent[] = [
      { kind: 'span_start', span_id: 's1', name: 'step', id: 'fetch' },
      { kind: 'cost', total_usd: 0.02 },
      { kind: 'span_end', span_id: 's1', id: 'fetch' },
      { kind: 'span_start', span_id: 's2', name: 'step', id: 'parse' },
      { kind: 'cost', total_usd: 0.03 },
      { kind: 'span_end', span_id: 's2', id: 'parse' },
    ];
    const state = derive_runtime_state(events, SIMPLE_TREE);
    expect(state.get('fetch')?.cost_usd).toBeCloseTo(0.02);
    expect(state.get('parse')?.cost_usd).toBeCloseTo(0.03);
    expect(state.get('sequence_1')?.cost_usd).toBeCloseTo(0.05);
  });

  it('filters by run_id when one is provided', () => {
    const events: ParsedTrajectoryEvent[] = [
      { kind: 'span_start', span_id: 's1', name: 'step', id: 'fetch', run_id: 'a' },
      { kind: 'span_end', span_id: 's1', id: 'fetch', run_id: 'a' },
      { kind: 'span_start', span_id: 's2', name: 'step', id: 'parse', run_id: 'b' },
    ];
    const state = derive_runtime_state(events, SIMPLE_TREE, { run_id: 'b' });
    expect(state.has('fetch')).toBe(false);
    expect(state.get('parse')?.active).toBe(true);
  });

  it('records last_run_id on the affected step', () => {
    const events: ParsedTrajectoryEvent[] = [
      { kind: 'span_start', span_id: 's1', name: 'step', id: 'fetch', run_id: 'r-7' },
    ];
    const state = derive_runtime_state(events, SIMPLE_TREE);
    expect(state.get('fetch')?.last_run_id).toBe('r-7');
  });

  it('tolerates a null tree (no parent rollup, but per-step state still works)', () => {
    const events: ParsedTrajectoryEvent[] = [
      { kind: 'span_start', span_id: 's1', name: 'step', id: 'fetch' },
      { kind: 'cost', total_usd: 0.1 },
    ];
    const state = derive_runtime_state(events, null);
    expect(state.get('fetch')?.cost_usd).toBeCloseTo(0.1);
  });
});
