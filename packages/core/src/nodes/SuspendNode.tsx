/**
 * Leaf node for `suspend` composers — human-in-the-loop pause.
 *
 * Suspends do not have children; the resume id is the load-bearing fact, so
 * we surface it directly in the badge and reuse the node id as the title.
 */

import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { JSX } from 'react';
import { memo } from 'react';

import type { WeftNode } from '../transform/tree_to_graph.js';
import { SuspendGlyph } from './glyphs.js';
import { read_string_field, runtime_class } from './node_helpers.js';
import { RuntimeOverlay } from './RuntimeOverlay.js';

function SuspendNodeImpl({ data }: NodeProps<WeftNode>): JSX.Element {
  const resume_id = read_string_field(data.config, 'id');
  const display_name = data.meta?.display_name;
  return (
    <div
      className={`weft-node weft-node-leaf weft-node-suspend ${runtime_class(data.runtime)}`}
      data-weft-kind="suspend"
    >
      <Handle type="target" position={Position.Left} id="in" />
      <div className="weft-node-header">
        <span className="weft-node-badge">
          <SuspendGlyph />suspend
        </span>
        <div className="weft-node-title">{display_name ?? data.id}</div>
      </div>
      <div className="weft-node-subtitle">resume: {resume_id ?? '(unset)'}</div>
      <RuntimeOverlay runtime={data.runtime} />
      <Handle type="source" position={Position.Right} id="out" />
    </div>
  );
}

export const SuspendNode = memo(SuspendNodeImpl);
