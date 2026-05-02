/** @vitest-environment jsdom */

import { afterEach, describe, expect, it } from 'vitest';

import {
  dispatch_search,
  dispatch_search_result,
  matches_query,
  on_search_query,
} from './search.js';

afterEach(() => {
  document.body.removeAttribute('data-weft-search');
});

describe('matches_query', () => {
  it('returns false on empty / whitespace-only queries', () => {
    expect(matches_query('', { kind: 'step', id: 'fetch' })).toBe(false);
    expect(matches_query('   ', { kind: 'step', id: 'fetch' })).toBe(false);
  });

  it('matches on case-insensitive id substring', () => {
    expect(matches_query('FETCH', { kind: 'step', id: 'fetch_brief' })).toBe(true);
    expect(matches_query('brief', { kind: 'step', id: 'fetch_brief' })).toBe(true);
  });

  it('matches on case-insensitive kind exact', () => {
    expect(matches_query('Step', { kind: 'step', id: 'fetch' })).toBe(true);
    expect(matches_query('parallel', { kind: 'parallel', id: 'p1' })).toBe(true);
  });

  it('returns false when neither kind nor id matches', () => {
    expect(matches_query('xyz', { kind: 'step', id: 'fetch' })).toBe(false);
  });
});

describe('dispatch_search', () => {
  it('sets data-weft-search="active" when the query is non-empty', () => {
    dispatch_search('hello');
    expect(document.body.getAttribute('data-weft-search')).toBe('active');
  });

  it('removes data-weft-search when the query is empty / whitespace', () => {
    document.body.setAttribute('data-weft-search', 'active');
    dispatch_search('');
    expect(document.body.hasAttribute('data-weft-search')).toBe(false);
    document.body.setAttribute('data-weft-search', 'active');
    dispatch_search('   ');
    expect(document.body.hasAttribute('data-weft-search')).toBe(false);
  });

  it('dispatches a weft-search-query CustomEvent with the raw query', () => {
    let received: string | null = null;
    const off = on_search_query((q) => { received = q; });
    dispatch_search('  spaced  ');
    off();
    // The event detail is the raw query (untrimmed); only the body
    // attribute reflects the trimmed length.
    expect(received).toBe('  spaced  ');
  });
});

describe('on_search_query', () => {
  it('ignores non-CustomEvent firings of the same name', () => {
    let calls = 0;
    const off = on_search_query(() => { calls += 1; });
    window.dispatchEvent(new Event('weft-search-query'));
    expect(calls).toBe(0);
    off();
  });

  it('ignores CustomEvents whose detail.query is missing or non-string', () => {
    let calls = 0;
    const off = on_search_query(() => { calls += 1; });
    window.dispatchEvent(new CustomEvent('weft-search-query', { detail: {} }));
    window.dispatchEvent(
      new CustomEvent('weft-search-query', { detail: { query: 42 } }),
    );
    window.dispatchEvent(
      new CustomEvent('weft-search-query', { detail: null }),
    );
    expect(calls).toBe(0);
    off();
  });

  it('returns a no-op when window is undefined (covers the SSR guard)', () => {
    // Stub window to undefined for one call. The helper is meant to be
    // safe in environments that import the module without DOM globals.
    const original = globalThis.window;
    Object.defineProperty(globalThis, 'window', { value: undefined, configurable: true });
    try {
      const noop = on_search_query(() => { /* never */ });
      expect(typeof noop).toBe('function');
      expect(noop()).toBeUndefined();
    } finally {
      Object.defineProperty(globalThis, 'window', { value: original, configurable: true });
    }
  });
});

describe('dispatch_search_result', () => {
  it('dispatches a weft-search-result CustomEvent carrying the count', () => {
    let received: number | null | undefined;
    function listener(event: Event): void {
      if (event instanceof CustomEvent) {
        const detail = event.detail as { count?: number | null };
        received = detail.count;
      }
    }
    window.addEventListener('weft-search-result', listener);
    dispatch_search_result(7);
    expect(received).toBe(7);
    dispatch_search_result(null);
    expect(received).toBeNull();
    window.removeEventListener('weft-search-result', listener);
  });
});
