import { describe, expect, it } from 'vitest';
import {
  flow_node_schema,
  flow_tree_schema,
  tree_id,
  tree_to_graph,
  version,
} from './index.js';

describe('weft umbrella', () => {
  it('re-exports a semver version from @repo/core', () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('re-exports the flow_tree_schema as a runnable Zod schema', () => {
    const result = flow_tree_schema.safeParse({
      version: 1,
      root: { kind: 'step', id: 'a' },
    });
    expect(result.success).toBe(true);
  });

  it('re-exports the flow_node_schema', () => {
    const result = flow_node_schema.safeParse({ kind: 'step', id: 'a' });
    expect(result.success).toBe(true);
  });

  it('re-exports tree_to_graph and tree_id as callable functions', () => {
    const tree = flow_tree_schema.parse({
      version: 1,
      root: { kind: 'step', id: 'a' },
    });
    const { nodes } = tree_to_graph(tree);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.id).toBe('a');
    expect(typeof tree_id(tree.root)).toBe('string');
  });
});
