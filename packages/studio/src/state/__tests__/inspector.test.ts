import { describe, expect, it } from 'vitest';

import { summarize_for_inspector } from '../inspector.js';

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

  it('summarizes a branch with predicate label and child kinds', () => {
    const s = summarize_for_inspector({
      kind: 'branch',
      id: 'branch_1',
      config: { when: { kind: '<fn>', name: 'is_long' } },
      children: [
        { kind: 'sequence', id: 'seq:then' },
        { kind: 'step', id: 'step:otherwise' },
      ],
    });
    expect(s.branch?.when_label).toBe('<fn:is_long>');
    expect(s.branch?.then_kind).toBe('sequence');
    expect(s.branch?.otherwise_kind).toBe('step');
  });

  it('summarizes a fallback with primary/backup child kinds', () => {
    const s = summarize_for_inspector({
      kind: 'fallback',
      id: 'fallback_1',
      children: [
        { kind: 'step', id: 'step:primary' },
        { kind: 'step', id: 'step:backup' },
      ],
    });
    expect(s.fallback?.primary_kind).toBe('step');
    expect(s.fallback?.backup_kind).toBe('step');
  });

  it('summarizes a timeout with the deadline', () => {
    const s = summarize_for_inspector({
      kind: 'timeout',
      id: 'timeout_1',
      config: { ms: 5000 },
      children: [{ kind: 'step', id: 'inner' }],
    });
    expect(s.timeout?.ms).toBe(5000);
    expect(s.wrapper?.child_id).toBe('inner');
  });

  it('summarizes a loop with max_rounds and guard presence', () => {
    const s = summarize_for_inspector({
      kind: 'loop',
      id: 'loop_1',
      config: { max_rounds: 5 },
      children: [
        { kind: 'step', id: 'body' },
        { kind: 'step', id: 'guard' },
      ],
    });
    expect(s.loop?.max_rounds).toBe(5);
    expect(s.loop?.has_guard).toBe(true);
  });

  it('summarizes a map with the concurrency cap', () => {
    const s = summarize_for_inspector({
      kind: 'map',
      id: 'map_1',
      config: { concurrency: 4 },
      children: [{ kind: 'step', id: 'per_item' }],
    });
    expect(s.map?.concurrency).toBe(4);
  });

  it('summarizes a checkpoint with a string key', () => {
    const s = summarize_for_inspector({
      kind: 'checkpoint',
      id: 'checkpoint_1',
      config: { key: 'cache_brief' },
      children: [{ kind: 'step', id: 'inner' }],
    });
    expect(s.checkpoint?.key_label).toBe('cache_brief');
  });

  it('summarizes a checkpoint with a function key', () => {
    const s = summarize_for_inspector({
      kind: 'checkpoint',
      id: 'checkpoint_1',
      config: { key: { kind: '<fn>', name: 'key_for' } },
      children: [{ kind: 'step', id: 'inner' }],
    });
    expect(s.checkpoint?.key_label).toBe('<fn>');
  });

  it('summarizes a compose with the display_name from meta', () => {
    const s = summarize_for_inspector({
      kind: 'compose',
      id: 'compose_1',
      config: { display_name: 'ensemble' },
      meta: { display_name: 'ensemble' },
      children: [{ kind: 'parallel', id: 'parallel_1', config: { keys: [] } }],
    });
    expect(s.compose?.display_name).toBe('ensemble');
  });

  it('summarizes a suspend with the resume id', () => {
    const s = summarize_for_inspector({
      kind: 'suspend',
      id: 'approval_gate',
      config: { id: 'approval_gate' },
    });
    expect(s.suspend?.resume_id).toBe('approval_gate');
  });

  it('surfaces meta.description on the summary', () => {
    const s = summarize_for_inspector({
      kind: 'step',
      id: 'fetch',
      meta: { description: 'reads from the user repo' },
    });
    expect(s.description).toBe('reads from the user repo');
  });
});
