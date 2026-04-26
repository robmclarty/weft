/**
 * Auto-wrap a bare FlowNode payload into a flow_tree envelope.
 *
 * The studio accepts both the canonical `flow_tree { version: 1, root }`
 * envelope and a bare `FlowNode` (as fascicle's `describe.json` emits).
 * Per spec §4.2, the loader auto-wraps bare nodes before validation so
 * downstream code only ever sees the envelope shape.
 */

function get_field(value: object, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(value, key)
    ? Reflect.get(value, key)
    : undefined;
}

export function auto_wrap_payload(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  const has_version = get_field(raw, 'version') !== undefined;
  const has_root = get_field(raw, 'root') !== undefined;
  if (has_version && has_root) return raw;
  const has_kind = get_field(raw, 'kind') !== undefined;
  const has_id = get_field(raw, 'id') !== undefined;
  if (has_kind && has_id) {
    return { version: 1, root: raw };
  }
  return raw;
}
