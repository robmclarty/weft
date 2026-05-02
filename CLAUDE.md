# CLAUDE.md

Claude Code-specific instructions for this repository.

Read [AGENTS.md](./AGENTS.md) for the universal contract. This file only adds what is Claude-specific.

## Workflow

1. Plan in text first for any task larger than a typo. Reference files with full paths.
2. Implement with small, focused diffs.
3. Verify with `pnpm check`. Do not claim done until it exits 0.

## Tool use

- **fallow MCP** is wired in `.mcp.json`. Call fallow tools (`analyze`, `check_changed`) during implementation rather than re-running `pnpm check` in a tight loop.
- **Playwright MCP** is wired in `.mcp.json`. Use it for visual iteration on the studio: spin up `pnpm --filter @repo/studio dev`, navigate, screenshot, evaluate. Cheaper than asking the user for screenshots and matches what the design looks like to a real browser.
- For faster iteration, use `pnpm check --bail --only <checks>` or `pnpm exec tsc --noEmit`. Run the full `pnpm check` once at the end.

## Visual iteration loop

When changing canvas chrome, layout, or any per-node renderer:

1. Boot the studio: `pnpm --filter @repo/studio dev`.
2. Open `http://127.0.0.1:5173/view?src=http://127.0.0.1:5173/fixtures/all_primitives.json` (the deepest-nesting fixture; covers every primitive).
3. Make the change; Vite HMRs.
4. Compare against the previous baseline with `pnpm screenshots` — this writes `.screenshots/<scenario>.png`. Diff against the prior run.
5. Auto-fit only fires once per tree per mount, gated by an in-component ref. Persistence stores the user's pinned viewport; the canvas treats `{zoom:1,x:0,y:0}` as "no preference" so the first load auto-fits even after the persistence layer touches the LRU index.

Common gotchas:

- `useNodesInitialized()` is unreliable when ELK supplies explicit node sizes — the ResizeObserver path it watches doesn't always fire. Use a staggered `setTimeout` retry fan instead (see `WeftCanvas.tsx`).
- ELK's hierarchical layout requires `'elk.hierarchyHandling': 'INCLUDE_CHILDREN'` at the root *plus* `nodeSize.constraints` + `padding` per container, otherwise parents stay at default size and children overflow.
- Container CSS `min-width`/`min-height` will silently override React Flow's inline width/height. Match the ELK `nodeSize.minimum` to those CSS values, not the leaf-default sizes.
