/**
 * Pure projection: build inspector-panel summary from a FlowNode.
 *
 * Per spec §5.3:
 *   - Every node shows kind, id, and pretty-printed config.
 *   - Wrapper kinds (`pipe`, `retry`) show a wrapped-child summary.
 *   - Container kinds add per-kind summaries:
 *       - `parallel`  → keys list (zipped from `config.keys`)
 *       - `scope`     → stash and use summaries
 *       - `sequence`  → child count
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

export type InspectorSummary = {
  readonly kind: string;
  readonly id: string;
  readonly config_pretty: string | null;
  readonly wrapper?: WrapperSummary;
  readonly parallel?: ParallelSummary;
  readonly scope?: ScopeSummary;
  readonly sequence?: SequenceSummary;
};

export function summarize_for_inspector(node: FlowNode): InspectorSummary {
  const config_pretty =
    node.config === undefined ? null : JSON.stringify(node.config, null, 2);

  const summary: InspectorSummary = {
    kind: node.kind,
    id: node.id,
    config_pretty,
  };

  if (WRAPPER_KINDS.has(node.kind)) {
    const wrapped = node.children?.[0];
    if (wrapped !== undefined) {
      return {
        ...summary,
        wrapper: { child_id: wrapped.id, child_kind: wrapped.kind },
      };
    }
  }

  if (node.kind === 'parallel') {
    const keys = read_string_list(node.config?.['keys']);
    return {
      ...summary,
      parallel: {
        keys,
        child_count: node.children?.length ?? 0,
      },
    };
  }

  if (node.kind === 'sequence') {
    return {
      ...summary,
      sequence: { child_count: node.children?.length ?? 0 },
    };
  }

  if (node.kind === 'scope') {
    return { ...summary, scope: scope_summary(node) };
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

function read_string_list(value: FlowValue | undefined): ReadonlyArray<string> {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}
