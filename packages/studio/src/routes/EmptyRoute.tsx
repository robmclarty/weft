/**
 * `/` — empty canvas + loader panel.
 *
 * The user starts here. Loading via drag-drop, paste, or URL hands a
 * validated `flow_tree` to the canvas shell; subsequent loads replace
 * the rendered tree. Validation failures surface in the loader panel
 * and never replace the previous render.
 */

import { useState, type JSX } from 'react';

import type { FlowTree } from '@repo/weft';

import { CanvasShell } from '../components/CanvasShell.js';
import {
  LoaderPanel,
  type LoaderError,
} from '../components/LoaderPanel.js';

export function EmptyRoute(): JSX.Element {
  const [tree, set_tree] = useState<FlowTree | null>(null);
  const [error, set_error] = useState<LoaderError | null>(null);
  return (
    <main className="weft-main" data-weft-route="empty">
      <CanvasShell
        tree={tree}
        empty_message={
          <span>
            paste a flow_tree on the right
            <br />
            <span style={{ color: 'var(--weft-fg-muted)', fontSize: 11 }}>
              or drop a JSON file, or fetch one from a URL
            </span>
          </span>
        }
        side_top={
          <LoaderPanel
            on_loaded={(loaded) => {
              set_tree(loaded);
              set_error(null);
            }}
            on_error={(err) => {
              set_error(err);
            }}
            last_error={error}
            tree_loaded={tree !== null}
          />
        }
      />
    </main>
  );
}
