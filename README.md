# weft

UI for [Fascicle](https://github.com/robmclarty/fascicle). A React Flow canvas that visualizes fascicle composition trees — every primitive, every wrapper, every labeled edge — with ELK layout and a live watch loop.

![weft studio rendering an agent_pipeline FlowTree](./docs/assets/studio-canvas.png)

The shot above is one fascicle FlowTree rendered by the studio: a `compose` root containing `stash`, a `branch` (the diamond, with `THEN` / `OTHERWISE`), a `use` reading the stashed key, a `cycle` with its `u ≤ 5` back-edge, a `parallel` of language-specific translations, and a `suspend` resume gate.

## Why weft exists

Fascicle programs *are* the tree. The composition is the source of truth — `step`, `compose`, `parallel`, `branch`, `cycle`, `use`, `stash`, `fallback`, `timeout`, `suspend`, `checkpoint`, `wrap` — wired together with edges that carry data, control, and policy. Reading that tree as JSON is fine for machines and miserable for humans. Reading it as code is better, until the tree gets big enough that the structure stops fitting in your head.

weft renders the tree so you can see it. Three commitments shape the project:

- **Faithful, never stylized.** Every primitive in the tree gets a renderer. Wrappers (retry, semaphore, timeout, cache) are visible badges. Edge labels reflect what fascicle actually emits — `THEN`, `OTHERWISE`, `PRIMARY`, `BACKUP`, `SUMMARY`, the cycle's bound. If a fascicle program does it, the canvas shows it.
- **Live by default.** Write a fascicle test, dump the tree to JSON, and the canvas re-renders within ~500 ms of every save. The hacking loop is `weft-watch <file>` plus a browser tab — the same tightness as a REPL, applied to composition.
- **Embeddable.** The canvas is a React component (`@robmclarty/weft`). Anything that can mount React can host a fascicle diagram — docs sites, internal tools, post-mortem timelines, runtime overlays of in-flight executions.

## The pieces

| Package         | Workspace name | Published as            | Role                                                                  |
| --------------- | -------------- | ----------------------- | --------------------------------------------------------------------- |
| `packages/core` | `@repo/core`   | —                       | Schemas, transform, ELK layout, React Flow canvas, node renderers     |
| `packages/weft` | `@repo/weft`   | `@robmclarty/weft`      | Curated public surface — re-exports only                              |
| `packages/watch` | `@repo/watch` | `@robmclarty/weft-watch` | Node CLI: tails a JSON file, broadcasts changes over a localhost WS  |
| `packages/studio` | `@repo/studio` | — (unpublished SPA)   | Vite app with `/view?src=…` (URL fetch) and `/watch?ws=…` (live)      |

## Getting started

- New to the repo? Start with [docs/getting-started.md](./docs/getting-started.md).
- Working with an agent in this repo? Read [AGENTS.md](./AGENTS.md) (universal) and [CLAUDE.md](./CLAUDE.md) (Claude-specific).
- Visual testing strategy lives in [docs/visual-testing.md](./docs/visual-testing.md).
- Layout quality work is tracked in [docs/layout-quality-plan.md](./docs/layout-quality-plan.md).

## License

[Apache 2.0](./LICENSE).
