import { readFile } from 'node:fs/promises';
import { dirname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const examples_dir = resolve(here, '../../examples');

// Serve `/examples/*.json` from the repo root so the studio always picks
// up new examples without a copy step. Keeps `examples/` as the single
// source of truth across studio, scripts/, and test/e2e/.
function serve_root_examples(): Plugin {
  return {
    name: 'weft-serve-root-examples',
    configureServer(server) {
      server.middlewares.use('/examples', (req, res, next) => {
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
        readFile(join(examples_dir, safe))
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
  plugins: [react(), serve_root_examples()],
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
