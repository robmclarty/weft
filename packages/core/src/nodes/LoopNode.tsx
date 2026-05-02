/**
 * Wrapper node for `loop` composers.
 *
 * Visual: container chrome with the round-arrow glyph and the round cap. The
 * inner step (and optional guard) render as parent-id-linked children.
 */

import type { NodeProps } from '@xyflow/react';
import type { JSX } from 'react';
import { memo } from 'react';

import type { WeftNode } from '../transform/tree_to_graph.js';
import { LoopGlyph } from './glyphs.js';
import { read_number_field, runtime_class } from './node_helpers.js';
import { RuntimeOverlay } from './RuntimeOverlay.js';

function LoopNodeImpl({ data }: NodeProps<WeftNode>): JSX.Element {
  const max_rounds = read_number_field(data.config, 'max_rounds');
  const display_name = data.meta?.display_name;
  return (
    <div
      className={`weft-node weft-node-container weft-node-loop ${runtime_class(data.runtime)}`}
      data-weft-kind="loop"
    >
      <div className="weft-node-header">
        <span className="weft-node-badge">
          <LoopGlyph />loop{max_rounds === undefined ? '' : ` ≤ ${max_rounds}`}
        </span>
        <div className="weft-node-title">{display_name ?? data.id}</div>
      </div>
      <RuntimeOverlay runtime={data.runtime} />
    </div>
  );
}

export const LoopNode = memo(LoopNodeImpl);
