/**
 * Tiny formatting helpers shared by node components.
 *
 * Components import functions from here; they do not import each other (per
 * constraints §3 "Node-type components do not import other node-type
 * components"). Anything kind-aware lives in the node component, never here.
 */

import type { FlowValue } from '../schemas.js';

function as_object(value: unknown): { readonly [k: string]: unknown } | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  if (Array.isArray(value)) return undefined;
  // After the two guards above, value is a non-array object. Object spread
  // narrows it to a plain record-shaped value without `as` syntax.
  return { ...value };
}

export function format_fn_ref(value: FlowValue | undefined): string {
  const obj = as_object(value);
  if (obj === undefined) return '<fn>';
  if (obj['kind'] !== '<fn>') return '<fn>';
  const name = obj['name'];
  if (typeof name !== 'string' || name === '') return '<fn>';
  return `<fn:${name}>`;
}

function is_record(
  value: ReadonlyMap<string, FlowValue> | { readonly [k: string]: FlowValue },
): value is { readonly [k: string]: FlowValue } {
  return !(value instanceof Map);
}

export function read_string_field(
  config: ReadonlyMap<string, FlowValue> | { readonly [k: string]: FlowValue } | undefined,
  key: string,
): string | undefined {
  if (config === undefined) return undefined;
  if (!is_record(config)) {
    const v = config.get(key);
    return typeof v === 'string' ? v : undefined;
  }
  const v = config[key];
  return typeof v === 'string' ? v : undefined;
}

export function read_number_field(
  config: { readonly [k: string]: FlowValue } | undefined,
  key: string,
): number | undefined {
  if (config === undefined) return undefined;
  const v = config[key];
  return typeof v === 'number' ? v : undefined;
}

export function read_string_array_field(
  config: { readonly [k: string]: FlowValue } | undefined,
  key: string,
): readonly string[] | undefined {
  if (config === undefined) return undefined;
  const v = config[key];
  if (!Array.isArray(v)) return undefined;
  const out: string[] = [];
  for (const entry of v) {
    if (typeof entry !== 'string') return undefined;
    out.push(entry);
  }
  return out;
}
