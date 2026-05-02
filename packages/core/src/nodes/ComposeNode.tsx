/**
 * Wrapper node for `compose` composers.
 *
 * `compose(name, inner)` exists to label a composite step in the trajectory and
 * the canvas. The user's chosen name lives in `config.display_name`; we
 * surface it as the prominent title and tag the kind subtly so the inner
 * implementation tree (a sequence, a parallel, etc) reads naturally beneath.
 *
 * The built-in composites in `@repo/composites` (`ensemble`, `tournament`,
 * `consensus`, `adversarial`) all surface as `compose` with their name in
 * `display_name`, so this single renderer covers them all.
 */

import type { NodeProps } from '@xyflow/react';
import type { JSX } from 'react';
import { memo } from 'react';

import type { WeftNode } from '../transform/tree_to_graph.js';
import { ComposeGlyph } from './glyphs.js';
import { read_string_field, runtime_class } from './node_helpers.js';
import { RuntimeOverlay } from './RuntimeOverlay.js';

function ComposeNodeImpl({ data }: NodeProps<WeftNode>): JSX.Element {
  const display_name =
    data.meta?.display_name ?? read_string_field(data.config, 'display_name');
  const title = display_name ?? data.id;
  return (
    <div
      className={`weft-node weft-node-container weft-node-compose ${runtime_class(data.runtime)}`}
      data-weft-kind="compose"
    >
      <div className="weft-node-header">
        <span className="weft-node-badge">
          <ComposeGlyph />compose
        </span>
        <div className="weft-node-title">{title}</div>
      </div>
      <RuntimeOverlay runtime={data.runtime} />
    </div>
  );
}

export const ComposeNode = memo(ComposeNodeImpl);
