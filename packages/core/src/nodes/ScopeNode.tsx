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
import { runtime_class } from './node_helpers.js';
import { RuntimeOverlay } from './RuntimeOverlay.js';

function ScopeNodeImpl({ data }: NodeProps<WeftNode>): JSX.Element {
  const display_name = data.meta?.display_name;
  return (
    <div
      className={`weft-node weft-node-container weft-node-scope ${runtime_class(data.runtime)}`}
      data-weft-kind="scope"
    >
      <div className="weft-node-header">
        <span className="weft-node-badge"><ScopeGlyph />scope</span>
        <div className="weft-node-title">{display_name ?? data.id}</div>
      </div>
      <RuntimeOverlay runtime={data.runtime} />
    </div>
  );
}

export const ScopeNode = memo(ScopeNodeImpl);
