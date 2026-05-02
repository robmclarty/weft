/**
 * Wrapper node for `pipe` composers.
 *
 * Visual: container chrome with a pipe glyph and the tail transform's
 * function reference. Inner node renders as its single child via React
 * Flow's parent-child link.
 */

import type { NodeProps } from '@xyflow/react';
import type { JSX } from 'react';
import { memo } from 'react';

import type { WeftNode } from '../transform/tree_to_graph.js';
import { PipeGlyph } from './glyphs.js';
import { format_fn_ref, runtime_class } from './node_helpers.js';
import { RuntimeOverlay } from './RuntimeOverlay.js';

function PipeNodeImpl({ data }: NodeProps<WeftNode>): JSX.Element {
  const fn_label = format_fn_ref(data.config?.['fn']);
  const display_name = data.meta?.display_name;
  return (
    <div
      className={`weft-node weft-node-container weft-node-pipe ${runtime_class(data.runtime)}`}
      data-weft-kind="pipe"
    >
      <div className="weft-node-header">
        <span className="weft-node-badge">
          <PipeGlyph />pipe → {fn_label}
        </span>
        <div className="weft-node-title">{display_name ?? data.id}</div>
      </div>
      <RuntimeOverlay runtime={data.runtime} />
    </div>
  );
}

export const PipeNode = memo(PipeNodeImpl);
