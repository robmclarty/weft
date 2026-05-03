/**
 * Fallback renders as a diamond junction — the `primary` and `backup`
 * children are lifted to peers by `tree_to_graph`, and two role-tagged
 * outgoing edges fan out from the junction (primary solid, backup
 * dashed). Subway-map convention: a labeled junction point, not a bay.
 */

import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { JSX } from 'react';
import { memo } from 'react';

import type { WeftNode } from '../transform/tree_to_graph.js';
import { FallbackGlyph } from './glyphs.js';
import { runtime_class } from './node_helpers.js';
import { RuntimeOverlay } from './RuntimeOverlay.js';

function FallbackNodeImpl({ data }: NodeProps<WeftNode>): JSX.Element {
  return (
    <div
      className={`weft-node weft-node-junction weft-node-fallback ${runtime_class(data.runtime)}`}
      data-weft-kind="fallback"
      data-weft-presentation="junction"
    >
      <Handle type="target" position={Position.Left} id="in" />
      <svg viewBox="0 0 56 56" aria-hidden="true">
        <polygon
          points="28,2 54,28 28,54 2,28"
          fill="var(--weft-fallback-fill)"
          stroke="var(--weft-fallback-accent)"
          strokeWidth="2"
        />
      </svg>
      <span className="weft-node-junction-glyph" style={{ color: 'var(--weft-fallback-on)' }}>
        <FallbackGlyph />
      </span>
      <RuntimeOverlay runtime={data.runtime} />
      <Handle type="source" position={Position.Right} id="out:primary" data-weft-port-key="primary" />
      {/* `backup` exits the bottom — see `BranchNode.tsx` for the same
       * FIXED_SIDE port arrangement. */}
      <Handle type="source" position={Position.Bottom} id="out:backup" data-weft-port-key="backup" />
    </div>
  );
}

export const FallbackNode = memo(FallbackNodeImpl);
