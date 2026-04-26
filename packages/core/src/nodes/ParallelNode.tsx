/**
 * Container node for `parallel` composers — fan-out.
 *
 * Declares per-handle ports (`in` and one `out:<key>` per branch) so ELK's
 * `FIXED_ORDER` port constraint preserves declaration order on re-layout
 * (research F5, F15). The transform tags this node with the same port ids;
 * the layout adapter mirrors them onto the ELK graph.
 *
 * Documented escape hatch (see `tree_to_graph.ts` parallel-ordering note): if
 * xyflow Discussion #4830 ever bites again, set `node.zIndex` from
 * declaration order on the transform side. Today, FIXED_ORDER + parent-id
 * subflows + depth-first ordering is enough.
 */

import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { JSX } from 'react';
import { memo } from 'react';

import type { WeftNode } from '../transform/tree_to_graph.js';
import { read_string_array_field } from './node_helpers.js';

function ParallelNodeImpl({ data }: NodeProps<WeftNode>): JSX.Element {
  const keys = read_string_array_field(data.config, 'keys') ?? [];
  return (
    <div className="weft-node weft-node-container" data-weft-kind="parallel">
      <div className="weft-node-title">
        {data.id}
        <span className="weft-node-badge">parallel × {keys.length}</span>
      </div>
      <Handle type="target" position={Position.Left} id="in" />
      {keys.map((key) => (
        <Handle
          key={key}
          type="source"
          position={Position.Right}
          id={`out:${key}`}
          data-weft-port-key={key}
        />
      ))}
    </div>
  );
}

export const ParallelNode = memo(ParallelNodeImpl);
