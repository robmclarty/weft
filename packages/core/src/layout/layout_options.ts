/**
 * Shared layout option defaults and resolver.
 *
 * Both ELK and the fallback share the same vocabulary so a caller swapping
 * engines does not need to relearn parameters. The defaults reserve enough
 * gutter for thick orthogonal subway-style edges to route between siblings
 * without crowding the chrome.
 */

export type LayoutDirection = 'LR' | 'TB';

/**
 * Edge-routing engine. ELK lays out node positions in both cases; this picks
 * which engine produces the orthogonal polylines drawn between them.
 *
 * - `'elk'` (default) — use ELK's own ORTHOGONAL routing output (Phase 2).
 * - `'libavoid'` — Phase 4 spike: re-route with `libavoid-js` after ELK.
 *   Optional dependency, lazy-loaded; falls back to `'elk'` if unavailable.
 *   NOTE: libavoid-js is LGPL-2.1-or-later. Acceptable for a behind-flag
 *   spike but a license review is required before shipping it on by default.
 */
export type LayoutRouter = 'elk' | 'libavoid';

export type LayoutOptions = {
  readonly direction: LayoutDirection;
  readonly node_spacing: number;
  readonly rank_spacing: number;
  readonly router: LayoutRouter;
};

/*
 * Spacing defaults tuned for "see the flow first, fit-everything second".
 * Thick orthogonal edges with arrowheads need a *long* visible run between
 * adjacent stops or the head dominates and the line vanishes — the user
 * complaint that "blocks look disconnected" was, mechanically, about the
 * 30–60px stubs between markers and their lifted children. Cranking to
 * 128 / 240 gives every arrow a clear runway between blocks; the trade
 * is that a wide LR pipeline no longer fits in one viewport at native
 * zoom, which is acceptable since panning is cheap and traceability is
 * the priority.
 */
export const DEFAULT_LAYOUT_OPTIONS: LayoutOptions = {
  direction: 'LR',
  node_spacing: 120,
  rank_spacing: 200,
  router: 'elk',
};

export function resolve_options(input?: Partial<LayoutOptions>): LayoutOptions {
  if (input === undefined) return DEFAULT_LAYOUT_OPTIONS;
  return {
    direction: input.direction ?? DEFAULT_LAYOUT_OPTIONS.direction,
    node_spacing: input.node_spacing ?? DEFAULT_LAYOUT_OPTIONS.node_spacing,
    rank_spacing: input.rank_spacing ?? DEFAULT_LAYOUT_OPTIONS.rank_spacing,
    router: input.router ?? DEFAULT_LAYOUT_OPTIONS.router,
  };
}
