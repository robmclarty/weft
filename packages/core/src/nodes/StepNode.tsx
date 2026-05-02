/**
 * Leaf step node.
 *
 * Visual: prominent `id` label, secondary `<fn:name>` line, a single input
 * handle on the left and a single output handle on the right.
 *
 * Per spec §4.3 / constraints §3: this component does not import any other
 * node component. Sharing happens through `WeftNodeData` and helpers.
 */

import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { JSX } from 'react';
import { memo } from 'react';

import type { WeftNode } from '../transform/tree_to_graph.js';
import { StepGlyph } from './glyphs.js';
import { format_fn_ref, runtime_class } from './node_helpers.js';
import { RuntimeOverlay } from './RuntimeOverlay.js';

function StepNodeImpl({ data }: NodeProps<WeftNode>): JSX.Element {
  const fn_label = format_fn_ref(data.config?.['fn']);
  const display_name = data.meta?.display_name;
  return (
    <div
      className={`weft-node weft-node-leaf weft-node-step ${runtime_class(data.runtime)}`}
      data-weft-kind="step"
    >
      <Handle type="target" position={Position.Left} id="in" />
      <div className="weft-node-header">
        <span className="weft-node-badge"><StepGlyph />step</span>
        <div className="weft-node-title">{display_name ?? data.id}</div>
      </div>
      <div className="weft-node-subtitle">{fn_label}</div>
      <RuntimeOverlay runtime={data.runtime} />
      <Handle type="source" position={Position.Right} id="out" />
    </div>
  );
}

export const StepNode = memo(StepNodeImpl);
