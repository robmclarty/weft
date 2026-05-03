/**
 * Container node for `loop`. Hosts the loop body + optional guard + a
 * loop-back arc as parented children, so the iterate-then-exit shape
 * reads as one self-contained sub-machine: one input arrow lands on the
 * box, one labeled exit arrow leaves it, and the back-arc visibly cycles
 * inside.
 *
 * The header carries the loop's bound (`↺ ≤ N`) so the eye sees the
 * iteration count without hunting through the inspector.
 */

import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { JSX } from 'react';
import { memo } from 'react';

import type { WeftNode } from '../transform/tree_to_graph.js';
import { LoopGlyph } from './glyphs.js';
import { read_number_field, read_string_field, runtime_class } from './node_helpers.js';
import { RuntimeOverlay } from './RuntimeOverlay.js';

function LoopNodeImpl({ data }: NodeProps<WeftNode>): JSX.Element {
  const display_name =
    data.meta?.display_name ?? read_string_field(data.config, 'display_name');
  const max_rounds = read_number_field(data.config, 'max_rounds');
  const bound = max_rounds === undefined ? '↺ loop' : `↺ ≤ ${String(max_rounds)}`;
  const title = display_name ?? data.id;
  return (
    <div
      className={`weft-node weft-node-container weft-node-loop ${runtime_class(data.runtime)}`}
      data-weft-kind="loop"
    >
      <Handle type="target" position={Position.Left} id="in" />
      <div className="weft-node-header">
        <span className="weft-node-badge">
          <LoopGlyph />{bound}
        </span>
        <div className="weft-node-title">{title}</div>
      </div>
      <RuntimeOverlay runtime={data.runtime} />
      <Handle type="source" position={Position.Right} id="out" />
    </div>
  );
}

export const LoopNode = memo(LoopNodeImpl);
