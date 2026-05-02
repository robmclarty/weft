/**
 * Timeout wrapper renders as a **marker** — a small glyph dot positioned
 * downstream of its wrapped child. The deadline (`⏱ 30s`) rides on the
 * timeout-deadline decoration edge from child → marker. Subway-map
 * convention: timeout is a station with a clock, not a bay.
 *
 * Topologically the wrapped child is now a peer of the marker (lifted
 * by `tree_to_graph`); ELK lays them out as siblings.
 */

import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { JSX } from 'react';
import { memo } from 'react';

import type { WeftNode } from '../transform/tree_to_graph.js';
import { TimeoutGlyph } from './glyphs.js';
import { runtime_class } from './node_helpers.js';
import { RuntimeOverlay } from './RuntimeOverlay.js';

function TimeoutNodeImpl({ data }: NodeProps<WeftNode>): JSX.Element {
  return (
    <div
      className={`weft-node weft-node-marker weft-node-timeout ${runtime_class(data.runtime)}`}
      data-weft-kind="timeout"
      data-weft-presentation="marker"
    >
      <Handle type="target" position={Position.Left} id="in" />
      <span className="weft-node-marker-glyph" aria-hidden="true">
        <TimeoutGlyph />
      </span>
      <RuntimeOverlay runtime={data.runtime} />
      <Handle type="source" position={Position.Right} id="out" />
    </div>
  );
}

export const TimeoutNode = memo(TimeoutNodeImpl);
