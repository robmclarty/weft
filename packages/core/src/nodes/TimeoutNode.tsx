/**
 * Wrapper node for `timeout` composers.
 *
 * Visual: container chrome with a stopwatch glyph and the deadline in ms.
 */

import type { NodeProps } from '@xyflow/react';
import type { JSX } from 'react';
import { memo } from 'react';

import type { WeftNode } from '../transform/tree_to_graph.js';
import { TimeoutGlyph } from './glyphs.js';
import { read_number_field, runtime_class } from './node_helpers.js';
import { RuntimeOverlay } from './RuntimeOverlay.js';

function format_ms(ms: number | undefined): string {
  if (ms === undefined) return 'timeout';
  if (ms >= 1000) return `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)}s`;
  return `${ms}ms`;
}

function TimeoutNodeImpl({ data }: NodeProps<WeftNode>): JSX.Element {
  const ms = read_number_field(data.config, 'ms');
  const display_name = data.meta?.display_name;
  return (
    <div
      className={`weft-node weft-node-container weft-node-timeout ${runtime_class(data.runtime)}`}
      data-weft-kind="timeout"
    >
      <div className="weft-node-header">
        <span className="weft-node-badge">
          <TimeoutGlyph />timeout {format_ms(ms)}
        </span>
        <div className="weft-node-title">{display_name ?? data.id}</div>
      </div>
      <RuntimeOverlay runtime={data.runtime} />
    </div>
  );
}

export const TimeoutNode = memo(TimeoutNodeImpl);
