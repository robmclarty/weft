/**
 * Internal scope node — `stash`.
 *
 * Visual: leaf-like card with a "key:" badge naming the stashed value. Wraps
 * a single child step which produces the value; the child renders inside via
 * React Flow's parent-child link.
 */

import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { JSX } from 'react';
import { memo } from 'react';

import type { WeftNode } from '../transform/tree_to_graph.js';
import { StashGlyph } from './glyphs.js';
import { read_string_field, runtime_class } from './node_helpers.js';
import { RuntimeOverlay } from './RuntimeOverlay.js';
import { WrapperBadges } from './WrapperBadges.js';

function StashNodeImpl({ data }: NodeProps<WeftNode>): JSX.Element {
  const key = read_string_field(data.config, 'key');
  const wrappers = data.wrappers ?? [];
  return (
    <div
      className={`weft-node weft-node-leaf weft-node-stash ${runtime_class(data.runtime)} ${wrappers.length > 0 ? 'weft-node-with-wrappers' : ''}`}
      data-weft-kind="stash"
    >
      <Handle type="target" position={Position.Left} id="in" />
      <div className="weft-node-header">
        <span className="weft-node-badge">
          <StashGlyph />key: {key ?? '(missing)'}
        </span>
        <div className="weft-node-title">{data.id}</div>
      </div>
      <WrapperBadges wrappers={wrappers} />
      <RuntimeOverlay runtime={data.runtime} />
      <Handle type="source" position={Position.Right} id="out" />
    </div>
  );
}

export const StashNode = memo(StashNodeImpl);
