/**
 * Shared test utilities. Not part of the public surface.
 *
 * Excluded from coverage and the published umbrella; this file exists only
 * for the colocated test files inside @repo/core.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures_dir = join(here, '..', '..', '..', 'fixtures');

export function load_fixture_raw(name: string): unknown {
  const path = join(fixtures_dir, name);
  return JSON.parse(readFileSync(path, 'utf8'));
}
