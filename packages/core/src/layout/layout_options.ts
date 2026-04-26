/**
 * Shared layout option defaults and resolver.
 *
 * The defaults match spec.md §4.1: direction `'LR'`, node spacing `40`,
 * rank spacing `80`. Both ELK and the fallback share the same vocabulary so a
 * caller swapping engines does not need to relearn parameters.
 */

export type LayoutDirection = 'LR' | 'TB';

export type LayoutOptions = {
  readonly direction: LayoutDirection;
  readonly node_spacing: number;
  readonly rank_spacing: number;
};

export const DEFAULT_LAYOUT_OPTIONS: LayoutOptions = {
  direction: 'LR',
  node_spacing: 40,
  rank_spacing: 80,
};

export function resolve_options(input?: Partial<LayoutOptions>): LayoutOptions {
  if (input === undefined) return DEFAULT_LAYOUT_OPTIONS;
  return {
    direction: input.direction ?? DEFAULT_LAYOUT_OPTIONS.direction,
    node_spacing: input.node_spacing ?? DEFAULT_LAYOUT_OPTIONS.node_spacing,
    rank_spacing: input.rank_spacing ?? DEFAULT_LAYOUT_OPTIONS.rank_spacing,
  };
}
