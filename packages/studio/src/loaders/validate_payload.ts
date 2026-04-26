/**
 * Boundary validation for loader inputs (drag-drop, paste, URL fetch, watch).
 *
 * Per spec §5.4 and constraints §5.3: validation runs at exactly the studio
 * loader boundary using `flow_tree_schema` from the umbrella. On failure we
 * surface the offending JSON path; on success we hand back the typed envelope.
 * The previous canvas is never replaced when validation fails — that policy
 * lives in the caller.
 */

import { flow_tree_schema, type FlowTree } from '@repo/weft';

import { auto_wrap_payload } from './auto_wrap.js';

export type ValidationOk = {
  readonly ok: true;
  readonly tree: FlowTree;
};

export type ValidationErr = {
  readonly ok: false;
  readonly zod_path: string;
  readonly message: string;
};

export type ValidationResult = ValidationOk | ValidationErr;

export function validate_loader_payload(raw: unknown): ValidationResult {
  const wrapped = auto_wrap_payload(raw);
  const result = flow_tree_schema.safeParse(wrapped);
  if (result.success) {
    return { ok: true, tree: result.data };
  }
  const issue = result.error.issues[0];
  if (issue === undefined) {
    return { ok: false, zod_path: '$', message: 'invalid input' };
  }
  return {
    ok: false,
    zod_path: format_zod_path(issue.path),
    message: issue.message,
  };
}

export function parse_json_text(text: string): unknown {
  return JSON.parse(text);
}

function format_zod_path(path: ReadonlyArray<PropertyKey>): string {
  if (path.length === 0) return '$';
  let out = '$';
  for (const segment of path) {
    if (typeof segment === 'number') {
      out += `[${String(segment)}]`;
    } else {
      out += `.${String(segment)}`;
    }
  }
  return out;
}
