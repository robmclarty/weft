/**
 * Wrapper node for `retry` composers.
 *
 * Visual: container border with a `max_attempts × backoff_ms` badge. Inner
 * node renders normally as a parent-id-linked child.
 */

import type { NodeProps } from '@xyflow/react';
import type { JSX } from 'react';
import { memo } from 'react';

import type { WeftNode } from '../transform/tree_to_graph.js';
import { read_number_field } from './node_helpers.js';

function RetryNodeImpl({ data }: NodeProps<WeftNode>): JSX.Element {
  const attempts = read_number_field(data.config, 'max_attempts');
  const backoff = read_number_field(data.config, 'backoff_ms');
  const badge =
    attempts !== undefined && backoff !== undefined
      ? `retry ${attempts}× / ${backoff}ms`
      : `retry${attempts !== undefined ? ` ${attempts}×` : ''}`;
  return (
    <div className="weft-node weft-node-container" data-weft-kind="retry">
      <div className="weft-node-title">
        {data.id}
        <span className="weft-node-badge">{badge}</span>
      </div>
    </div>
  );
}

export const RetryNode = memo(RetryNodeImpl);
