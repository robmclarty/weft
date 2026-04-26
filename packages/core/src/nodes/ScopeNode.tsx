/**
 * Container node for `scope` composers.
 *
 * Visual: dashed-border subflow with a "scope" badge. The transform emits the
 * dashed `stash → use` overlay edges; this component does not render them.
 */

import type { NodeProps } from '@xyflow/react';
import type { JSX } from 'react';
import { memo } from 'react';

import type { WeftNode } from '../transform/tree_to_graph.js';

function ScopeNodeImpl({ data }: NodeProps<WeftNode>): JSX.Element {
  return (
    <div className="weft-node weft-node-container" data-weft-kind="scope">
      <div className="weft-node-title">
        {data.id}
        <span className="weft-node-badge">scope</span>
      </div>
    </div>
  );
}

export const ScopeNode = memo(ScopeNodeImpl);
