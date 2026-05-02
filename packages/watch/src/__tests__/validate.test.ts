import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { read_and_validate, validate_input } from '../validate.js';

describe('validate_input', () => {
  it('accepts a valid flow_tree envelope', () => {
    const result = validate_input({
      version: 1,
      root: { kind: 'step', id: 's1' },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tree.root.kind).toBe('step');
    }
  });

  it('auto-wraps a bare FlowNode', () => {
    const result = validate_input({ kind: 'step', id: 's1' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tree.version).toBe(1);
      expect(result.tree.root.id).toBe('s1');
    }
  });

  it('reports a JSON path on parallel-keys mismatch', () => {
    const result = validate_input({
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
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.zod_path).toContain('config');
      expect(result.zod_path).toContain('keys');
    }
  });

  it('rejects an obviously malformed object', () => {
    const result = validate_input({ totally: 'wrong' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.zod_path).toBe('string');
      expect(result.zod_path.length).toBeGreaterThan(0);
    }
  });
});

describe('read_and_validate', () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'weft-watch-validate-'));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('returns kind="tree" for a valid file', async () => {
    const path = join(dir, 'good.json');
    await writeFile(
      path,
      JSON.stringify({ version: 1, root: { kind: 'step', id: 's1' } }),
    );
    const result = await read_and_validate(path);
    expect(result.kind).toBe('tree');
  });

  it('returns kind="invalid" with offending path on bad content', async () => {
    const path = join(dir, 'bad.json');
    await writeFile(path, JSON.stringify({ totally: 'wrong' }));
    const result = await read_and_validate(path);
    expect(result.kind).toBe('invalid');
    if (result.kind === 'invalid') {
      expect(result.zod_path.length).toBeGreaterThan(0);
    }
  });

  it('returns kind="invalid" on JSON parse failure', async () => {
    const path = join(dir, 'malformed.json');
    await writeFile(path, '{ not really json');
    const result = await read_and_validate(path);
    expect(result.kind).toBe('invalid');
    if (result.kind === 'invalid') {
      expect(result.message).toMatch(/JSON parse/);
    }
  });

  it('returns kind="read_error" when the file does not exist', async () => {
    const path = join(dir, 'never_exists.json');
    const result = await read_and_validate(path);
    expect(result.kind).toBe('read_error');
  });
});
