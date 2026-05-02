/**
 * Wrapper node for `map` composers — per-item execution.
 *
 * Visual: container chrome with a stacked-rows glyph and the concurrency cap
 * when one is configured.
 */

import type { NodeProps } from '@xyflow/react';
import type { JSX } from 'react';
import { memo } from 'react';

import type { WeftNode } from '../transform/tree_to_graph.js';
import { MapGlyph } from './glyphs.js';
import { read_number_field, runtime_class } from './node_helpers.js';
import { RuntimeOverlay } from './RuntimeOverlay.js';

function MapNodeImpl({ data }: NodeProps<WeftNode>): JSX.Element {
  const concurrency = read_number_field(data.config, 'concurrency');
  const display_name = data.meta?.display_name;
  return (
    <div
      className={`weft-node weft-node-container weft-node-map ${runtime_class(data.runtime)}`}
      data-weft-kind="map"
    >
      <div className="weft-node-header">
        <span className="weft-node-badge">
          <MapGlyph />map{concurrency === undefined ? '' : ` · ${concurrency}/at-once`}
        </span>
        <div className="weft-node-title">{display_name ?? data.id}</div>
      </div>
      <RuntimeOverlay runtime={data.runtime} />
    </div>
  );
}

export const MapNode = memo(MapNodeImpl);
