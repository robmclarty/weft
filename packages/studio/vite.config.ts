import { readFile } from 'node:fs/promises';
import { dirname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures_dir = resolve(here, '../../fixtures');

// Serve `/fixtures/*.json` from the repo root so the studio always picks
// up new fixtures without a copy step. Keeps `fixtures/` as the single
// source of truth across studio, scripts/, and test/e2e/.
function serve_root_fixtures(): Plugin {
  return {
    name: 'weft-serve-root-fixtures',
    configureServer(server) {
      server.middlewares.use('/fixtures', (req, res, next) => {
        const url = req.url ?? '';
        if (!url.endsWith('.json')) {
          next();
          return;
        }
        const safe = normalize(url).replace(/^[/\\]+/, '');
        if (safe.includes('..')) {
          res.statusCode = 400;
          res.end('bad request');
          return;
        }
        readFile(join(fixtures_dir, safe))
          .then((body) => {
            res.setHeader('content-type', 'application/json');
            res.end(body);
          })
          .catch(() => {
            next();
          });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), serve_root_fixtures()],
  server: {
    port: 5173,
    strictPort: true,
    host: '127.0.0.1',
  },
  preview: {
    port: 4173,
    strictPort: true,
    host: '127.0.0.1',
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
