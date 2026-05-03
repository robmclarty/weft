/**
 * Internal scope node — `stash`.
 *
 * Visual: when `is_container` is set (stash wraps a child step), renders as
 * a labeled green container chrome that fills ELK's computed bounds — so
 * edges land on the visible chrome instead of an invisible bigger box.
 * Childless stashes fall back to the leaf pill shape.
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
  if (data.is_container === true) {
    return (
      <div
        className={`weft-node weft-node-container weft-node-stash ${runtime_class(data.runtime)}`}
        data-weft-kind="stash"
      >
        <Handle type="target" position={Position.Left} id="in" />
        <div className="weft-node-header">
          <span className="weft-node-badge">
            <StashGlyph />key: {key ?? '(missing)'}
          </span>
          <div className="weft-node-title">{data.id}</div>
        </div>
        <RuntimeOverlay runtime={data.runtime} />
        <Handle type="source" position={Position.Right} id="out" />
      </div>
    );
  }
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
