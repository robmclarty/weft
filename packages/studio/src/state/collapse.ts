/**
 * Collapse-aware tree projection.
 *
 * The studio tracks per-node "collapsed" state (spec §5.3): double-clicking
 * a container hides its children. To keep `WeftCanvas` agnostic of this UI
 * concern, the studio rewrites the input `flow_tree` before passing it to
 * the canvas — collapsed containers are returned with their `children`
 * stripped and a `weft_collapsed: true` config flag set so the underlying
 * node component can render a child-count badge.
 *
 * Constraints §5.7: caller inputs are immutable. This function never
 * mutates its argument.
 */

import type { FlowNode, FlowTree, FlowValue } from '@repo/weft';

const WEFT_COLLAPSED_KEY = 'weft_collapsed';
const WEFT_COLLAPSED_COUNT_KEY = 'weft_collapsed_count';

export function apply_collapse(
  tree: FlowTree,
  collapsed_ids: ReadonlyArray<string>,
): FlowTree {
  if (collapsed_ids.length === 0) return tree;
  const collapse_set = new Set(collapsed_ids);
  return { version: 1, root: project(tree.root, collapse_set) };
}

function project(node: FlowNode, collapsed: Set<string>): FlowNode {
  if (collapsed.has(node.id)) {
    const child_count = node.children?.length ?? 0;
    const merged: { [key: string]: FlowValue } = {};
    if (node.config !== undefined) {
      for (const [key, value] of Object.entries(node.config)) {
        merged[key] = value;
      }
    }
    merged[WEFT_COLLAPSED_KEY] = true;
    merged[WEFT_COLLAPSED_COUNT_KEY] = child_count;
    return {
      kind: node.kind,
      id: node.id,
      config: merged,
    };
  }
  if (node.children === undefined) return node;
  const projected = node.children.map((child) => project(child, collapsed));
  return {
    kind: node.kind,
    id: node.id,
    ...(node.config !== undefined ? { config: node.config } : {}),
    children: projected,
  };
}
