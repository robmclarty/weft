/**
 * Pipe wrapper renders as a **marker** — a small glyph-on-a-dot that sits
 * on the line just downstream of the wrapped child. The pipe's tail
 * transform (`<fn:name>`) rides on the inbound edge from the child to
 * this marker, drawn by `PipeEdge`. Subway-map convention: pipe is a
 * station, not a bay.
 *
 * Topologically, the wrapped child is now a peer of the marker (lifted
 * by `tree_to_graph` so its `parentId` matches the marker's, not the
 * marker itself). ELK lays them out as siblings; the structural chain
 * runs `pred → child → marker → succ`.
 *
 * Per constraints §3 the component does not import any other node-type
 * component; shared marker chrome lives in `canvas.css` under
 * `.weft-node-marker`.
 */

import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { JSX } from 'react';
import { memo } from 'react';

import type { WeftNode } from '../transform/tree_to_graph.js';
import { PipeGlyph } from './glyphs.js';
import { runtime_class } from './node_helpers.js';
import { RuntimeOverlay } from './RuntimeOverlay.js';

function PipeNodeImpl({ data }: NodeProps<WeftNode>): JSX.Element {
  return (
    <div
      className={`weft-node weft-node-marker weft-node-pipe ${runtime_class(data.runtime)}`}
      data-weft-kind="pipe"
      data-weft-presentation="marker"
    >
      <Handle type="target" position={Position.Left} id="in" />
      <span className="weft-node-marker-glyph" aria-hidden="true">
        <PipeGlyph />
      </span>
      <RuntimeOverlay runtime={data.runtime} />
      <Handle type="source" position={Position.Right} id="out" />
    </div>
  );
}

export const PipeNode = memo(PipeNodeImpl);
