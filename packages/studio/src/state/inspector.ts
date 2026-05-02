/**
 * Pure projection: build inspector-panel summary from a FlowNode.
 *
 * Per spec §5.3, the inspector is kind-aware:
 *   - Every node carries kind + id + (optional) raw config dump.
 *   - `step`         → function reference.
 *   - `sequence`     → child count.
 *   - `parallel`     → branch keys + child count.
 *   - `pipe`         → tail function + wrapped child.
 *   - `retry`        → max_attempts + backoff_ms + wrapped child.
 *   - `scope`        → stash and use summaries.
 *   - `stash`        → key.
 *   - `use`          → consumed keys.
 *   - `branch`       → predicate label + then/otherwise child kinds.
 *   - `fallback`     → primary/backup child kinds.
 *   - `timeout`      → ms + wrapped child.
 *   - `loop`         → max_rounds + has_guard + wrapped child.
 *   - `map`          → concurrency cap + wrapped child.
 *   - `checkpoint`   → key + wrapped child.
 *   - `compose`      → display_name + wrapped child.
 *   - `suspend`      → resume id.
 *   - `<cycle>`      → cycle target.
 *   - generic        → kind name + raw config (the fallback path).
 *
 * Dispatch on kind is local to this module — the canvas itself does not
 * branch on kind anywhere (see taste principle 4).
 */

import type { FlowNode, FlowValue } from '@repo/weft';

const WRAPPER_KINDS = new Set([
  'pipe',
  'retry',
  'timeout',
  'checkpoint',
  'compose',
  'map',
  'loop',
]);

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

export type BranchSummary = {
  readonly when_label: string;
  readonly then_kind: string | null;
  readonly otherwise_kind: string | null;
};

export type FallbackSummary = {
  readonly primary_kind: string | null;
  readonly backup_kind: string | null;
};

export type TimeoutSummary = {
  readonly ms: number | null;
};

export type LoopSummary = {
  readonly max_rounds: number | null;
  readonly has_guard: boolean;
};

export type MapSummary = {
  readonly concurrency: number | null;
};

export type CheckpointSummary = {
  readonly key_label: string;
};

export type ComposeSummary = {
  readonly display_name: string | null;
};

export type SuspendSummary = {
  readonly resume_id: string | null;
};

export type InspectorSummary = {
  readonly kind: string;
  readonly id: string;
  readonly config_pretty: string | null;
  readonly description: string | null;
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
  readonly branch?: BranchSummary;
  readonly fallback?: FallbackSummary;
  readonly timeout?: TimeoutSummary;
  readonly loop?: LoopSummary;
  readonly map?: MapSummary;
  readonly checkpoint?: CheckpointSummary;
  readonly compose?: ComposeSummary;
  readonly suspend?: SuspendSummary;
};

export function summarize_for_inspector(node: FlowNode): InspectorSummary {
  const config_pretty =
    node.config === undefined ? null : JSON.stringify(node.config, null, 2);

  let summary: InspectorSummary = {
    kind: node.kind,
    id: node.id,
    config_pretty,
    description: node.meta?.description ?? null,
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

  if (node.kind === 'branch') {
    const when = node.config?.['when'];
    const when_label =
      when !== null &&
      typeof when === 'object' &&
      !Array.isArray(when) &&
      'kind' in when &&
      when.kind === '<fn>' &&
      'name' in when &&
      typeof when.name === 'string' &&
      when.name.length > 0
        ? `<fn:${when.name}>`
        : '<fn>';
    const then_child = node.children?.[0];
    const otherwise_child = node.children?.[1];
    return {
      ...summary,
      branch: {
        when_label,
        then_kind: then_child?.kind ?? null,
        otherwise_kind: otherwise_child?.kind ?? null,
      },
    };
  }

  if (node.kind === 'fallback') {
    const primary_child = node.children?.[0];
    const backup_child = node.children?.[1];
    return {
      ...summary,
      fallback: {
        primary_kind: primary_child?.kind ?? null,
        backup_kind: backup_child?.kind ?? null,
      },
    };
  }

  if (node.kind === 'timeout') {
    return { ...summary, timeout: { ms: read_number(node.config?.['ms']) } };
  }

  if (node.kind === 'loop') {
    return {
      ...summary,
      loop: {
        max_rounds: read_number(node.config?.['max_rounds']),
        has_guard: (node.children?.length ?? 0) >= 2,
      },
    };
  }

  if (node.kind === 'map') {
    return { ...summary, map: { concurrency: read_number(node.config?.['concurrency']) } };
  }

  if (node.kind === 'checkpoint') {
    const key_value = node.config?.['key'];
    let key_label = '?';
    if (typeof key_value === 'string') {
      key_label = key_value;
    } else if (
      key_value !== null &&
      typeof key_value === 'object' &&
      !Array.isArray(key_value) &&
      'kind' in key_value &&
      key_value.kind === '<fn>'
    ) {
      key_label = '<fn>';
    }
    return { ...summary, checkpoint: { key_label } };
  }

  if (node.kind === 'compose') {
    return {
      ...summary,
      compose: {
        display_name:
          node.meta?.display_name ?? read_string(node.config?.['display_name']),
      },
    };
  }

  if (node.kind === 'suspend') {
    return {
      ...summary,
      suspend: { resume_id: read_string(node.config?.['id']) },
    };
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
