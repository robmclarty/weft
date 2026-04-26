/**
 * PNG export helper.
 *
 * Captures the **full canvas** (all nodes), not just the visible viewport.
 * Recipe (spec §5.6 / research F6):
 *   1. `getNodesBounds(getNodes())` for the bounding rect of all nodes.
 *   2. `getViewportForBounds(...)` for the transform that fits those bounds.
 *   3. `toPng` against `.react-flow__viewport`, with a filter that excludes
 *      `.react-flow__minimap`, `.react-flow__controls`,
 *      `.react-flow__attribution`.
 *
 * `html-to-image` is pinned to exactly `1.11.11` (no caret, see research F6
 * and `package.json`); later versions are broken for React Flow edges.
 */

import { getNodesBounds, getViewportForBounds, type Edge, type Node, type ReactFlowInstance } from '@xyflow/react';
import { toPng } from 'html-to-image';

const EXPORT_PADDING = 32;
const MIN_DIMENSION = 64;
const MAX_DIMENSION = 8192;

const FILTER_SELECTORS = [
  'react-flow__minimap',
  'react-flow__controls',
  'react-flow__attribution',
];

function should_include(node: Element): boolean {
  if (!(node instanceof HTMLElement || node instanceof SVGElement)) return true;
  const cls = node.classList;
  for (const filter of FILTER_SELECTORS) {
    if (cls.contains(filter)) return false;
  }
  return true;
}

function blob_from_data_url(data_url: string): Promise<Blob> {
  return fetch(data_url).then((res) => res.blob());
}

export async function export_canvas_png<TN extends Node = Node, TE extends Edge = Edge>(
  instance: ReactFlowInstance<TN, TE>,
  container: HTMLElement,
): Promise<Blob> {
  const all_nodes = instance.getNodes();
  const bounds = getNodesBounds(all_nodes);

  const width = Math.min(MAX_DIMENSION, Math.max(MIN_DIMENSION, bounds.width + EXPORT_PADDING * 2));
  const height = Math.min(MAX_DIMENSION, Math.max(MIN_DIMENSION, bounds.height + EXPORT_PADDING * 2));

  const transform = getViewportForBounds(
    bounds,
    width,
    height,
    0.5,
    2,
    EXPORT_PADDING,
  );

  const viewport = container.querySelector<HTMLElement>('.react-flow__viewport');
  if (viewport === null) {
    throw new Error('weft.export_png: react-flow__viewport element not found');
  }

  const data_url = await toPng(viewport, {
    backgroundColor: '#ffffff',
    width,
    height,
    style: {
      width: `${width}px`,
      height: `${height}px`,
      transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.zoom})`,
    },
    filter: should_include,
  });

  return blob_from_data_url(data_url);
}
