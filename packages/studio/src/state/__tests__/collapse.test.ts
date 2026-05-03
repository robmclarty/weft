import { describe, expect, it } from 'vitest';

import type { FlowTree } from '@repo/weft';

import { apply_collapse } from '../collapse.js';

const tree: FlowTree = {
  version: 1,
  root: {
    kind: 'sequence',
    id: 'seq:root',
    children: [
      { kind: 'step', id: 'step:a' },
      {
        kind: 'parallel',
        id: 'p:0',
        config: { keys: ['x', 'y'] },
        children: [
          { kind: 'step', id: 'step:x' },
          { kind: 'step', id: 'step:y' },
        ],
      },
    ],
  },
};

describe('apply_collapse', () => {
  it('returns the input tree unchanged when nothing is collapsed', () => {
    expect(apply_collapse(tree, [])).toBe(tree);
  });

  it('strips children of collapsed nodes and adds collapse markers', () => {
    const next = apply_collapse(tree, ['p:0']);
    const parallel = (next.root.children?.[1]) ?? null;
    expect(parallel).not.toBeNull();
    expect(parallel?.children).toBeUndefined();
    expect(parallel?.config?.['weft_collapsed']).toBe(true);
    expect(parallel?.config?.['weft_collapsed_count']).toBe(2);
  });

  it('preserves existing config keys when collapsing', () => {
    const next = apply_collapse(tree, ['p:0']);
    const parallel = next.root.children?.[1];
    expect(parallel?.config?.['keys']).toEqual(['x', 'y']);
  });

  it('does not mutate the input tree', () => {
    const before = JSON.stringify(tree);
    apply_collapse(tree, ['p:0', 'seq:root']);
    expect(JSON.stringify(tree)).toBe(before);
  });

  it('never collapses the root, so the canvas cannot go blank', () => {
    // A `<cycle>` sentinel borrows its target id, which can collide with
    // the root sequence's id (see fixtures/cycle_bug.json: the cycle node's
    // resolved FlowNode id is "seq:loop", same as the root). Collapsing the
    // root would strip every child and leave the canvas effectively empty.
    const next = apply_collapse(tree, ['seq:root']);
    expect(next.root.children?.length).toBe(2);
    expect(next.root.config?.['weft_collapsed']).toBeUndefined();
  });

  it('still collapses non-root nodes when the root id is also in the set', () => {
    const next = apply_collapse(tree, ['seq:root', 'p:0']);
    expect(next.root.children?.length).toBe(2);
    const parallel = next.root.children?.[1];
    expect(parallel?.children).toBeUndefined();
    expect(parallel?.config?.['weft_collapsed']).toBe(true);
  });
});
