/**
 * Boundary validation for incoming JSON.
 *
 * The watch CLI accepts either a `flow_tree` envelope ({ version: 1, root })
 * or a bare `FlowNode` and auto-wraps the bare form. Validation failures
 * surface the offending JSON path so the user can locate the problem.
 *
 * All validation runs through Zod (constraints §5.3): "Validation is at the
 * system boundary." Internal modules trust the validated shape.
 */

import { readFile } from 'node:fs/promises';
import { flow_node_schema, flow_tree_schema } from './schemas.js';
import type { FlowTree } from './schemas.js';

export type ValidationResult =
  | { readonly ok: true; readonly tree: FlowTree }
  | { readonly ok: false; readonly zod_path: string; readonly message: string };

export type ReadResult =
  | { readonly kind: 'tree'; readonly tree: FlowTree }
  | {
      readonly kind: 'invalid';
      readonly zod_path: string;
      readonly message: string;
    }
  | { readonly kind: 'read_error'; readonly message: string };

function format_zod_path(segments: ReadonlyArray<PropertyKey>): string {
  if (segments.length === 0) return '$';
  return segments
    .map((seg) => (typeof seg === 'number' ? `[${seg}]` : `.${String(seg)}`))
    .join('')
    .replace(/^\./, '$.');
}

export function validate_input(raw: unknown): ValidationResult {
  const enveloped = flow_tree_schema.safeParse(raw);
  if (enveloped.success) return { ok: true, tree: enveloped.data };

  const bare = flow_node_schema.safeParse(raw);
  if (bare.success) {
    return { ok: true, tree: { version: 1, root: bare.data } };
  }

  const issue = enveloped.error.issues[0] ?? bare.error.issues[0];
  if (!issue) {
    return {
      ok: false,
      zod_path: '$',
      message: 'invalid: failed to parse against flow_tree or FlowNode',
    };
  }
  return {
    ok: false,
    zod_path: format_zod_path(issue.path),
    message: issue.message,
  };
}

export async function read_and_validate(file_path: string): Promise<ReadResult> {
  let text: string;
  try {
    text = await readFile(file_path, 'utf8');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { kind: 'read_error', message };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { kind: 'invalid', zod_path: '$', message: `JSON parse: ${message}` };
  }

  const result = validate_input(parsed);
  if (result.ok) return { kind: 'tree', tree: result.tree };
  return { kind: 'invalid', zod_path: result.zod_path, message: result.message };
}
