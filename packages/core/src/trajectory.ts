/**
 * Wire-format schema for trajectory events emitted by fascicle's runner.
 *
 * Mirrors `packages/core/src/trajectory.ts` in the fascicle repo. Three
 * well-known shapes (span_start, span_end, emit) plus a permissive `custom`
 * fallback so any kind fascicle adds in the future round-trips without weft
 * needing to release first.
 *
 * Each well-known shape uses `.passthrough()` so additional fields (`run_id`,
 * `id`, provider-specific metadata, cost details) survive a parse / re-
 * serialize cycle. The discriminated union is order-sensitive: span events
 * resolve as their literal shape, everything else falls through `custom`.
 *
 * weft owns its boundary validation regardless of where the upstream type
 * declarations live.
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

export type SpanStartEvent = z.infer<typeof span_start_event_schema>;
export type SpanEndEvent = z.infer<typeof span_end_event_schema>;
export type EmitEvent = z.infer<typeof emit_event_schema>;
export type CustomTrajectoryEvent = z.infer<typeof custom_event_schema>;
export type ParsedTrajectoryEvent = z.infer<typeof trajectory_event_schema>;
