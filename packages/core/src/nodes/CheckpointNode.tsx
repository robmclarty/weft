/**
 * Wrapper node for `checkpoint` composers.
 *
 * Visual: container chrome with a flag glyph and the checkpoint key when it is
 * a static string. Function-derived keys render as `<fn>`.
 */

import type { NodeProps } from '@xyflow/react';
import type { JSX } from 'react';
import { memo } from 'react';

import type { FlowValue } from '../schemas.js';
import type { WeftNode } from '../transform/tree_to_graph.js';
import { CheckpointGlyph } from './glyphs.js';
import { runtime_class } from './node_helpers.js';
import { RuntimeOverlay } from './RuntimeOverlay.js';

function format_key(value: FlowValue | undefined): string {
  if (typeof value === 'string') return value;
  if (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    'kind' in value &&
    value.kind === '<fn>'
  ) {
    return '<fn>';
  }
  return '?';
}

function CheckpointNodeImpl({ data }: NodeProps<WeftNode>): JSX.Element {
  const key = format_key(data.config?.['key']);
  const display_name = data.meta?.display_name;
  return (
    <div
      className={`weft-node weft-node-container weft-node-checkpoint ${runtime_class(data.runtime)}`}
      data-weft-kind="checkpoint"
    >
      <div className="weft-node-header">
        <span className="weft-node-badge">
          <CheckpointGlyph />checkpoint · {key}
        </span>
        <div className="weft-node-title">{display_name ?? data.id}</div>
      </div>
      <RuntimeOverlay runtime={data.runtime} />
    </div>
  );
}

export const CheckpointNode = memo(CheckpointNodeImpl);
