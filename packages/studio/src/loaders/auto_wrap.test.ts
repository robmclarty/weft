import { describe, expect, it } from 'vitest';

import { auto_wrap_payload } from './auto_wrap.js';

describe('auto_wrap_payload', () => {
  it('passes through an existing flow_tree envelope', () => {
    const env = {
      version: 1,
      root: { kind: 'step', id: 'step:a' },
    };
    expect(auto_wrap_payload(env)).toBe(env);
  });

  it('wraps a bare FlowNode with kind+id', () => {
    const node = { kind: 'step', id: 'step:a' };
    expect(auto_wrap_payload(node)).toEqual({ version: 1, root: node });
  });

  it('does not wrap an object that lacks kind+id', () => {
    const stranger = { not: 'a flow node' };
    expect(auto_wrap_payload(stranger)).toBe(stranger);
  });

  it('passes through non-objects unchanged', () => {
    expect(auto_wrap_payload('hello')).toBe('hello');
    expect(auto_wrap_payload(null)).toBeNull();
    expect(auto_wrap_payload(42)).toBe(42);
  });

  it('passes through arrays unchanged', () => {
    const arr = [{ kind: 'step', id: 'a' }];
    expect(auto_wrap_payload(arr)).toBe(arr);
  });
});
