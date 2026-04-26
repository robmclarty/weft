/**
 * Vite entry. Mounts <App /> against #root.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import { App } from './App.js';

// eslint-disable-next-line import/no-unassigned-import -- side-effect CSS import
import './index.css';

const root_el = document.getElementById('root');
if (root_el === null) {
  throw new Error('weft studio: missing #root element');
}

createRoot(root_el).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
