/**
 * `<cycle>` sentinel node.
 *
 * Renders fascicle's loose-mode cycle marker as a leaf node naming the
 * upstream node id the sentinel points back to (`data.cycle_target`). Strict
 * mode would have thrown at the producer; in loose mode the cycle is part of
 * the static picture and gets a dedicated red visual treatment.
 */

import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { JSX } from 'react';
import { memo } from 'react';

import type { WeftNode } from '../transform/tree_to_graph.js';
import { CycleGlyph } from './glyphs.js';
import { runtime_class } from './node_helpers.js';
import { RuntimeOverlay } from './RuntimeOverlay.js';

function CycleNodeImpl({ data }: NodeProps<WeftNode>): JSX.Element {
  const target = data.cycle_target ?? data.id;
  return (
    <div
      className={`weft-node weft-node-cycle ${runtime_class(data.runtime)}`}
      data-weft-kind="cycle"
    >
      <Handle type="target" position={Position.Left} id="in" />
      <div className="weft-node-header">
        <span className="weft-node-badge weft-node-badge-cycle">
          <CycleGlyph />cycle
        </span>
        <div className="weft-node-title">→ {target}</div>
      </div>
      <RuntimeOverlay runtime={data.runtime} />
      <Handle type="source" position={Position.Right} id="out" />
    </div>
  );
}

export const CycleNode = memo(CycleNodeImpl);
