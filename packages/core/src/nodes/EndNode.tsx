/**
 * `END` terminator. Synthesized by the transform at the tail of the
 * top-level chain so the user can see "this is where the workflow
 * finishes" without inferring it from the absence of a trailing edge.
 */

import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { JSX } from 'react';
import { memo } from 'react';

import type { WeftNode } from '../transform/tree_to_graph.js';
import { EndGlyph } from './glyphs.js';

function EndNodeImpl(_: NodeProps<WeftNode>): JSX.Element {
  return (
    <div className="weft-node weft-node-end" data-weft-kind="end">
      <Handle type="target" position={Position.Left} id="in" />
      <span className="weft-node-end-glyph" aria-hidden="true">
        <EndGlyph />
      </span>
      <span className="weft-node-end-label">END</span>
    </div>
  );
}

export const EndNode = memo(EndNodeImpl);
