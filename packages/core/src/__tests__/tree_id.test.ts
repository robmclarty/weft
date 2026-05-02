import { describe, expect, it } from 'vitest';

import { flow_tree_schema } from '../schemas.js';
import { load_fixture_raw } from '../test_helpers.js';
import { tree_id } from '../tree_id.js';

const FIXTURE_NAMES = [
  'simple_sequence.json',
  'nested_parallel.json',
  'full_primitive_set.json',
  'cycle_bug.json',
  'parallel_ordering.json',
];

function parse_root(name: string) {
  const result = flow_tree_schema.parse(load_fixture_raw(name));
  return result.root;
}

function bump_first_retry(node: Record<string, unknown>): boolean {
  if (node['kind'] === 'retry' && node['config']) {
    const config = node['config'] as Record<string, unknown>;
    config['max_attempts'] = 99;
    return true;
  }
  const children = (node['children'] ?? []) as Array<Record<string, unknown>>;
  for (const child of children) {
    if (bump_first_retry(child)) return true;
  }
  return false;
}

describe('tree_id', () => {
  it('returns a non-empty base36 string', () => {
    const id = tree_id(parse_root('simple_sequence.json'));
    expect(id).toMatch(/^[0-9a-z]+$/);
    expect(id.length).toBeGreaterThan(0);
  });

  it('is deterministic across calls on the same input', () => {
    const root = parse_root('simple_sequence.json');
    expect(tree_id(root)).toBe(tree_id(root));
  });

  it('is sensitive to changes in any leaf', () => {
    const root = parse_root('simple_sequence.json');
    const original = tree_id(root);
    const tweaked = JSON.parse(JSON.stringify(root)) as Record<string, unknown>;
    const children = (tweaked['children'] ?? []) as Array<Record<string, unknown>>;
    const last = children[children.length - 1];
    if (last !== undefined) last['id'] = `${String(last['id'])}-changed`;
    expect(tree_id(tweaked as never)).not.toBe(original);
  });

  it('is sensitive to a config change deep inside the tree', () => {
    const root = parse_root('full_primitive_set.json');
    const original = tree_id(root);
    const tweaked = JSON.parse(JSON.stringify(root)) as Record<string, unknown>;
    bump_first_retry(tweaked);
    expect(tree_id(tweaked as never)).not.toBe(original);
  });

  it('produces distinct ids across all v0 fixtures', () => {
    const ids = new Set<string>();
    for (const name of FIXTURE_NAMES) {
      ids.add(tree_id(parse_root(name)));
    }
    expect(ids.size).toBe(FIXTURE_NAMES.length);
  });
});
