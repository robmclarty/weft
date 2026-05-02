/**
 * Tiny formatting helpers shared by node components.
 *
 * Components import functions from here; they do not import each other (per
 * constraints §3 "Node-type components do not import other node-type
 * components"). Anything kind-aware lives in the node component, never here.
 */

import type { FlowValue } from '../schemas.js';
import type { NodeRuntimeState } from '../runtime_state.js';

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

/**
 * Compose the className string for a node's outer chrome from the runtime
 * overlay state. Centralized here so every node renderer can opt in by
 * appending `runtime_class(runtime)` without re-implementing the logic.
 */
export function runtime_class(runtime: NodeRuntimeState | undefined): string {
  if (runtime === undefined) return '';
  const parts: string[] = [];
  if (runtime.active) parts.push('weft-runtime-active');
  if (runtime.error !== null) parts.push('weft-runtime-errored');
  if (runtime.cost_usd > 0) parts.push('weft-runtime-has-cost');
  return parts.join(' ');
}

/**
 * Format a USD amount for the cost badge. Sub-cent amounts show 4 decimals
 * so a $0.0034 model call is legible; everything else uses 2.
 */
export function format_cost(usd: number): string {
  if (usd <= 0) return '';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 100) return `$${usd.toFixed(2)}`;
  return `$${usd.toFixed(0)}`;
}
