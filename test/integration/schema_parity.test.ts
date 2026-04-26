/**
 * Schema parity test.
 *
 * Constraints §3 forbids @repo/watch from importing @repo/core or @repo/weft,
 * so the watch CLI carries its own copy of the FlowNode / FlowTree zod
 * schemas. That duplication is safe only as long as the two schemas accept
 * and reject identical inputs. This test loads every fixture in fixtures/
 * (plus a curated set of negative cases) and asserts that the umbrella's
 * schema and the watch CLI's schema agree on each one.
 *
 * If this test fails, do not "fix" it by relaxing one side. Reconcile the
 * shapes; the parity contract is load-bearing for the studio↔CLI handshake.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  flow_tree_schema as core_flow_tree_schema,
  flow_node_schema as core_flow_node_schema,
} from '@repo/weft';
import {
  flow_tree_schema as watch_flow_tree_schema,
  flow_node_schema as watch_flow_node_schema,
} from '@repo/watch';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures_dir = join(here, '..', '..', 'fixtures');

function load_json(file: string): unknown {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function format_path(path: ReadonlyArray<PropertyKey>): string {
  return path.map((seg) => String(seg)).join('.');
}

const fixture_files = readdirSync(fixtures_dir).filter((f) => f.endsWith('.json'));

const negative_cases: ReadonlyArray<{ name: string; value: unknown }> = [
  { name: 'missing version', value: { root: { kind: 'step', id: 's1' } } },
  { name: 'wrong version', value: { version: 2, root: { kind: 'step', id: 's1' } } },
  { name: 'parallel keys mismatch', value: {
      version: 1,
      root: {
        kind: 'parallel',
        id: 'p1',
        config: { keys: ['a'] },
        children: [
          { kind: 'step', id: 's1' },
          { kind: 'step', id: 's2' },
        ],
      },
    } },
  { name: 'missing id', value: { version: 1, root: { kind: 'step' } } },
  { name: 'non-string keys', value: {
      version: 1,
      root: {
        kind: 'parallel',
        id: 'p1',
        config: { keys: [1, 2] },
        children: [
          { kind: 'step', id: 's1' },
          { kind: 'step', id: 's2' },
        ],
      },
    } },
];

describe('schema parity: @repo/weft ↔ @repo/watch', () => {
  for (const file of fixture_files) {
    it(`agrees on fixture: ${file}`, () => {
      const value = load_json(join(fixtures_dir, file));
      const core_result = core_flow_tree_schema.safeParse(value);
      const watch_result = watch_flow_tree_schema.safeParse(value);
      expect(watch_result.success).toBe(core_result.success);
      if (!core_result.success && !watch_result.success) {
        expect(format_path(watch_result.error.issues[0]?.path ?? [])).toBe(
          format_path(core_result.error.issues[0]?.path ?? []),
        );
      }
    });
  }

  for (const { name, value } of negative_cases) {
    it(`agrees on negative case: ${name}`, () => {
      const core_result = core_flow_tree_schema.safeParse(value);
      const watch_result = watch_flow_tree_schema.safeParse(value);
      expect(watch_result.success).toBe(core_result.success);
      expect(watch_result.success).toBe(false);
      if (!core_result.success && !watch_result.success) {
        expect(format_path(watch_result.error.issues[0]?.path ?? [])).toBe(
          format_path(core_result.error.issues[0]?.path ?? []),
        );
      }
    });
  }

  it('agrees on a bare FlowNode (auto-wrap source path)', () => {
    const value: unknown = { kind: 'step', id: 's1' };
    const core_result = core_flow_node_schema.safeParse(value);
    const watch_result = watch_flow_node_schema.safeParse(value);
    expect(core_result.success).toBe(true);
    expect(watch_result.success).toBe(true);
  });
});
