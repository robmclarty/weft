/**
 * Wrapper node for `compose` composers.
 *
 * `compose(name, inner)` exists to label a composite step in the trajectory
 * and the canvas. The user's chosen name lives in `config.display_name`; we
 * surface it as the prominent title and tag the kind subtly so the inner
 * implementation tree (a sequence, a parallel, etc) reads naturally beneath.
 *
 * Composes default to **collapsed** — the compose renders as a single
 * labeled block, and the inner subgraph stays hidden. Clicking the compose
 * (anywhere on its chrome) toggles expansion via WeftCanvas's `expanded_
 * composes` state, which re-runs `tree_to_graph` so the inner children
 * either materialize or disappear. The chevron on the right tracks the
 * current state. The collapsed read is the abstraction win — the user
 * sees one box instead of a buried subgraph until they ask for the
 * detail.
 *
 * The built-in composites in `@repo/composites` (`ensemble`, `tournament`,
 * `consensus`, `adversarial`) all surface as `compose` with their name in
 * `display_name`, so this single renderer covers them all.
 */

import { Handle, Position, type NodeProps } from '@xyflow/react';
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
  const expanded = data.is_expanded === true;
  if (expanded) {
    return (
      <div
        className={`weft-node weft-node-container weft-node-compose ${runtime_class(data.runtime)}`}
        data-weft-kind="compose"
        data-weft-expanded="true"
      >
        <div className="weft-node-header">
          <span className="weft-node-badge">
            <ComposeGlyph />compose
          </span>
          <div className="weft-node-title">{title}</div>
          <span className="weft-compose-chevron" aria-hidden="true">▾</span>
        </div>
        <RuntimeOverlay runtime={data.runtime} />
      </div>
    );
  }
  return (
    <div
      className={`weft-node weft-node-leaf weft-node-compose weft-node-compose-collapsed ${runtime_class(data.runtime)}`}
      data-weft-kind="compose"
      data-weft-expanded="false"
    >
      <Handle type="target" position={Position.Left} id="in" />
      <div className="weft-node-header">
        <span className="weft-node-badge">
          <ComposeGlyph />compose
        </span>
        <div className="weft-node-title">{title}</div>
        <span className="weft-compose-chevron" aria-hidden="true">▸</span>
      </div>
      <RuntimeOverlay runtime={data.runtime} />
      <Handle type="source" position={Position.Right} id="out" />
    </div>
  );
}

export const ComposeNode = memo(ComposeNodeImpl);
