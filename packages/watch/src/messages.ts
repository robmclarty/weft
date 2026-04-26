/**
 * WebSocket message envelope sent from the watch CLI to studio clients.
 *
 * The `kind` discriminator allows the protocol to grow without breaking
 * clients (per spec §5.5). v0 ships three kinds; v1 will add overlay-event
 * kinds alongside these.
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
    };
