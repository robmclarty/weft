/**
 * Internal scope node — `stash`.
 *
 * Visual: leaf-like card with a "key" badge naming the stashed value. Wraps a
 * single child step which produces the value; the child renders inside via
 * React Flow's parent-child link.
 */

import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { JSX } from 'react';
import { memo } from 'react';

import type { WeftNode } from '../transform/tree_to_graph.js';
import { read_string_field } from './node_helpers.js';

function StashNodeImpl({ data }: NodeProps<WeftNode>): JSX.Element {
  const key = read_string_field(data.config, 'key');
  return (
    <div className="weft-node weft-node-stash" data-weft-kind="stash">
      <Handle type="target" position={Position.Left} id="in" />
      <div className="weft-node-title">
        {data.id}
        <span className="weft-node-badge">key: {key ?? '(missing)'}</span>
      </div>
      <Handle type="source" position={Position.Right} id="out" />
    </div>
  );
}

export const StashNode = memo(StashNodeImpl);
