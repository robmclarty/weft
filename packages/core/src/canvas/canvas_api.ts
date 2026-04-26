/**
 * Imperative canvas handle.
 *
 * Returned to the caller via `WeftCanvas`'s `on_ready` prop once the canvas
 * is mounted and interactive. The shape matches spec.md §4.1.
 */

export type CanvasViewport = {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
};

export type CanvasApi = {
  readonly focus_node: (id: string) => void;
  readonly fit_view: () => void;
  readonly export_png: () => Promise<Blob>;
  readonly get_viewport: () => CanvasViewport;
};
