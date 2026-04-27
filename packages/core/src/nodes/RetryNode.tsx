/**
 * Wrapper node for `retry` composers.
 *
 * Visual: container chrome with a retry glyph and a readable
 * "N attempts · Bms" badge built from `max_attempts` and `backoff_ms`.
 * Inner node renders normally as a parent-id-linked child.
 */

import type { NodeProps } from '@xyflow/react';
import type { JSX } from 'react';
import { memo } from 'react';

import type { WeftNode } from '../transform/tree_to_graph.js';
import { RetryGlyph } from './glyphs.js';
import { read_number_field } from './node_helpers.js';

function format_retry_badge(
  attempts: number | undefined,
  backoff_ms: number | undefined,
): string {
  if (attempts !== undefined && backoff_ms !== undefined) {
    return `${attempts}× · ${backoff_ms}ms`;
  }
  if (attempts !== undefined) return `${attempts}×`;
  if (backoff_ms !== undefined) return `${backoff_ms}ms`;
  return 'retry';
}

function RetryNodeImpl({ data }: NodeProps<WeftNode>): JSX.Element {
  const attempts = read_number_field(data.config, 'max_attempts');
  const backoff_ms = read_number_field(data.config, 'backoff_ms');
  const badge = format_retry_badge(attempts, backoff_ms);
  return (
    <div
      className="weft-node weft-node-container weft-node-retry"
      data-weft-kind="retry"
    >
      <div className="weft-node-header">
        <span className="weft-node-badge">
          <RetryGlyph />retry {badge}
        </span>
        <div className="weft-node-title">{data.id}</div>
      </div>
    </div>
  );
}

export const RetryNode = memo(RetryNodeImpl);
