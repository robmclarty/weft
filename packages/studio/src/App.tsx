/**
 * App shell — router + nav header.
 */

import type { JSX } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';

import { EmptyRoute } from './routes/EmptyRoute.js';
import { ViewRoute } from './routes/ViewRoute.js';
import { WatchRoute } from './routes/WatchRoute.js';

export const SEARCH_INPUT_ID = 'weft-search-input';

export function App(): JSX.Element {
  return (
    <div className="weft-app">
      <header className="weft-header">
        <h1>weft studio</h1>
        <nav>
          <NavLink to="/">empty</NavLink>
          <NavLink to="/view">view</NavLink>
          <NavLink to="/watch">watch</NavLink>
        </nav>
        <input
          id={SEARCH_INPUT_ID}
          type="search"
          placeholder="search nodes (id or kind)"
          className="weft-search-box"
          aria-label="search"
        />
      </header>
      <Routes>
        <Route path="/" element={<EmptyRoute />} />
        <Route path="/view" element={<ViewRoute />} />
        <Route path="/watch" element={<WatchRoute />} />
      </Routes>
    </div>
  );
}
