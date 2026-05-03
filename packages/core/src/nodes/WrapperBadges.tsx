/**
 * Inline wrapper-badge row.
 *
 * Earlier iterations rendered every wrapper kind (`pipe`, `timeout`,
 * `checkpoint`, `map`) as a separate 44×44 marker dot adjacent to the
 * lifted step, with a decoration edge between marker and step. Visually
 * that meant the structural sequence chain ran *through* the markers,
 * never directly between black work-step blocks — which read as "lines
 * pointing at nothing" on dense graphs.
 *
 * `tree_to_graph` now attaches a `WrapperBadge[]` directly to the
 * lifted step's data; this component paints those badges as small chips
 * on the step itself. The chain is back to black-step → arrow →
 * black-step, with each step labeling its own wrappers in place.
 */

import type { JSX } from 'react';

import type { WrapperBadge } from '../transform/tree_to_graph.js';
import {
  CheckpointGlyph,
  MapGlyph,
  PipeGlyph,
  TimeoutGlyph,
} from './glyphs.js';

const GLYPH_FOR: Record<string, () => JSX.Element> = {
  pipe: PipeGlyph,
  timeout: TimeoutGlyph,
  checkpoint: CheckpointGlyph,
  map: MapGlyph,
};

export type WrapperBadgesProps = {
  readonly wrappers: ReadonlyArray<WrapperBadge>;
};

export function WrapperBadges({ wrappers }: WrapperBadgesProps): JSX.Element | null {
  if (wrappers.length === 0) return null;
  return (
    <div className="weft-wrapper-badges" aria-label="wrappers">
      {wrappers.map((w, i) => {
        const Glyph = GLYPH_FOR[w.kind];
        return (
          <span
            key={`${w.kind}:${String(i)}`}
            className={`weft-wrapper-badge weft-wrapper-badge-${w.kind}`}
            data-wrapper-kind={w.kind}
            data-wrapper-position={w.position}
          >
            {Glyph !== undefined ? <Glyph /> : null}
            <span className="weft-wrapper-badge-label">{w.label}</span>
          </span>
        );
      })}
    </div>
  );
}
