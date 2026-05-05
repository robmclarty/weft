/**
 * ESM resolution hook for `spawn_watch`.
 *
 * Node v24 strips TS types automatically but does *not* rewrite `.js`
 * import specifiers to their `.ts` source counterparts. Source files in
 * this repo follow the NodeNext convention (`import x from './y.js'`
 * pointing at `y.ts`), which works fine when bundled via Vite/tsc but
 * breaks when running source directly with `node`. This hook fills the
 * gap by falling back to `.ts` / `.tsx` when the requested `.js` / `.jsx`
 * specifier is missing.
 *
 * Wired in via `node --import file:test/e2e/lib/strip_types_resolver.mjs`.
 */

import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';

const EXTENSION_MAP = new Map([
  ['.js', '.ts'],
  ['.jsx', '.tsx'],
  ['.mjs', '.mts'],
  ['.cjs', '.cts'],
]);

const HOOK_SOURCE = `
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const EXTENSION_MAP = new Map([
  ['.js', '.ts'],
  ['.jsx', '.tsx'],
  ['.mjs', '.mts'],
  ['.cjs', '.cts'],
]);

export async function resolve(specifier, context, next_resolve) {
  try {
    return await next_resolve(specifier, context);
  } catch (err) {
    if (err?.code !== 'ERR_MODULE_NOT_FOUND') throw err;
    for (const [from, to] of EXTENSION_MAP) {
      if (!specifier.endsWith(from)) continue;
      const candidate = specifier.slice(0, -from.length) + to;
      try {
        const result = await next_resolve(candidate, context);
        if (result?.url !== undefined) {
          const path = fileURLToPath(result.url);
          if (existsSync(path)) return result;
        }
      } catch {
        // try next mapping
      }
    }
    throw err;
  }
}
`;

register(`data:text/javascript;base64,${Buffer.from(HOOK_SOURCE).toString('base64')}`, pathToFileURL('./'));

// Mark imports/exports as touched so static analysers don't strip them.
void existsSync;
void fileURLToPath;
