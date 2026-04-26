import { describe, expect, it } from 'vitest';

import {
  flow_node_schema,
  flow_tree_schema,
  flow_value_schema,
} from './schemas.js';
import { load_fixture_raw } from './test_helpers.js';

describe('flow_tree_schema', () => {
  it('accepts simple_sequence.json', () => {
    const result = flow_tree_schema.safeParse(load_fixture_raw('simple_sequence.json'));
    expect(result.success).toBe(true);
  });

  it('accepts nested_parallel.json', () => {
    const result = flow_tree_schema.safeParse(load_fixture_raw('nested_parallel.json'));
    expect(result.success).toBe(true);
  });

  it('accepts full_primitive_set.json', () => {
    const result = flow_tree_schema.safeParse(load_fixture_raw('full_primitive_set.json'));
    expect(result.success).toBe(true);
  });

  it('accepts cycle_bug.json', () => {
    const result = flow_tree_schema.safeParse(load_fixture_raw('cycle_bug.json'));
    expect(result.success).toBe(true);
  });

  it('accepts parallel_ordering.json', () => {
    const result = flow_tree_schema.safeParse(load_fixture_raw('parallel_ordering.json'));
    expect(result.success).toBe(true);
  });

  it('rejects a missing version', () => {
    const result = flow_tree_schema.safeParse({
      root: { kind: 'step', id: 'a' },
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]?.path).toEqual(['version']);
  });

  it('rejects a wrong version literal', () => {
    const result = flow_tree_schema.safeParse({
      version: 2,
      root: { kind: 'step', id: 'a' },
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]?.path).toEqual(['version']);
  });

  it('rejects a missing root.id with a path pointing at root.id', () => {
    const result = flow_tree_schema.safeParse({
      version: 1,
      root: { kind: 'step' },
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]?.path).toEqual(['root', 'id']);
  });

  it('rejects parallel where keys.length !== children.length', () => {
    const result = flow_tree_schema.safeParse({
      version: 1,
      root: {
        kind: 'parallel',
        id: 'p',
        config: { keys: ['only'] },
        children: [
          { kind: 'step', id: 's1' },
          { kind: 'step', id: 's2' },
        ],
      },
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]?.path).toEqual(['root', 'config', 'keys']);
  });

  it('rejects parallel with non-string keys', () => {
    const result = flow_tree_schema.safeParse({
      version: 1,
      root: {
        kind: 'parallel',
        id: 'p',
        config: { keys: [1, 2] },
        children: [
          { kind: 'step', id: 's1' },
          { kind: 'step', id: 's2' },
        ],
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects parallel with no keys at all', () => {
    const result = flow_tree_schema.safeParse({
      version: 1,
      root: {
        kind: 'parallel',
        id: 'p',
        children: [{ kind: 'step', id: 's1' }],
      },
    });
    expect(result.success).toBe(false);
  });
});

describe('flow_node_schema', () => {
  it('accepts a step with no config or children', () => {
    const result = flow_node_schema.safeParse({ kind: 'step', id: 'a' });
    expect(result.success).toBe(true);
  });

  it('accepts a node whose kind is unknown to the v0 dispatch', () => {
    const result = flow_node_schema.safeParse({ kind: 'fancy_new_kind', id: 'x' });
    expect(result.success).toBe(true);
  });

  it('accepts the cycle sentinel as a FlowNode', () => {
    const result = flow_node_schema.safeParse({ kind: '<cycle>', id: 'seq:loop' });
    expect(result.success).toBe(true);
  });
});

describe('flow_value_schema', () => {
  it('accepts every FlowValue branch', () => {
    const branches: ReadonlyArray<unknown> = [
      'a string',
      0,
      42,
      -1.5,
      true,
      false,
      null,
      [1, 'two', true, null, [1, 2], { nested: 'ok' }],
      { kind: '<fn>' },
      { kind: '<fn>', name: 'greet' },
      { kind: '<schema>' },
      { kind: 'step', id: 'step:foo' },
      { kind: '<cycle>', id: 'seq:loop' },
      { plain: 'object', count: 3 },
    ];
    for (const value of branches) {
      const result = flow_value_schema.safeParse(value);
      expect(result.success, `value: ${JSON.stringify(value)}`).toBe(true);
    }
  });

  it('rejects undefined', () => {
    const result = flow_value_schema.safeParse(undefined);
    expect(result.success).toBe(false);
  });

  it('rejects a function', () => {
    const result = flow_value_schema.safeParse(() => null);
    expect(result.success).toBe(false);
  });
});
