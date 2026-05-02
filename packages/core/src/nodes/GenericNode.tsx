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
 *
 * Two variants distinguished by `data.warning`:
 *   - `cycle-guard` — the transform's visited-set guard fired, signaling a
 *     cycle in the input that fascicle did not flag. Badge labels accordingly.
 *   - default (no warning) — the kind is unknown to this weft version.
 */

import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { JSX } from 'react';
import { memo } from 'react';

import type { WeftNode } from '../transform/tree_to_graph.js';
import { CycleGlyph, WarnGlyph } from './glyphs.js';
import { runtime_class } from './node_helpers.js';
import { RuntimeOverlay } from './RuntimeOverlay.js';

function GenericNodeImpl({ data }: NodeProps<WeftNode>): JSX.Element {
  const is_cycle_guard = data.warning === 'cycle-guard';
  return (
    <div
      className={`weft-node weft-node-leaf weft-node-generic ${runtime_class(data.runtime)}`}
      data-weft-kind={data.kind}
      data-weft-generic="true"
    >
      <Handle type="target" position={Position.Left} id="in" />
      <div className="weft-node-header">
        <span className="weft-node-badge weft-node-badge-warn">
          {is_cycle_guard ? <CycleGlyph /> : <WarnGlyph />}
          {is_cycle_guard ? 'cycle-guard' : `unknown: ${data.kind}`}
        </span>
        <div className="weft-node-title">{data.id}</div>
      </div>
      <RuntimeOverlay runtime={data.runtime} />
      <Handle type="source" position={Position.Right} id="out" />
    </div>
  );
}

export const GenericNode = memo(GenericNodeImpl);
