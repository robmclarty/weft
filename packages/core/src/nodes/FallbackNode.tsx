/**
 * Container node for `fallback` composers — primary-or-backup.
 *
 * Renders as a dashed-border subflow with two outbound branches labeled
 * `primary` / `backup` by the transform.
 */

import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { JSX } from 'react';
import { memo } from 'react';

import type { WeftNode } from '../transform/tree_to_graph.js';
import { FallbackGlyph } from './glyphs.js';
import { runtime_class } from './node_helpers.js';
import { RuntimeOverlay } from './RuntimeOverlay.js';

function FallbackNodeImpl({ data }: NodeProps<WeftNode>): JSX.Element {
  const display_name = data.meta?.display_name;
  return (
    <div
      className={`weft-node weft-node-container weft-node-fallback ${runtime_class(data.runtime)}`}
      data-weft-kind="fallback"
    >
      <div className="weft-node-header">
        <span className="weft-node-badge"><FallbackGlyph />fallback</span>
        <div className="weft-node-title">{display_name ?? data.id}</div>
      </div>
      <Handle type="target" position={Position.Left} id="in" />
      <Handle type="source" position={Position.Right} id="out:primary" data-weft-port-key="primary" />
      <Handle type="source" position={Position.Right} id="out:backup" data-weft-port-key="backup" />
      <RuntimeOverlay runtime={data.runtime} />
    </div>
  );
}

export const FallbackNode = memo(FallbackNodeImpl);
