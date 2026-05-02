/**
 * Per-node overlay for runtime state.
 *
 * Renders the small affordances every node shares when it carries a non-empty
 * `NodeRuntimeState`: a cost badge in the bottom-right corner, an error tag
 * pinned next to the title when a span ended with an error, and an emit flash
 * keyed off `last_emit_ts`. The "active" pulse is purely a CSS effect driven
 * by `weft-runtime-active` on the chrome element; nothing to render here.
 *
 * Components import this *helper* — they do not import each other (per
 * constraints §3). It mirrors the pattern of `glyphs.tsx` and
 * `node_helpers.ts`.
 */

import type { JSX } from 'react';

import type { NodeRuntimeState } from '../runtime_state.js';
import { format_cost } from './node_helpers.js';

export type RuntimeOverlayProps = {
  readonly runtime: NodeRuntimeState | undefined;
};

export function RuntimeOverlay({ runtime }: RuntimeOverlayProps): JSX.Element | null {
  if (runtime === undefined) return null;
  const cost_label = format_cost(runtime.cost_usd);
  const has_error = runtime.error !== null;
  if (!has_error && cost_label === '' && runtime.last_emit_ts === null) return null;
  return (
    <>
      {has_error ? (
        <span
          className="weft-runtime-error-tag"
          data-weft-runtime-error="true"
          title={runtime.error ?? ''}
        >
          error
        </span>
      ) : null}
      {cost_label !== '' ? (
        <span className="weft-runtime-cost" data-weft-runtime-cost="true">
          {cost_label}
        </span>
      ) : null}
      {runtime.last_emit_ts !== null ? (
        <span
          className="weft-runtime-emit-pulse"
          data-weft-runtime-emit={runtime.last_emit_ts}
          aria-hidden="true"
        />
      ) : null}
    </>
  );
}
