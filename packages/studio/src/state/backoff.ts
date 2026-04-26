/**
 * Exponential-backoff-with-jitter scheduler for WebSocket reconnect.
 *
 * Per spec §5.5 / research F10:
 *   - delay = min(MAX_MS, BASE_MS * 2^attempt) + random(0..JITTER_MS)
 *   - reset attempt counter on successful connect
 *   - after MAX_ATTEMPTS, surface a manual reconnect button rather than
 *     keep retrying
 */

export const BACKOFF_BASE_MS = 500;
export const BACKOFF_MAX_MS = 30_000;
export const BACKOFF_JITTER_MS = 500;
export const BACKOFF_MAX_ATTEMPTS = 12;

export type BackoffRng = () => number;

export function next_backoff_delay(
  attempt: number,
  rng: BackoffRng = Math.random,
): number {
  const exponent = Math.min(attempt, 30);
  const exponential = BACKOFF_BASE_MS * 2 ** exponent;
  const capped = Math.min(BACKOFF_MAX_MS, exponential);
  const jitter = Math.floor(rng() * BACKOFF_JITTER_MS);
  return capped + jitter;
}

export function should_keep_retrying(attempt: number): boolean {
  return attempt < BACKOFF_MAX_ATTEMPTS;
}
