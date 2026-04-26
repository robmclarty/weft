import { describe, expect, it } from 'vitest';

import { summarize_for_inspector } from './inspector.js';

describe('summarize_for_inspector', () => {
  it('summarizes a step', () => {
    const s = summarize_for_inspector({
      kind: 'step',
      id: 'step:a',
      config: { fn: { kind: '<fn>', name: 'greet' } },
    });
    expect(s.kind).toBe('step');
    expect(s.id).toBe('step:a');
    expect(s.config_pretty).toContain('greet');
    expect(s.wrapper).toBeUndefined();
    expect(s.parallel).toBeUndefined();
    expect(s.scope).toBeUndefined();
  });

  it('summarizes a sequence with child count', () => {
    const s = summarize_for_inspector({
      kind: 'sequence',
      id: 'seq:0',
      children: [
        { kind: 'step', id: 's:0' },
        { kind: 'step', id: 's:1' },
      ],
    });
    expect(s.sequence?.child_count).toBe(2);
  });

  it('summarizes a parallel with keys and count', () => {
    const s = summarize_for_inspector({
      kind: 'parallel',
      id: 'p:0',
      config: { keys: ['a', 'b'] },
      children: [
        { kind: 'step', id: 's:0' },
        { kind: 'step', id: 's:1' },
      ],
    });
    expect(s.parallel?.keys).toEqual(['a', 'b']);
    expect(s.parallel?.child_count).toBe(2);
  });

  it('summarizes a wrapper (pipe) with the wrapped child', () => {
    const s = summarize_for_inspector({
      kind: 'pipe',
      id: 'pipe:0',
      config: { fn: { kind: '<fn>', name: 'upper' } },
      children: [{ kind: 'step', id: 'step:body' }],
    });
    expect(s.wrapper?.child_id).toBe('step:body');
    expect(s.wrapper?.child_kind).toBe('step');
  });

  it('summarizes a wrapper (retry) with attempts in config', () => {
    const s = summarize_for_inspector({
      kind: 'retry',
      id: 'retry:0',
      config: { max_attempts: 3, backoff_ms: 100 },
      children: [{ kind: 'step', id: 'step:body' }],
    });
    expect(s.wrapper?.child_id).toBe('step:body');
    expect(s.config_pretty).toContain('max_attempts');
  });

  it('summarizes a scope with stash and use entries', () => {
    const s = summarize_for_inspector({
      kind: 'scope',
      id: 'scope:0',
      children: [
        {
          kind: 'stash',
          id: 'stash:greeting',
          config: { key: 'greeting' },
        },
        {
          kind: 'pipe',
          id: 'pipe:0',
          children: [
            {
              kind: 'use',
              id: 'use:greeting',
              config: { keys: ['greeting'] },
            },
          ],
        },
      ],
    });
    expect(s.scope?.stashes).toHaveLength(1);
    expect(s.scope?.stashes[0]?.key).toBe('greeting');
    expect(s.scope?.uses).toHaveLength(1);
    expect(s.scope?.uses[0]?.keys).toEqual(['greeting']);
  });

  it('emits null config_pretty when config is absent', () => {
    const s = summarize_for_inspector({ kind: 'step', id: 'step:a' });
    expect(s.config_pretty).toBeNull();
  });
});
