import { describe, expect, it } from 'vitest';

import { is_watch_envelope } from '../watch_envelope.js';

describe('is_watch_envelope', () => {
  it('accepts a tree envelope', () => {
    expect(
      is_watch_envelope({
        kind: 'tree',
        tree: { version: 1, root: { kind: 'step', id: 'a' } },
      }),
    ).toBe(true);
  });

  it('accepts an unreachable envelope', () => {
    expect(
      is_watch_envelope({
        kind: 'unreachable',
        reason: 'deleted',
        path: '/tmp/x',
      }),
    ).toBe(true);
  });

  it('accepts an invalid envelope', () => {
    expect(
      is_watch_envelope({
        kind: 'invalid',
        path: '/tmp/x',
        zod_path: '$.root',
        message: 'bad',
      }),
    ).toBe(true);
  });

  it('rejects unknown kinds', () => {
    expect(is_watch_envelope({ kind: 'never' })).toBe(false);
  });

  it('rejects non-objects', () => {
    expect(is_watch_envelope(null)).toBe(false);
    expect(is_watch_envelope('hi')).toBe(false);
    expect(is_watch_envelope(42)).toBe(false);
  });

  it('rejects an unreachable without reason or path', () => {
    expect(is_watch_envelope({ kind: 'unreachable' })).toBe(false);
    expect(
      is_watch_envelope({ kind: 'unreachable', reason: 'deleted' }),
    ).toBe(false);
  });

  it('rejects an invalid envelope without all fields', () => {
    expect(
      is_watch_envelope({ kind: 'invalid', path: '/tmp/x' }),
    ).toBe(false);
  });
});
