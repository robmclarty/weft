import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { flow_node_schema, flow_tree_schema } from '../schemas.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures_dir = join(here, '..', '..', '..', '..', 'fixtures');

function load(name: string): unknown {
  return JSON.parse(readFileSync(join(fixtures_dir, name), 'utf8'));
}

describe('flow_tree_schema', () => {
  it('accepts the simple_sequence fixture', () => {
    expect(flow_tree_schema.safeParse(load('simple_sequence.json')).success).toBe(true);
  });

  it('accepts the nested_parallel fixture', () => {
    expect(flow_tree_schema.safeParse(load('nested_parallel.json')).success).toBe(true);
  });

  it('accepts the full_primitive_set fixture', () => {
    expect(flow_tree_schema.safeParse(load('full_primitive_set.json')).success).toBe(true);
  });

  it('accepts the parallel_ordering fixture', () => {
    expect(flow_tree_schema.safeParse(load('parallel_ordering.json')).success).toBe(true);
  });

  it('rejects a parallel where keys.length !== children.length', () => {
    const broken = {
      version: 1,
      root: {
        kind: 'parallel',
        id: 'p1',
        config: { keys: ['a', 'b'] },
        children: [{ kind: 'step', id: 's1' }],
      },
    };
    const result = flow_tree_schema.safeParse(broken);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path.join('.')).toContain('config.keys');
    }
  });

  it('rejects a non-version-1 envelope', () => {
    expect(flow_tree_schema.safeParse({ version: 2, root: { kind: 'step', id: 's' } }).success).toBe(false);
  });
});

describe('flow_node_schema', () => {
  it('accepts a bare FlowNode', () => {
    expect(flow_node_schema.safeParse({ kind: 'step', id: 's1' }).success).toBe(true);
  });

  it('accepts a <cycle> sentinel as a FlowNode', () => {
    expect(flow_node_schema.safeParse({ kind: '<cycle>', id: 's1' }).success).toBe(true);
  });

  it('rejects a missing id', () => {
    const result = flow_node_schema.safeParse({ kind: 'step' });
    expect(result.success).toBe(false);
  });
});
