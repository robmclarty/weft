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
import { runtime_class } from './node_helpers.js';
import { RuntimeOverlay } from './RuntimeOverlay.js';

function SequenceNodeImpl({ data }: NodeProps<WeftNode>): JSX.Element {
  const display_name = data.meta?.display_name;
  return (
    <div
      className={`weft-node weft-node-container weft-node-sequence ${runtime_class(data.runtime)}`}
      data-weft-kind="sequence"
    >
      <div className="weft-node-header">
        <span className="weft-node-badge"><SequenceGlyph />sequence</span>
        <div className="weft-node-title">{display_name ?? data.id}</div>
      </div>
      <RuntimeOverlay runtime={data.runtime} />
    </div>
  );
}

export const SequenceNode = memo(SequenceNodeImpl);
