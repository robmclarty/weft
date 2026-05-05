/**
 * WebSocket message envelope sent from the watch CLI to studio clients.
 *
 * The `kind` discriminator allows the protocol to grow without breaking
 * clients (per spec §5.5). v0 shipped three kinds (`tree`, `unreachable`,
 * `invalid`) for streaming the static structure. v1 adds two more for
 * trajectory-event overlays:
 *
 *   - `event`           a parsed JSONL line, validated against
 *                       `trajectory_event_schema`. Studio feeds it through
 *                       `derive_runtime_state`.
 *   - `events_invalid`  a JSONL line that failed JSON.parse or zod validation.
 *                       Studio surfaces it as a banner; the tail keeps
 *                       running so subsequent valid lines still flow.
 *
 * The CLI mirrors `trajectory_event_schema` locally (see
 * `trajectory_event_schema.ts`) so it can validate per line without pulling
 * `@repo/core` into the published install graph. Older studios stay forward-
 * compatible because `is_watch_envelope` drops unknown kinds on the floor.
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
    }
  | {
      readonly kind: 'events_invalid';
      readonly path: string;
      readonly line_number: number;
      readonly message: string;
    };
