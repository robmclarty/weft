import { describe, expect, it } from 'vitest';

import {
  parse_json_text,
  validate_loader_payload,
} from './validate_payload.js';

describe('parse_json_text', () => {
  it('parses valid JSON', () => {
    expect(parse_json_text('{"a":1}')).toEqual({ a: 1 });
  });
  it('throws SyntaxError on bad JSON', () => {
    expect(() => parse_json_text('not json')).toThrow(SyntaxError);
  });
});

describe('validate_loader_payload', () => {
  it('accepts a flow_tree envelope', () => {
    const result = validate_loader_payload({
      version: 1,
      root: { kind: 'step', id: 'step:a' },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tree.version).toBe(1);
      expect(result.tree.root.id).toBe('step:a');
    }
  });

  it('auto-wraps a bare FlowNode', () => {
    const result = validate_loader_payload({ kind: 'step', id: 'step:a' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tree.root.kind).toBe('step');
    }
  });

  it('rejects an empty object with a JSON-style path', () => {
    const result = validate_loader_payload({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.zod_path).toContain('$');
      expect(result.message.length).toBeGreaterThan(0);
    }
  });

  it('rejects a parallel with mismatched keys, pointing at the offending path', () => {
    const result = validate_loader_payload({
      version: 1,
      root: {
        kind: 'parallel',
        id: 'p:0',
        config: { keys: ['a', 'b'] },
        children: [
          { kind: 'step', id: 's:0' },
          { kind: 'step', id: 's:1' },
          { kind: 'step', id: 's:2' },
        ],
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.zod_path).toContain('config');
      expect(result.zod_path).toContain('keys');
    }
  });

  it('rejects a number with a path of $', () => {
    const result = validate_loader_payload(42);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.zod_path).toBe('$');
    }
  });
});
