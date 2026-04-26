/**
 * Container node for `sequence` composers.
 *
 * Renders as a dashed-border subflow surface. Children appear as React Flow
 * child nodes wired by the transform; this component only paints the chrome
 * and the title band.
 */

import type { NodeProps } from '@xyflow/react';
import type { JSX } from 'react';
import { memo } from 'react';

import type { WeftNode } from '../transform/tree_to_graph.js';

function SequenceNodeImpl({ data }: NodeProps<WeftNode>): JSX.Element {
  return (
    <div className="weft-node weft-node-container" data-weft-kind="sequence">
      <div className="weft-node-title">
        {data.id}
        <span className="weft-node-badge">sequence</span>
      </div>
    </div>
  );
}

export const SequenceNode = memo(SequenceNodeImpl);
