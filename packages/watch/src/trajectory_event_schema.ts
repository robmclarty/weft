/**
 * Wire-format schema for fascicle trajectory events.
 *
 * Local mirror of `packages/core/src/trajectory.ts`. Kept inside `@repo/watch`
 * so the published `@robmclarty/weft-watch` artifact does not pull `@repo/core`
 * (or React) into a user's install graph. The same boundary discipline already
 * applies to `flow_tree_schema` in `schemas.ts`.
 *
 * The drift detector lives in `@repo/core`'s tests
 * (`__tests__/fixtures/trajectory_sample.jsonl`); a wire-format change in
 * fascicle would fail there first. If it diverges from the core mirror, both
 * files must be updated together.
 *
 * `.passthrough()` keeps `id`, `run_id`, `cost.total_usd`, `parent_span_id`,
 * etc. on the parsed event — the studio reducer (`derive_runtime_state`) reads
 * those passthrough fields directly.
 */

import { z } from 'zod';

export const span_start_event_schema = z
  .object({
    kind: z.literal('span_start'),
    span_id: z.string(),
    name: z.string(),
  })
  .passthrough();

export const span_end_event_schema = z
  .object({
    kind: z.literal('span_end'),
    span_id: z.string(),
  })
  .passthrough();

export const emit_event_schema = z
  .object({
    kind: z.literal('emit'),
  })
  .passthrough();

export const custom_event_schema = z
  .object({
    kind: z.string(),
  })
  .passthrough();

export const trajectory_event_schema = z.union([
  span_start_event_schema,
  span_end_event_schema,
  emit_event_schema,
  custom_event_schema,
]);

export type ParsedTrajectoryEvent = z.infer<typeof trajectory_event_schema>;
