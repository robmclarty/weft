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
import { ParallelGlyph } from './glyphs.js';
import { read_string_array_field, runtime_class } from './node_helpers.js';
import { RuntimeOverlay } from './RuntimeOverlay.js';

function ParallelNodeImpl({ data }: NodeProps<WeftNode>): JSX.Element {
  const keys = read_string_array_field(data.config, 'keys') ?? [];
  const display_name = data.meta?.display_name;
  return (
    <div
      className={`weft-node weft-node-container weft-node-parallel ${runtime_class(data.runtime)}`}
      data-weft-kind="parallel"
    >
      <div className="weft-node-header">
        <span className="weft-node-badge">
          <ParallelGlyph />parallel × {keys.length}
        </span>
        <div className="weft-node-title">{display_name ?? data.id}</div>
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
      <RuntimeOverlay runtime={data.runtime} />
    </div>
  );
}

export const ParallelNode = memo(ParallelNodeImpl);
