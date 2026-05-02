/**
 * Pure projection: trajectory events → per-step runtime overlay state.
 *
 * The studio feeds an event stream (from a watched JSONL, an HTTP push, or a
 * fixture replay) into `derive_runtime_state(events, tree)`; the result is a
 * `Map<step_id, NodeRuntimeState>` the canvas overlays on top of the
 * structural graph:
 *
 *   - `active`         a `span_start` is open; node pulses ochre.
 *   - `error`          the most recent `span_end` carried `error`; scar.
 *   - `last_emit_ts`   the wall-clock of the most recent `emit`; flash.
 *   - `cost_usd`       sum of `cost.total_usd` events attributed to the step
 *                      plus its descendants (containers roll up).
 *   - `last_run_id`    the run the most recent event came from; the studio
 *                      uses this to scope filters when multiple runs are
 *                      buffered together.
 *
 * Mapping events to steps:
 *   - `span_start` / `span_end` carry the user-facing `id` (e.g. `sequence_3`)
 *     as a passthrough field — fascicle records this when starting the span.
 *   - `cost` events carry `step_index`; without a span_index→id table we fall
 *     back to attributing them to the most recently opened span.
 *   - `emit` carries no step id; we attribute it to the most recently opened
 *     span (fascicle emits inside a step's run function).
 *
 * The function is deterministic and order-sensitive (later events override
 * earlier ones); replaying the same events produces the same map.
 */

import type { FlowNode, FlowTree } from './schemas.js';
import type { ParsedTrajectoryEvent } from './trajectory.js';

export type NodeRuntimeState = {
  readonly active: boolean;
  readonly error: string | null;
  readonly last_emit_ts: number | null;
  readonly cost_usd: number;
  readonly last_run_id: string | null;
  readonly span_count: number;
};

const EMPTY: NodeRuntimeState = {
  active: false,
  error: null,
  last_emit_ts: null,
  cost_usd: 0,
  last_run_id: null,
  span_count: 0,
};

type MutableState = {
  active: boolean;
  error: string | null;
  last_emit_ts: number | null;
  cost_usd: number;
  last_run_id: string | null;
  span_count: number;
};

function get_or_init(map: Map<string, MutableState>, id: string): MutableState {
  const existing = map.get(id);
  if (existing !== undefined) return existing;
  const fresh: MutableState = { ...EMPTY };
  map.set(id, fresh);
  return fresh;
}

function build_parent_index(tree: FlowTree | null): Map<string, string> {
  const parents = new Map<string, string>();
  if (tree === null) return parents;
  const visit = (node: FlowNode, parent_id: string | null): void => {
    if (parent_id !== null) parents.set(node.id, parent_id);
    if (node.children === undefined) return;
    for (const child of node.children) visit(child, node.id);
  };
  visit(tree.root, null);
  return parents;
}

function read_string(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function read_number(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function get_field(event: ParsedTrajectoryEvent, key: string): unknown {
  if (typeof event !== 'object' || event === null) return undefined;
  if (!Object.prototype.hasOwnProperty.call(event, key)) return undefined;
  return Reflect.get(event, key);
}

function event_step_id(event: ParsedTrajectoryEvent): string | null {
  if (event.kind !== 'span_start' && event.kind !== 'span_end') return null;
  return read_string(get_field(event, 'id'));
}

function event_run_id(event: ParsedTrajectoryEvent): string | null {
  return read_string(get_field(event, 'run_id'));
}

export type DeriveRuntimeStateOptions = {
  readonly run_id?: string;
};

export function derive_runtime_state(
  events: ReadonlyArray<ParsedTrajectoryEvent>,
  tree: FlowTree | null,
  options?: DeriveRuntimeStateOptions,
): ReadonlyMap<string, NodeRuntimeState> {
  const states = new Map<string, MutableState>();
  const parents = build_parent_index(tree);
  const span_to_id = new Map<string, string>();
  const run_filter = options?.run_id ?? null;
  let active_span_step: string | null = null;

  function add_cost(step_id: string, amount: number): void {
    let cursor: string | null = step_id;
    while (cursor !== null) {
      const node = get_or_init(states, cursor);
      node.cost_usd += amount;
      cursor = parents.get(cursor) ?? null;
    }
  }

  for (const event of events) {
    const run_id = event_run_id(event);
    if (run_filter !== null && run_id !== null && run_id !== run_filter) continue;

    if (event.kind === 'span_start') {
      const step_id = event_step_id(event);
      const span_id = read_string(get_field(event, 'span_id'));
      if (step_id === null || span_id === null) continue;
      span_to_id.set(span_id, step_id);
      const state = get_or_init(states, step_id);
      state.active = true;
      state.span_count += 1;
      state.last_run_id = run_id;
      active_span_step = step_id;
      continue;
    }

    if (event.kind === 'span_end') {
      const span_id = read_string(get_field(event, 'span_id'));
      const mapped = (span_id !== null ? span_to_id.get(span_id) : undefined) ?? event_step_id(event);
      if (mapped !== null && mapped !== undefined) {
        const state = get_or_init(states, mapped);
        state.active = false;
        const error = read_string(get_field(event, 'error'));
        if (error !== null) state.error = error;
        state.last_run_id = run_id;
      }
      if (span_id !== null) span_to_id.delete(span_id);
      if (active_span_step === mapped) active_span_step = null;
      continue;
    }

    if (event.kind === 'emit') {
      const target = active_span_step;
      if (target === null) continue;
      const state = get_or_init(states, target);
      const ts = read_number(get_field(event, 'ts')) ?? Date.now();
      state.last_emit_ts = ts;
      state.last_run_id = run_id;
      continue;
    }

    if (event.kind === 'cost') {
      const total = read_number(get_field(event, 'total_usd'));
      if (total === null) continue;
      const step = active_span_step;
      if (step === null) continue;
      add_cost(step, total);
      continue;
    }
  }

  const out = new Map<string, NodeRuntimeState>();
  for (const [id, state] of states) {
    out.set(id, { ...state });
  }
  return out;
}

export function empty_runtime_state(): NodeRuntimeState {
  return { ...EMPTY };
}
