/**
 * jsdom test setup for canvas/nodes component tests.
 *
 * jsdom omits browser APIs React Flow assumes exist. This file polyfills
 * just enough of them so the render tree mounts without throwing. The
 * polyfills are not faithful — they're stubs that satisfy "function exists,
 * returns plausible defaults". For asserting on measured layout (handle
 * bounding boxes, ELK-positioned coordinates), use the `browser` project
 * instead, which runs the same specs in real Chromium.
 */

import { afterEach } from 'vitest';

const g = globalThis as Record<string, unknown>;

g['IS_REACT_ACT_ENVIRONMENT'] = true;

const noop_observer = function noop_observer(): {
  observe: () => void;
  unobserve: () => void;
  disconnect: () => void;
} {
  return {
    observe: () => undefined,
    unobserve: () => undefined,
    disconnect: () => undefined,
  };
};

if (typeof g['ResizeObserver'] === 'undefined') {
  g['ResizeObserver'] = noop_observer;
}
if (typeof g['IntersectionObserver'] === 'undefined') {
  g['IntersectionObserver'] = noop_observer;
}

const dommatrix_stub = (): Record<string, unknown> => ({
  a: 1, b: 0, c: 0, d: 1, e: 0, f: 0,
  m11: 1, m22: 1, m33: 1, m44: 1,
  is2D: true, isIdentity: true,
});

if (typeof g['DOMMatrixReadOnly'] === 'undefined') {
  g['DOMMatrixReadOnly'] = dommatrix_stub;
}
if (typeof g['DOMMatrix'] === 'undefined') {
  g['DOMMatrix'] = dommatrix_stub;
}

const noop_scroll = function noop_scroll(): void { /* polyfill */ };
if (typeof Element !== 'undefined' && typeof Element.prototype.scrollIntoView === 'undefined') {
  Element.prototype.scrollIntoView = noop_scroll;
}

afterEach(() => {
  document.body.innerHTML = '';
});
