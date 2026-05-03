/**
 * Public layout entry point.
 *
 * Builds an ELK graph from the React Flow nodes/edges produced by
 * `tree_to_graph`, runs the layered algorithm, and applies the resulting
 * positions back to the input nodes. If ELK exceeds the 10s timeout
 * (spec.md §8 F4) or `Worker` is unavailable in the environment
 * (spec.md §8 F5), the deterministic naive layout takes over and a single
 * console warning fires per process.
 *
 * Pure async function; debouncing happens one layer up (see `debounce.ts`).
 */

import type { WeftEdge, WeftNode } from '../transform/tree_to_graph.js';
import {
  apply_edge_routes,
  apply_positions,
  build_elk,
  build_elk_graph,
  resolve_worker_factory,
} from './elk_runner.js';
import { fallback_layout } from './fallback_layout.js';
import { resolve_options, type LayoutOptions } from './layout_options.js';
import { apply_libavoid_routes, route_with_libavoid } from './libavoid_router.js';

const ELK_TIMEOUT_MS = 10_000;

let warned_worker_unavailable = false;
let warned_fallback_engaged = false;

function warn_once_worker_unavailable(): void {
  if (warned_worker_unavailable) return;
  warned_worker_unavailable = true;
  console.warn(
    '[weft] Web Worker unavailable; ELK layout running on the main thread.',
  );
}

function warn_once_fallback_engaged(reason: string): void {
  if (warned_fallback_engaged) return;
  warned_fallback_engaged = true;
  console.warn(`[weft] ELK layout fallback engaged: ${reason}`);
}

/**
 * Test-only seam: reset the once-per-process console-warning flags so
 * failure-mode tests can observe the warning fire under controlled conditions.
 */
export function reset_layout_warnings_for_tests(): void {
  warned_worker_unavailable = false;
  warned_fallback_engaged = false;
}

export type LayoutGraphOptions = Partial<LayoutOptions> & {
  readonly worker_factory?: ((url?: string) => Worker) | null;
  readonly timeout_ms?: number;
  /**
   * Explicit URL for the libavoid-js WASM blob. Required in Vite dev: the
   * package's default `import.meta.url`-relative resolver produces a path
   * Vite doesn't serve, and the load falls back to the SPA index.html
   * (which fails the WASM magic-byte check). The studio resolves this via
   * `import wasm_url from 'libavoid-js/dist/libavoid.wasm?url'`.
   */
  readonly libavoid_wasm_url?: string;
};

function with_timeout<T>(
  promise: Promise<T>,
  ms: number,
): { result: Promise<T>; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const result = new Promise<T>((resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error('layout timeout')),
      ms,
    );
    promise.then(
      (v) => { if (timer !== null) clearTimeout(timer); resolve(v); },
      (e) => { if (timer !== null) clearTimeout(timer); reject(e); },
    );
  });
  return {
    result,
    cancel: () => { if (timer !== null) clearTimeout(timer); },
  };
}

export async function layout_graph(
  nodes: ReadonlyArray<WeftNode>,
  edges: ReadonlyArray<WeftEdge>,
  options?: LayoutGraphOptions,
): Promise<{ nodes: WeftNode[]; edges: WeftEdge[] }> {
  const resolved = resolve_options(options);
  const timeout_ms = options?.timeout_ms ?? ELK_TIMEOUT_MS;

  const factory = resolve_worker_factory(options?.worker_factory);
  if (factory === undefined) {
    warn_once_worker_unavailable();
    return fallback_layout(nodes, edges, resolved);
  }

  let elk;
  try {
    elk = build_elk(factory);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    warn_once_fallback_engaged(`elk init failed: ${reason}`);
    return fallback_layout(nodes, edges, resolved);
  }

  const elk_graph = build_elk_graph(nodes, edges, resolved);
  const { result, cancel } = with_timeout(elk.layout(elk_graph), timeout_ms);

  try {
    const laid = await result;
    const positioned = apply_positions(nodes, laid);
    const elk_routed = apply_edge_routes(edges, laid);
    if (resolved.router === 'libavoid') {
      const libavoid_routes = await route_with_libavoid(
        positioned,
        elk_routed,
        options?.libavoid_wasm_url ?? null,
      );
      if (libavoid_routes !== null) {
        return {
          nodes: positioned,
          edges: apply_libavoid_routes(elk_routed, libavoid_routes),
        };
      }
    }
    return { nodes: positioned, edges: elk_routed };
  } catch (err) {
    cancel();
    const reason = err instanceof Error ? err.message : String(err);
    warn_once_fallback_engaged(reason);
    return fallback_layout(nodes, edges, resolved);
  }
}

export type { LayoutOptions } from './layout_options.js';
