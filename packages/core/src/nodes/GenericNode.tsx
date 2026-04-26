/**
 * Generic-fallback node.
 *
 * Renders any unknown `kind` so weft does not crash on a fascicle release that
 * predates this build (constraints §5.2, taste principle 5). The visible
 * "unknown kind" affordance is an amber-bordered card with a warning badge.
 *
 * Children still recurse: when the unknown kind has children, the transform
 * uses the generic chrome as a container. We render either shape based on the
 * input/output handles being needed; the layout adapter does not require us
 * to be aware of children here.
 */

import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { JSX } from 'react';
import { memo } from 'react';

import type { WeftNode } from '../transform/tree_to_graph.js';

function GenericNodeImpl({ data }: NodeProps<WeftNode>): JSX.Element {
  const is_warning = data.warning === 'cycle-guard';
  const cls = is_warning
    ? 'weft-node weft-node-generic'
    : 'weft-node weft-node-generic';
  const badge_cls = is_warning ? 'weft-node-badge weft-node-badge-warn' : 'weft-node-badge weft-node-badge-warn';
  return (
    <div className={cls} data-weft-kind={data.kind} data-weft-generic="true">
      <Handle type="target" position={Position.Left} id="in" />
      <div className="weft-node-title">
        {data.id}
        <span className={badge_cls}>
          {is_warning ? 'cycle-guard' : `unknown: ${data.kind}`}
        </span>
      </div>
      <div className="weft-node-subtitle">{data.kind}</div>
      <Handle type="source" position={Position.Right} id="out" />
    </div>
  );
}

export const GenericNode = memo(GenericNodeImpl);
