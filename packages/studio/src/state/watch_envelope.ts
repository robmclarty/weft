/**
 * WebSocket envelope shape consumed from `weft-watch`.
 *
 * Mirrored locally so the studio does not need to import `@repo/watch`
 * (which would pull chokidar / ws / commander into the studio bundle for
 * no benefit). The authoritative definition lives in
 * `packages/watch/src/messages.ts`; if that file changes, this one must
 * change in lockstep. The phase 4 schema-parity test guarantees the
 * `tree` payload's shape; the discriminator is small enough to duplicate.
 */

import type { FlowTree } from '@repo/weft';

export type WatchUnreachableReason = 'deleted' | 'moved' | 'read_error';

export type WatchEnvelope =
  | { readonly kind: 'tree'; readonly tree: FlowTree }
  | {
      readonly kind: 'unreachable';
      readonly reason: WatchUnreachableReason;
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

function get(value: object, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(value, key)
    ? Reflect.get(value, key)
    : undefined;
}

export function is_watch_envelope(raw: unknown): raw is WatchEnvelope {
  if (typeof raw !== 'object' || raw === null) return false;
  const kind = get(raw, 'kind');
  if (kind === 'tree') return get(raw, 'tree') !== undefined;
  if (kind === 'unreachable') {
    return (
      typeof get(raw, 'reason') === 'string' &&
      typeof get(raw, 'path') === 'string'
    );
  }
  if (kind === 'invalid') {
    return (
      typeof get(raw, 'path') === 'string' &&
      typeof get(raw, 'zod_path') === 'string' &&
      typeof get(raw, 'message') === 'string'
    );
  }
  if (kind === 'event') {
    const event = get(raw, 'event');
    return typeof event === 'object' && event !== null;
  }
  return false;
}
