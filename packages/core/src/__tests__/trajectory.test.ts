import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  custom_event_schema,
  emit_event_schema,
  span_end_event_schema,
  span_start_event_schema,
  trajectory_event_schema,
  type ParsedTrajectoryEvent,
} from '../trajectory.js';
import { derive_runtime_state, type NodeRuntimeState } from '../runtime_state.js';
import type { FlowTree } from '../schemas.js';

const here = dirname(fileURLToPath(import.meta.url));

describe('trajectory_event_schema', () => {
  it('parses a span_start with passthrough metadata', () => {
    const parsed = span_start_event_schema.parse({
      kind: 'span_start',
      span_id: 'step:1',
      name: 'step',
      id: 'fetch',
      run_id: 'run_001',
      parent_span_id: 'sequence:0',
    });
    expect(parsed.kind).toBe('span_start');
    // Passthrough fields are preserved on the parsed object so reducers can
    // read them without re-declaring the schema.
    expect((parsed as Record<string, unknown>)['id']).toBe('fetch');
    expect((parsed as Record<string, unknown>)['run_id']).toBe('run_001');
  });

  it('parses a span_end carrying optional error meta', () => {
    const parsed = span_end_event_schema.parse({
      kind: 'span_end',
      span_id: 'step:1',
      error: 'boom',
    });
    expect((parsed as Record<string, unknown>)['error']).toBe('boom');
  });

  it('parses an emit event with a timestamp passthrough', () => {
    const parsed = emit_event_schema.parse({ kind: 'emit', ts: 12345 });
    expect((parsed as Record<string, unknown>)['ts']).toBe(12345);
  });

  it('falls through to the custom branch for any unknown kind', () => {
    const parsed = custom_event_schema.parse({
      kind: 'cost',
      total_usd: 0.01,
    });
    expect(parsed.kind).toBe('cost');
    expect((parsed as Record<string, unknown>)['total_usd']).toBe(0.01);
  });

  it('rejects non-string kind via the union', () => {
    const result = trajectory_event_schema.safeParse({ kind: 42 });
    expect(result.success).toBe(false);
  });
});

describe('drift detector — derive_runtime_state on a fascicle-shaped fixture', () => {
  const FIXTURE_TREE: FlowTree = {
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

  function load_fixture_events(): ParsedTrajectoryEvent[] {
    const path = join(here, 'fixtures', 'trajectory_sample.jsonl');
    const raw = readFileSync(path, 'utf8');
    return raw
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => trajectory_event_schema.parse(JSON.parse(line)));
  }

  it('projects the fixture trajectory to the hand-computed expected map', () => {
    const events = load_fixture_events();
    const state = derive_runtime_state(events, FIXTURE_TREE);

    const fetch: NodeRuntimeState | undefined = state.get('fetch');
    expect(fetch).toBeDefined();
    expect(fetch?.active).toBe(false);
    expect(fetch?.error).toBeNull();
    expect(fetch?.last_emit_ts).toBe(1700000000000);
    expect(fetch?.cost_usd).toBeCloseTo(0.0023, 6);
    expect(fetch?.last_run_id).toBe('run_001');
    expect(fetch?.span_count).toBe(1);

    const parse: NodeRuntimeState | undefined = state.get('parse');
    expect(parse).toBeDefined();
    expect(parse?.active).toBe(false);
    expect(parse?.error).toBe('network down');
    expect(parse?.cost_usd).toBe(0);
    expect(parse?.span_count).toBe(1);

    const sequence: NodeRuntimeState | undefined = state.get('sequence_1');
    expect(sequence).toBeDefined();
    expect(sequence?.active).toBe(false);
    // Container roll-up: cost from fetch bubbles into the parent sequence.
    expect(sequence?.cost_usd).toBeCloseTo(0.0023, 6);
    expect(sequence?.span_count).toBe(1);
  });
});
