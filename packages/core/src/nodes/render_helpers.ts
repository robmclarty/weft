/**
 * Test-only helpers for mounting React Flow node components inside
 * `@vitest/browser` Chromium specs. Not part of the public surface; reachable
 * only from colocated `*.test.tsx` files.
 */

import { ReactFlow, ReactFlowProvider } from '@xyflow/react';
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { edge_types } from '../edges/registry.js';
import type { WeftEdge, WeftNode } from '../transform/tree_to_graph.js';
import { node_types } from './registry.js';

// eslint-disable-next-line import/no-unassigned-import -- side-effect CSS import
import '@xyflow/react/dist/style.css';
// eslint-disable-next-line import/no-unassigned-import -- side-effect CSS import
import '../canvas/canvas.css';

export type MountedCanvas = {
  readonly container: HTMLDivElement;
  readonly unmount: () => void;
};

export function mount_canvas(
  nodes: ReadonlyArray<WeftNode>,
  edges: ReadonlyArray<WeftEdge>,
): MountedCanvas {
  const container = document.createElement('div');
  container.style.width = '900px';
  container.style.height = '600px';
  document.body.append(container);

  let root: Root;
  act(() => {
    root = createRoot(container);
    const tree: ReactElement = createElement(
      ReactFlowProvider,
      null,
      createElement(ReactFlow, {
        nodes: [...nodes],
        edges: [...edges],
        nodeTypes: node_types,
        edgeTypes: edge_types,
        nodesDraggable: false,
        nodesConnectable: false,
        proOptions: { hideAttribution: true },
      }),
    );
    root.render(tree);
  });
  return {
    container,
    unmount() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}
