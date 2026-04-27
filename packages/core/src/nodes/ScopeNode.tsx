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
import { ScopeGlyph } from './glyphs.js';

function ScopeNodeImpl({ data }: NodeProps<WeftNode>): JSX.Element {
  return (
    <div
      className="weft-node weft-node-container weft-node-scope"
      data-weft-kind="scope"
    >
      <div className="weft-node-header">
        <span className="weft-node-badge"><ScopeGlyph />scope</span>
        <div className="weft-node-title">{data.id}</div>
      </div>
    </div>
  );
}

export const ScopeNode = memo(ScopeNodeImpl);
