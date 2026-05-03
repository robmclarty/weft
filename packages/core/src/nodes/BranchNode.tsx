/**
 * Branch renders as a diamond junction — the wrapped `then` and
 * `otherwise` children are lifted to peers by `tree_to_graph`, and two
 * role-tagged outgoing edges fan out from the junction. Subway-map
 * convention: a labeled junction point, not a bay around the branches.
 *
 * The SVG polygon draws the diamond inside an axis-aligned 56×56 box so
 * React Flow handles still anchor at logical left / right of the box.
 */

import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { JSX } from 'react';
import { memo } from 'react';

import type { WeftNode } from '../transform/tree_to_graph.js';
import { BranchGlyph } from './glyphs.js';
import { runtime_class } from './node_helpers.js';
import { RuntimeOverlay } from './RuntimeOverlay.js';

function BranchNodeImpl({ data }: NodeProps<WeftNode>): JSX.Element {
  return (
    <div
      className={`weft-node weft-node-junction weft-node-branch ${runtime_class(data.runtime)}`}
      data-weft-kind="branch"
      data-weft-presentation="junction"
    >
      <Handle type="target" position={Position.Left} id="in" />
      <svg viewBox="0 0 56 56" aria-hidden="true">
        <polygon
          points="28,2 54,28 28,54 2,28"
          fill="var(--weft-branch-fill)"
          stroke="var(--weft-branch-accent)"
          strokeWidth="2"
        />
      </svg>
      <span className="weft-node-junction-glyph" style={{ color: 'var(--weft-branch-on)' }}>
        <BranchGlyph />
      </span>
      <RuntimeOverlay runtime={data.runtime} />
      <Handle type="source" position={Position.Right} id="out:then" data-weft-port-key="then" />
      {/* `otherwise` exits the bottom of the diamond so ELK's FIXED_SIDE port
       * (declared in `elk_runner.ts`) routes the dashed alt-path edge
       * downward instead of through the right side; the visible handle dot
       * sits where the line actually leaves the junction. */}
      <Handle type="source" position={Position.Bottom} id="out:otherwise" data-weft-port-key="otherwise" />
    </div>
  );
}

export const BranchNode = memo(BranchNodeImpl);
