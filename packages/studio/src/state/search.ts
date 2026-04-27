/**
 * Search dispatch — header → canvas event channel.
 *
 * The header search box dispatches a `weft-search-query` CustomEvent with
 * the current query. CanvasShell listens, computes which graph nodes
 * match (by id substring or kind exact), tags their DOM with a marker
 * class, and reports back the count via `weft-search-result` so the
 * header can display "N matches".
 *
 * No global mutable state. The body's `data-weft-search` attribute is the
 * only ambient flag; the matching set lives in component state.
 */

export type SearchState = {
  readonly query: string;
  readonly count: number | null;
};

const QUERY_EVENT = 'weft-search-query';
const RESULT_EVENT = 'weft-search-result';
const BODY_ATTR = 'data-weft-search';

export function dispatch_search(query: string): void {
  if (typeof document === 'undefined') return;
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    document.body.removeAttribute(BODY_ATTR);
  } else {
    document.body.setAttribute(BODY_ATTR, 'active');
  }
  window.dispatchEvent(
    new CustomEvent<{ query: string }>(QUERY_EVENT, { detail: { query } }),
  );
}

export function dispatch_search_result(count: number | null): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<{ count: number | null }>(RESULT_EVENT, {
      detail: { count },
    }),
  );
}

export function on_search_query(
  handler: (query: string) => void,
): () => void {
  if (typeof window === 'undefined') return () => undefined;
  function listener(event: Event): void {
    if (!(event instanceof CustomEvent)) return;
    const detail: unknown = event.detail;
    if (
      typeof detail === 'object' &&
      detail !== null &&
      'query' in detail &&
      typeof detail.query === 'string'
    ) {
      handler(detail.query);
    }
  }
  window.addEventListener(QUERY_EVENT, listener);
  return () => {
    window.removeEventListener(QUERY_EVENT, listener);
  };
}

/** Match a node against the query: id substring (case-insensitive) OR kind exact. */
export function matches_query(
  query: string,
  node: { readonly kind: string; readonly id: string },
): boolean {
  const trimmed = query.trim().toLowerCase();
  if (trimmed.length === 0) return false;
  if (node.kind.toLowerCase() === trimmed) return true;
  return node.id.toLowerCase().includes(trimmed);
}
