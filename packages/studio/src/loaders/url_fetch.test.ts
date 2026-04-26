/**
 * url_fetch tests.
 *
 * The unit-level URL-fetch test (AC 6) uses MSW for the success and
 * CORS-failing branches. Network-touching MSW depends on Node's `fetch`
 * being interceptable; here we use a simpler `fetch_impl` injection
 * pattern that achieves the same goal without the MSW server lifecycle.
 * The MSW-driven path is exercised in the e2e suite via Playwright's
 * `page.route` (see `test/e2e/url_fetch.spec.ts`).
 */

import { describe, expect, it, vi } from 'vitest';

import {
  fetch_src_payload,
  validate_src_url,
  type FetchLike,
} from './url_fetch.js';

describe('validate_src_url', () => {
  it('accepts https://example.com', () => {
    const r = validate_src_url('https://example.com/flow.json');
    expect(r.ok).toBe(true);
  });

  it('accepts http://localhost', () => {
    const r = validate_src_url('http://localhost:5173/flow.json');
    expect(r.ok).toBe(true);
  });

  it('accepts http://127.0.0.1', () => {
    const r = validate_src_url('http://127.0.0.1:5173/flow.json');
    expect(r.ok).toBe(true);
  });

  it('rejects file: scheme', () => {
    const r = validate_src_url('file:///tmp/flow.json');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('forbidden_scheme');
  });

  it('rejects javascript: scheme', () => {
    const r = validate_src_url('javascript:alert(1)');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('forbidden_scheme');
  });

  it('rejects data: scheme', () => {
    const r = validate_src_url('data:application/json,{"a":1}');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('forbidden_scheme');
  });

  it('rejects http://example.com (non-localhost)', () => {
    const r = validate_src_url('http://example.com/flow.json');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('forbidden_origin');
  });

  it('rejects malformed URLs', () => {
    const r = validate_src_url('not a url');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('invalid_url');
  });
});

describe('fetch_src_payload', () => {
  it('returns ok with parsed JSON on success', async () => {
    const fake: FetchLike = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => '{"version":1,"root":{"kind":"step","id":"a"}}',
    }));
    const r = await fetch_src_payload('https://example.com/flow.json', fake);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload).toEqual({
        version: 1,
        root: { kind: 'step', id: 'a' },
      });
    }
    expect(fake).toHaveBeenCalledWith('https://example.com/flow.json', {
      credentials: 'omit',
      redirect: 'error',
    });
  });

  it('returns forbidden_scheme without invoking fetch', async () => {
    const fake: FetchLike = vi.fn();
    const r = await fetch_src_payload('file:///etc/hosts', fake);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('forbidden_scheme');
    expect(fake).not.toHaveBeenCalled();
  });

  it('returns fetch_failed on a thrown error and includes the watch CLI hint', async () => {
    const fake: FetchLike = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const r = await fetch_src_payload('https://example.com/flow.json', fake);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('fetch_failed');
      expect(r.message).toContain('watch CLI');
    }
  });

  it('returns fetch_failed on non-2xx', async () => {
    const fake: FetchLike = vi.fn(async () => ({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: async () => '',
    }));
    const r = await fetch_src_payload('https://example.com/flow.json', fake);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('fetch_failed');
      expect(r.message).toContain('404');
    }
  });

  it('returns parse_failed when the body is not JSON', async () => {
    const fake: FetchLike = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => 'not json',
    }));
    const r = await fetch_src_payload('https://example.com/flow.json', fake);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('parse_failed');
  });
});
