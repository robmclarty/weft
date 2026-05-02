import { describe, expect, it } from 'vitest';

import {
  BACKOFF_BASE_MS,
  BACKOFF_JITTER_MS,
  BACKOFF_MAX_ATTEMPTS,
  BACKOFF_MAX_MS,
  next_backoff_delay,
  should_keep_retrying,
} from '../backoff.js';

const RNG_ZERO = (): number => 0;
const RNG_HALF = (): number => 0.5;

describe('next_backoff_delay', () => {
  it('grows exponentially with attempt', () => {
    expect(next_backoff_delay(0, RNG_ZERO)).toBe(BACKOFF_BASE_MS);
    expect(next_backoff_delay(1, RNG_ZERO)).toBe(BACKOFF_BASE_MS * 2);
    expect(next_backoff_delay(2, RNG_ZERO)).toBe(BACKOFF_BASE_MS * 4);
    expect(next_backoff_delay(3, RNG_ZERO)).toBe(BACKOFF_BASE_MS * 8);
  });

  it('caps at BACKOFF_MAX_MS', () => {
    // 500 * 2^7 = 64000 → capped at 30000
    expect(next_backoff_delay(7, RNG_ZERO)).toBe(BACKOFF_MAX_MS);
    expect(next_backoff_delay(20, RNG_ZERO)).toBe(BACKOFF_MAX_MS);
  });

  it('adds jitter from the rng', () => {
    expect(next_backoff_delay(0, RNG_HALF)).toBe(
      BACKOFF_BASE_MS + Math.floor(BACKOFF_JITTER_MS * 0.5),
    );
  });

  it('falls back to Math.random when rng is omitted', () => {
    const value = next_backoff_delay(0);
    expect(value).toBeGreaterThanOrEqual(BACKOFF_BASE_MS);
    expect(value).toBeLessThan(BACKOFF_BASE_MS + BACKOFF_JITTER_MS);
  });
});

describe('should_keep_retrying', () => {
  it('returns true below the cap', () => {
    expect(should_keep_retrying(0)).toBe(true);
    expect(should_keep_retrying(BACKOFF_MAX_ATTEMPTS - 1)).toBe(true);
  });

  it('returns false at and above the cap', () => {
    expect(should_keep_retrying(BACKOFF_MAX_ATTEMPTS)).toBe(false);
    expect(should_keep_retrying(BACKOFF_MAX_ATTEMPTS + 1)).toBe(false);
  });
});
