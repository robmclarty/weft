/**
 * App shell — router + nav header + global search wiring.
 *
 * The search box is wired through a tiny event-bus pattern: the header sets
 * a `data-weft-search` attribute on the body and dispatches a CustomEvent
 * the canvas listens for to apply per-node match classes. This keeps search
 * state out of every route's prop tree without adding a global store.
 */

import { useCallback, useEffect, useState, type JSX } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';

import { EmptyRoute } from './routes/EmptyRoute.js';
import { ViewRoute } from './routes/ViewRoute.js';
import { WatchRoute } from './routes/WatchRoute.js';
import { ShortcutsModal } from './components/ShortcutsModal.js';
import { dispatch_search, type SearchState } from './state/search.js';

export const SEARCH_INPUT_ID = 'weft-search-input';

export function App(): JSX.Element {
  const [query, set_query] = useState('');
  const [count, set_count] = useState<SearchState['count']>(null);
  const [help_open, set_help_open] = useState(false);

  useEffect(() => {
    function handler(event: Event): void {
      if (!(event instanceof CustomEvent)) return;
      const detail: unknown = event.detail;
      if (
        typeof detail === 'object' &&
        detail !== null &&
        'count' in detail &&
        (typeof detail.count === 'number' || detail.count === null)
      ) {
        set_count(detail.count);
      }
    }
    window.addEventListener('weft-search-result', handler);
    return () => {
      window.removeEventListener('weft-search-result', handler);
    };
  }, []);

  useEffect(() => {
    function on_key(event: KeyboardEvent): void {
      const target = event.target;
      const tag = target instanceof HTMLElement ? target.tagName.toLowerCase() : '';
      const editing = tag === 'input' || tag === 'textarea' || tag === 'select';
      if (event.key === '?' && !editing) {
        set_help_open((prev) => !prev);
        event.preventDefault();
        return;
      }
      if (event.key === 'Escape' && help_open) {
        set_help_open(false);
        event.preventDefault();
      }
    }
    window.addEventListener('keydown', on_key);
    return () => {
      window.removeEventListener('keydown', on_key);
    };
  }, [help_open]);

  const apply_search = useCallback((next_query: string) => {
    set_query(next_query);
    dispatch_search(next_query);
  }, []);

  const open_help = useCallback(() => {
    set_help_open(true);
  }, []);

  const close_help = useCallback(() => {
    set_help_open(false);
  }, []);

  return (
    <div className="weft-app">
      <header className="weft-header">
        <h1>weft studio</h1>
        <nav>
          <NavLink to="/" end>empty</NavLink>
          <NavLink to="/view">view</NavLink>
          <NavLink to="/watch">watch</NavLink>
        </nav>
        <div className="weft-search-wrap">
          <input
            id={SEARCH_INPUT_ID}
            type="search"
            placeholder="search nodes (id or kind)"
            className="weft-search-box"
            aria-label="search"
            value={query}
            onChange={(event) => {
              apply_search(event.target.value);
            }}
          />
          {query.trim().length > 0 && count !== null ? (
            <span className="weft-search-count" data-weft-search-count="true">
              {count}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          className="weft-help-pill"
          aria-label="keyboard shortcuts"
          title="keyboard shortcuts (?)"
          onClick={open_help}
        >
          ?
        </button>
      </header>
      <Routes>
        <Route path="/" element={<EmptyRoute />} />
        <Route path="/view" element={<ViewRoute />} />
        <Route path="/watch" element={<WatchRoute />} />
      </Routes>
      <ShortcutsModal open={help_open} on_close={close_help} />
    </div>
  );
}
