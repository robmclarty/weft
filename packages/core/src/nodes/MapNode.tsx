/**
 * Map wrapper renders as a **marker** — a small glyph dot positioned
 * upstream of its wrapped child. The cardinality / concurrency (`× n`)
 * rides on the map-cardinality decoration edge from marker → child,
 * which itself draws as a dashed-track stroke (railroad-tie pattern) to
 * read as "this is the per-item fan." Subway-map convention: a junction
 * with a count.
 *
 * Topologically the wrapped child is now a peer of the marker (lifted
 * by `tree_to_graph`); ELK lays them out as siblings.
 */

import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { JSX } from 'react';
import { memo } from 'react';

import type { WeftNode } from '../transform/tree_to_graph.js';
import { MapGlyph } from './glyphs.js';
import { runtime_class } from './node_helpers.js';
import { RuntimeOverlay } from './RuntimeOverlay.js';

function MapNodeImpl({ data }: NodeProps<WeftNode>): JSX.Element {
  return (
    <div
      className={`weft-node weft-node-marker weft-node-map ${runtime_class(data.runtime)}`}
      data-weft-kind="map"
      data-weft-presentation="marker"
    >
      <Handle type="target" position={Position.Left} id="in" />
      <span className="weft-node-marker-glyph" aria-hidden="true">
        <MapGlyph />
      </span>
      <RuntimeOverlay runtime={data.runtime} />
      <Handle type="source" position={Position.Right} id="out" />
    </div>
  );
}

export const MapNode = memo(MapNodeImpl);
