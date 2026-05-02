/**
 * Parallel renders as a teal diamond junction — the per-key children are
 * lifted to peers by `tree_to_graph`, with one outgoing port per branch
 * preserving declaration order via ELK's FIXED_ORDER constraint
 * (`elk_options_for` in `elk_runner.ts` keys on `data.kind === 'parallel'`).
 *
 * The handles still emit `out:<key>` so the layout adapter can mirror
 * them onto the ELK graph; the JSX just no longer wraps a container
 * chrome around the children.
 */

import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { JSX } from 'react';
import { memo } from 'react';

import type { WeftNode } from '../transform/tree_to_graph.js';
import { ParallelGlyph } from './glyphs.js';
import { read_string_array_field, runtime_class } from './node_helpers.js';
import { RuntimeOverlay } from './RuntimeOverlay.js';

function ParallelNodeImpl({ data }: NodeProps<WeftNode>): JSX.Element {
  const keys = read_string_array_field(data.config, 'keys') ?? [];
  return (
    <div
      className={`weft-node weft-node-junction weft-node-parallel ${runtime_class(data.runtime)}`}
      data-weft-kind="parallel"
      data-weft-presentation="junction"
    >
      <Handle type="target" position={Position.Left} id="in" />
      <svg viewBox="0 0 56 56" aria-hidden="true">
        <polygon
          points="28,2 54,28 28,54 2,28"
          fill="var(--weft-parallel-fill)"
          stroke="var(--weft-parallel-accent)"
          strokeWidth="2"
        />
      </svg>
      <span className="weft-node-junction-glyph" style={{ color: 'var(--weft-parallel-on)' }}>
        <ParallelGlyph />
      </span>
      <RuntimeOverlay runtime={data.runtime} />
      {keys.map((key) => (
        <Handle
          key={key}
          type="source"
          position={Position.Right}
          id={`out:${key}`}
          data-weft-port-key={key}
        />
      ))}
    </div>
  );
}

export const ParallelNode = memo(ParallelNodeImpl);
