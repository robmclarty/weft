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
import { UseGlyph } from './glyphs.js';
import { read_string_array_field, runtime_class } from './node_helpers.js';
import { RuntimeOverlay } from './RuntimeOverlay.js';

function UseNodeImpl({ data }: NodeProps<WeftNode>): JSX.Element {
  const keys = read_string_array_field(data.config, 'keys') ?? [];
  return (
    <div
      className={`weft-node weft-node-leaf weft-node-use ${runtime_class(data.runtime)}`}
      data-weft-kind="use"
    >
      <Handle type="target" position={Position.Left} id="in" />
      <div className="weft-node-header">
        <span className="weft-node-badge">
          <UseGlyph />reads: {keys.join(', ') || '(none)'}
        </span>
        <div className="weft-node-title">{data.id}</div>
      </div>
      <RuntimeOverlay runtime={data.runtime} />
      <Handle type="source" position={Position.Right} id="out" />
    </div>
  );
}

export const UseNode = memo(UseNodeImpl);
