/**
 * WebSocket message envelope sent from the watch CLI to studio clients.
 *
 * The `kind` discriminator allows the protocol to grow without breaking
 * clients (per spec §5.5). v0 shipped three kinds (`tree`, `unreachable`,
 * `invalid`) for streaming the static structure. v1 adds `event` for
 * trajectory-event overlays (active/error/emit/cost) — older CLIs that don't
 * produce them are forward-compatible because the studio's reducer ignores
 * absent envelopes.
 *
 * The `event` payload is intentionally typed as `Record<string, unknown>` at
 * this boundary: the watch CLI is a passthrough proxy and does not interpret
 * trajectory events. The studio (which depends on `@repo/core`) parses them
 * through `trajectory_event_schema` on receipt. Keeping the schema out of
 * `@repo/watch` preserves the published `@robmclarty/weft-watch` install
 * graph (zod + ws + chokidar; no React peers).
 */

import type { FlowTree } from './schemas.js';

export type UnreachableReason = 'deleted' | 'moved' | 'read_error';

export type WeftWatchMessage =
  | { readonly kind: 'tree'; readonly tree: FlowTree }
  | {
      readonly kind: 'unreachable';
      readonly reason: UnreachableReason;
      readonly path: string;
    }
  | {
      readonly kind: 'invalid';
      readonly path: string;
      readonly zod_path: string;
      readonly message: string;
    }
  | {
      readonly kind: 'event';
      readonly event: Readonly<Record<string, unknown>>;
    };
