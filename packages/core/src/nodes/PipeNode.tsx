/**
 * Wrapper node for `pipe` composers.
 *
 * Visual: thin border with a small "pipe" glyph indicating the tail transform.
 * Inner node renders as its single child via React Flow's parent-child link.
 */

import type { NodeProps } from '@xyflow/react';
import type { JSX } from 'react';
import { memo } from 'react';

import type { WeftNode } from '../transform/tree_to_graph.js';
import { format_fn_ref } from './node_helpers.js';

function PipeNodeImpl({ data }: NodeProps<WeftNode>): JSX.Element {
  const fn_label = format_fn_ref(data.config?.['fn']);
  return (
    <div className="weft-node weft-node-container" data-weft-kind="pipe">
      <div className="weft-node-title">
        {data.id}
        <span className="weft-node-badge">pipe → {fn_label}</span>
      </div>
    </div>
  );
}

export const PipeNode = memo(PipeNodeImpl);
