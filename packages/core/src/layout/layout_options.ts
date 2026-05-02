/**
 * Shared layout option defaults and resolver.
 *
 * Both ELK and the fallback share the same vocabulary so a caller swapping
 * engines does not need to relearn parameters. The defaults reserve enough
 * gutter for thick orthogonal subway-style edges to route between siblings
 * without crowding the chrome.
 */

export type LayoutDirection = 'LR' | 'TB';

export type LayoutOptions = {
  readonly direction: LayoutDirection;
  readonly node_spacing: number;
  readonly rank_spacing: number;
};

export const DEFAULT_LAYOUT_OPTIONS: LayoutOptions = {
  direction: 'LR',
  node_spacing: 56,
  rank_spacing: 96,
};

export function resolve_options(input?: Partial<LayoutOptions>): LayoutOptions {
  if (input === undefined) return DEFAULT_LAYOUT_OPTIONS;
  return {
    direction: input.direction ?? DEFAULT_LAYOUT_OPTIONS.direction,
    node_spacing: input.node_spacing ?? DEFAULT_LAYOUT_OPTIONS.node_spacing,
    rank_spacing: input.rank_spacing ?? DEFAULT_LAYOUT_OPTIONS.rank_spacing,
  };
}
