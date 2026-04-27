/**
 * Container node for `sequence` composers.
 *
 * Renders as a dashed-border subflow surface with a top header band.
 * Children appear as React Flow child nodes wired by the transform; this
 * component only paints the chrome and the title band.
 */

import type { NodeProps } from '@xyflow/react';
import type { JSX } from 'react';
import { memo } from 'react';

import type { WeftNode } from '../transform/tree_to_graph.js';
import { SequenceGlyph } from './glyphs.js';

function SequenceNodeImpl({ data }: NodeProps<WeftNode>): JSX.Element {
  return (
    <div
      className="weft-node weft-node-container weft-node-sequence"
      data-weft-kind="sequence"
    >
      <div className="weft-node-header">
        <span className="weft-node-badge"><SequenceGlyph />sequence</span>
        <div className="weft-node-title">{data.id}</div>
      </div>
    </div>
  );
}

export const SequenceNode = memo(SequenceNodeImpl);
