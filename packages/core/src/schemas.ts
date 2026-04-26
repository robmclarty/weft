/**
 * FlowNode / FlowValue type definitions and Zod schemas.
 *
 * The shape mirrors the upstream contract documented in
 * `.ridgeline/builds/v0/spec.md` §3 (Data Model) and matches the JSON
 * produced by fascicle's `describe.json(flow)`.
 *
 * Once `@robmclarty/fascicle` is published, the type-only definitions in this
 * file should be replaced with `import type { FlowNode, FlowValue } from
 * '@robmclarty/fascicle'`. The schema definitions stay here either way: weft
 * owns its boundary validation regardless of where the upstream types live.
 */

import { z } from 'zod';

export type FlowValue =
  | string
  | number
  | boolean
  | null
  | ReadonlyArray<FlowValue>
  | Readonly<{ [key: string]: FlowValue }>
  | { readonly kind: '<fn>'; readonly name?: string | undefined }
  | { readonly kind: '<schema>' }
  | { readonly kind: string; readonly id: string };

export type FlowNode = {
  readonly kind: string;
  readonly id: string;
  readonly config?: Readonly<{ [key: string]: FlowValue }> | undefined;
  readonly children?: ReadonlyArray<FlowNode> | undefined;
};

export type FlowTree = {
  readonly version: 1;
  readonly root: FlowNode;
};

const fn_ref_schema = z.object({
  kind: z.literal('<fn>'),
  name: z.string().optional(),
});

const schema_ref_schema = z.object({
  kind: z.literal('<schema>'),
});

const tagged_ref_schema = z.object({
  kind: z.string(),
  id: z.string(),
});

export const flow_value_schema: z.ZodType<FlowValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    fn_ref_schema,
    schema_ref_schema,
    tagged_ref_schema,
    z.array(flow_value_schema),
    z.record(z.string(), flow_value_schema),
  ]),
);

export const flow_node_schema: z.ZodType<FlowNode> = z.lazy(() =>
  z
    .object({
      kind: z.string(),
      id: z.string(),
      config: z.record(z.string(), flow_value_schema).optional(),
      children: z.array(flow_node_schema).optional(),
    })
    .refine(
      (node) => {
        if (node.kind !== 'parallel') return true;
        const keys = node.config?.['keys'];
        if (!Array.isArray(keys)) return false;
        if (!keys.every((entry) => typeof entry === 'string')) return false;
        const child_count = node.children?.length ?? 0;
        return keys.length === child_count;
      },
      {
        message:
          'parallel: config.keys must be a string[] whose length equals children.length',
        path: ['config', 'keys'],
      },
    ),
);

export const flow_tree_schema: z.ZodType<FlowTree> = z.object({
  version: z.literal(1),
  root: flow_node_schema,
});
