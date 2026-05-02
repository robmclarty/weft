/**
 * Checkpoint wrapper renders as a **marker** — a small glyph dot
 * positioned upstream of its wrapped child. The checkpoint key (`■
 * key_name`) rides on the checkpoint-key decoration edge from marker →
 * child. Subway-map convention: a station marker numbered with its key.
 *
 * Topologically the wrapped child is now a peer of the marker (lifted
 * by `tree_to_graph`); ELK lays them out as siblings.
 */

import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { JSX } from 'react';
import { memo } from 'react';

import type { WeftNode } from '../transform/tree_to_graph.js';
import { CheckpointGlyph } from './glyphs.js';
import { runtime_class } from './node_helpers.js';
import { RuntimeOverlay } from './RuntimeOverlay.js';

function CheckpointNodeImpl({ data }: NodeProps<WeftNode>): JSX.Element {
  return (
    <div
      className={`weft-node weft-node-marker weft-node-checkpoint ${runtime_class(data.runtime)}`}
      data-weft-kind="checkpoint"
      data-weft-presentation="marker"
    >
      <Handle type="target" position={Position.Left} id="in" />
      <span className="weft-node-marker-glyph" aria-hidden="true">
        <CheckpointGlyph />
      </span>
      <RuntimeOverlay runtime={data.runtime} />
      <Handle type="source" position={Position.Right} id="out" />
    </div>
  );
}

export const CheckpointNode = memo(CheckpointNodeImpl);
