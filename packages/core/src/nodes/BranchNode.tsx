/**
 * Container node for `branch` composers — predicate-routed two-way fan-out.
 *
 * Children are the `then` and `otherwise` steps; the transform tags their
 * inbound edges with the matching label so the canvas reads at a glance.
 */

import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { JSX } from 'react';
import { memo } from 'react';

import type { WeftNode } from '../transform/tree_to_graph.js';
import { BranchGlyph } from './glyphs.js';
import { runtime_class } from './node_helpers.js';
import { RuntimeOverlay } from './RuntimeOverlay.js';

function BranchNodeImpl({ data }: NodeProps<WeftNode>): JSX.Element {
  const display_name = data.meta?.display_name;
  return (
    <div
      className={`weft-node weft-node-container weft-node-branch ${runtime_class(data.runtime)}`}
      data-weft-kind="branch"
    >
      <div className="weft-node-header">
        <span className="weft-node-badge"><BranchGlyph />branch</span>
        <div className="weft-node-title">{display_name ?? data.id}</div>
      </div>
      <Handle type="target" position={Position.Left} id="in" />
      <Handle type="source" position={Position.Right} id="out:then" data-weft-port-key="then" />
      <Handle type="source" position={Position.Right} id="out:otherwise" data-weft-port-key="otherwise" />
      <RuntimeOverlay runtime={data.runtime} />
    </div>
  );
}

export const BranchNode = memo(BranchNodeImpl);
