/**
 * Single dispatch table mapping React Flow `type` keys to node components.
 *
 * Per constraints §3 "Dispatch-on-kind, never branch-on-kind" and taste
 * principle 4: this map is the *only* place that knows which component
 * renders which kind. Components do not import each other, do not branch on
 * other kinds, and cannot grow per-kind logic outside their own file.
 *
 * The transform tags each node with one of these `type` values; unknown
 * kinds get `'generic'` and fall through to `GenericNode` here.
 */

import type { NodeTypes } from '@xyflow/react';

import { CycleNode } from './CycleNode.js';
import { GenericNode } from './GenericNode.js';
import { ParallelNode } from './ParallelNode.js';
import { PipeNode } from './PipeNode.js';
import { RetryNode } from './RetryNode.js';
import { ScopeNode } from './ScopeNode.js';
import { SequenceNode } from './SequenceNode.js';
import { StashNode } from './StashNode.js';
import { StepNode } from './StepNode.js';
import { UseNode } from './UseNode.js';

export const node_types: NodeTypes = {
  step: StepNode,
  sequence: SequenceNode,
  parallel: ParallelNode,
  pipe: PipeNode,
  retry: RetryNode,
  scope: ScopeNode,
  stash: StashNode,
  use: UseNode,
  cycle: CycleNode,
  generic: GenericNode,
};
