/**
 * Internal scope node — `use`.
 *
 * Visual: leaf-like card with a "reads:" badge listing the stash keys it
 * consumes. Wraps a single child via React Flow's parent-child link.
 */

import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { JSX } from 'react';
import { memo } from 'react';

import type { WeftNode } from '../transform/tree_to_graph.js';
import { read_string_array_field } from './node_helpers.js';

function UseNodeImpl({ data }: NodeProps<WeftNode>): JSX.Element {
  const keys = read_string_array_field(data.config, 'keys') ?? [];
  return (
    <div className="weft-node weft-node-use" data-weft-kind="use">
      <Handle type="target" position={Position.Left} id="in" />
      <div className="weft-node-title">
        {data.id}
        <span className="weft-node-badge">reads: {keys.join(', ') || '(none)'}</span>
      </div>
      <Handle type="source" position={Position.Right} id="out" />
    </div>
  );
}

export const UseNode = memo(UseNodeImpl);
