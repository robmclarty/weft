import { describe, expect, it } from 'vitest';
import {
  format_fn_ref,
  read_number_field,
  read_string_array_field,
  read_string_field,
} from '../node_helpers.js';

describe('format_fn_ref', () => {
  it('returns <fn:name> when a name is present', () => {
    expect(format_fn_ref({ kind: '<fn>', name: 'do_thing' })).toBe('<fn:do_thing>');
  });
  it('returns <fn> when name is absent or empty', () => {
    expect(format_fn_ref({ kind: '<fn>' })).toBe('<fn>');
    expect(format_fn_ref({ kind: '<fn>', name: '' })).toBe('<fn>');
  });
  it('returns <fn> for non-fn-ref values', () => {
    expect(format_fn_ref(undefined)).toBe('<fn>');
    expect(format_fn_ref(null)).toBe('<fn>');
    expect(format_fn_ref('not a fn')).toBe('<fn>');
    expect(format_fn_ref(123)).toBe('<fn>');
    expect(format_fn_ref({ kind: '<schema>' })).toBe('<fn>');
  });
});

describe('read_string_field', () => {
  it('returns the string when key maps to a string', () => {
    expect(read_string_field({ key: 'value' }, 'key')).toBe('value');
  });
  it('returns undefined when key is absent or non-string', () => {
    expect(read_string_field(undefined, 'k')).toBeUndefined();
    expect(read_string_field({}, 'k')).toBeUndefined();
    expect(read_string_field({ k: 42 }, 'k')).toBeUndefined();
    expect(read_string_field({ k: null }, 'k')).toBeUndefined();
  });
  it('handles a Map input shape', () => {
    const map = new Map<string, string>([['k', 'v']]);
    expect(read_string_field(map as unknown as { [k: string]: string }, 'k')).toBe('v');
  });
});

describe('read_number_field', () => {
  it('returns the number when key maps to a number', () => {
    expect(read_number_field({ k: 42 }, 'k')).toBe(42);
    expect(read_number_field({ k: 0 }, 'k')).toBe(0);
  });
  it('returns undefined when not a number or missing', () => {
    expect(read_number_field(undefined, 'k')).toBeUndefined();
    expect(read_number_field({}, 'k')).toBeUndefined();
    expect(read_number_field({ k: 'str' }, 'k')).toBeUndefined();
  });
});

describe('read_string_array_field', () => {
  it('returns the array when every entry is a string', () => {
    expect(read_string_array_field({ k: ['a', 'b'] }, 'k')).toEqual(['a', 'b']);
  });
  it('returns undefined for missing or non-array values', () => {
    expect(read_string_array_field(undefined, 'k')).toBeUndefined();
    expect(read_string_array_field({ k: 'not array' }, 'k')).toBeUndefined();
    expect(read_string_array_field({}, 'k')).toBeUndefined();
  });
  it('returns undefined when at least one entry is not a string', () => {
    expect(read_string_array_field({ k: ['a', 1, 'b'] }, 'k')).toBeUndefined();
  });
});
