/**
 * Pure projection: build inspector-panel summary from a FlowNode.
 *
 * Per spec §5.3, the inspector is kind-aware:
 *   - Every node carries kind + id + (optional) raw config dump.
 *   - `step`        → function reference.
 *   - `sequence`    → child count.
 *   - `parallel`    → branch keys + child count.
 *   - `pipe`        → tail function + wrapped child.
 *   - `retry`       → max_attempts + backoff_ms + wrapped child.
 *   - `scope`       → stash and use summaries.
 *   - `stash`       → key.
 *   - `use`         → consumed keys.
 *   - `<cycle>`     → cycle target.
 *   - generic       → kind name + raw config (the fallback path).
 *
 * Dispatch on kind is local to this module — the canvas itself does not
 * branch on kind anywhere (see taste principle 4).
 */

import type { FlowNode, FlowValue } from '@repo/weft';

const WRAPPER_KINDS = new Set(['pipe', 'retry', 'timeout', 'checkpoint']);

export type WrapperSummary = {
  readonly child_id: string;
  readonly child_kind: string;
};

export type StepSummary = {
  readonly fn_label: string;
};

export type PipeSummary = {
  readonly fn_label: string;
};

export type RetrySummary = {
  readonly attempts: number | null;
  readonly backoff_ms: number | null;
};

export type ParallelSummary = {
  readonly keys: ReadonlyArray<string>;
  readonly child_count: number;
};

export type ScopeStash = {
  readonly id: string;
  readonly key: string | null;
};

export type ScopeUse = {
  readonly id: string;
  readonly keys: ReadonlyArray<string>;
};

export type ScopeSummary = {
  readonly stashes: ReadonlyArray<ScopeStash>;
  readonly uses: ReadonlyArray<ScopeUse>;
};

export type SequenceSummary = {
  readonly child_count: number;
};

export type StashSummary = {
  readonly key: string | null;
};

export type UseSummary = {
  readonly keys: ReadonlyArray<string>;
};

export type CycleSummary = {
  readonly target: string;
};

export type InspectorSummary = {
  readonly kind: string;
  readonly id: string;
  readonly config_pretty: string | null;
  readonly wrapper?: WrapperSummary;
  readonly step?: StepSummary;
  readonly pipe?: PipeSummary;
  readonly retry?: RetrySummary;
  readonly parallel?: ParallelSummary;
  readonly scope?: ScopeSummary;
  readonly sequence?: SequenceSummary;
  readonly stash?: StashSummary;
  readonly use?: UseSummary;
  readonly cycle?: CycleSummary;
};

export function summarize_for_inspector(node: FlowNode): InspectorSummary {
  const config_pretty =
    node.config === undefined ? null : JSON.stringify(node.config, null, 2);

  let summary: InspectorSummary = {
    kind: node.kind,
    id: node.id,
    config_pretty,
  };

  if (WRAPPER_KINDS.has(node.kind)) {
    const wrapped = node.children?.[0];
    if (wrapped !== undefined) {
      summary = {
        ...summary,
        wrapper: { child_id: wrapped.id, child_kind: wrapped.kind },
      };
    }
  }

  if (node.kind === 'step') {
    return { ...summary, step: { fn_label: format_fn_ref(node.config?.['fn']) } };
  }

  if (node.kind === 'pipe') {
    return { ...summary, pipe: { fn_label: format_fn_ref(node.config?.['fn']) } };
  }

  if (node.kind === 'retry') {
    return {
      ...summary,
      retry: {
        attempts: read_number(node.config?.['max_attempts']),
        backoff_ms: read_number(node.config?.['backoff_ms']),
      },
    };
  }

  if (node.kind === 'parallel') {
    return {
      ...summary,
      parallel: {
        keys: read_string_list(node.config?.['keys']),
        child_count: node.children?.length ?? 0,
      },
    };
  }

  if (node.kind === 'sequence') {
    return { ...summary, sequence: { child_count: node.children?.length ?? 0 } };
  }

  if (node.kind === 'scope') {
    return { ...summary, scope: scope_summary(node) };
  }

  if (node.kind === 'stash') {
    return { ...summary, stash: { key: read_string(node.config?.['key']) } };
  }

  if (node.kind === 'use') {
    return { ...summary, use: { keys: read_string_list(node.config?.['keys']) } };
  }

  if (node.kind === '<cycle>') {
    return { ...summary, cycle: { target: node.id } };
  }

  return summary;
}

function scope_summary(node: FlowNode): ScopeSummary {
  const stashes: ScopeStash[] = [];
  const uses: ScopeUse[] = [];
  const visit = (n: FlowNode): void => {
    if (n.kind === 'stash') {
      const key = read_string(n.config?.['key']);
      stashes.push({ id: n.id, key });
    } else if (n.kind === 'use') {
      uses.push({ id: n.id, keys: read_string_list(n.config?.['keys']) });
    }
    if (n.children === undefined) return;
    for (const child of n.children) visit(child);
  };
  if (node.children !== undefined) {
    for (const child of node.children) visit(child);
  }
  return { stashes, uses };
}

function read_string(value: FlowValue | undefined): string | null {
  return typeof value === 'string' ? value : null;
}

function read_number(value: FlowValue | undefined): number | null {
  return typeof value === 'number' ? value : null;
}

function read_string_list(value: FlowValue | undefined): ReadonlyArray<string> {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

function format_fn_ref(value: FlowValue | undefined): string {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return '<fn>';
  }
  // value is FlowValue narrowed to a record-shaped object after the guards.
  const kind = read_record_field(value, 'kind');
  if (kind !== '<fn>') return '<fn>';
  const name = read_record_field(value, 'name');
  if (typeof name !== 'string' || name === '') return '<fn>';
  return `<fn:${name}>`;
}

function read_record_field(value: object, key: string): unknown {
  if (!Object.prototype.hasOwnProperty.call(value, key)) return undefined;
  return Reflect.get(value, key);
}
