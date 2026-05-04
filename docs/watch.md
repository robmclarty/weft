# Live watch — the agent loop

`@robmclarty/weft-watch` tails a JSON file and broadcasts every change to a localhost WebSocket. The studio's `/watch?ws=<port>` route subscribes and re-renders. Together they make the iteration loop on a fascicle program tight as a REPL: edit a test, save, see the new tree.

```text
fascicle test                    weft-watch                       studio /watch
─────────────                    ──────────                       ──────────────
writeFileSync('/tmp/flow.json',  watches /tmp/flow.json           subscribes ws://127.0.0.1:<port>
  describe.json(my_flow));         on change → validate           on tree → re-render canvas (~500 ms)
                                   broadcast ws envelope          on invalid → keep last canvas
                                                                  on unreachable → banner
```

The full CLI reference lives in [`packages/watch/README.md`](../packages/watch/README.md). This doc covers the loop and the why.

## Install and run

```bash
npm i -g @robmclarty/weft-watch
weft-watch /tmp/flow.json
```

By default, weft-watch opens the studio in your browser, pre-pointed at `ws://127.0.0.1:<chosen_port>`. Pass `--no-open` to suppress, or `--studio-url <url>` to override the studio location (`{port}` is replaced at runtime).

The CLI reads the file once at startup, validates it against the `FlowNode` schema, and exits non-zero on validation failure with the offending JSON path. After that, it tails the file with `chokidar` and validates on each change.

## The fascicle side

Inside a fascicle test or scratchpad:

```typescript
import { describe } from '@robmclarty/fascicle';
import { writeFileSync } from 'node:fs';

writeFileSync('/tmp/flow.json', JSON.stringify(describe.json(my_flow), null, 2));
```

Save the test, weft-watch picks up the change, the studio re-renders.

The output of `describe.json(flow)` is the canonical wire form fascicle exports. Every primitive — `step`, `compose`, `parallel`, `branch`, `cycle`, `use`, `stash`, `fallback`, `timeout`, `suspend`, `checkpoint`, `wrap` — round-trips through it. weft renders all of them; see [primitives.md](./primitives.md).

## WebSocket protocol

Every message is a JSON envelope with a `kind` discriminator:

```typescript
type WeftWatchMessage =
  | { kind: 'tree'; tree: { version: 1; root: FlowNode } }
  | { kind: 'unreachable'; reason: 'deleted' | 'moved' | 'read_error'; path: string }
  | { kind: 'invalid'; path: string; zod_path: string; message: string };
```

Behaviour per kind in the studio:

- **`tree`** — re-render the canvas. Compose collapse and viewport persist (per-tree, keyed by `tree_id`).
- **`invalid`** — keep the last good canvas; surface a banner with the JSON path of the offending field. The user can keep working with the previous tree while they fix the file.
- **`unreachable`** — keep the last good canvas; surface a banner. Auto-recovers when the file reappears (or when chokidar's rename detection triggers).

A new client receives the most recent envelope (or the last-known invalid/unreachable) immediately on connect, so a late-joining studio catches up without waiting for the next file change.

The `kind` discriminator is the protocol's growth seam: future kinds (e.g., trajectory event overlays) can be added without breaking existing clients that branch on `kind` and ignore unknown values.

The WebSocket binds to `127.0.0.1` only. There is no remote watch.

## Why a separate file-and-WebSocket?

You could imagine wiring fascicle directly into the studio — a Node API that streams tree updates without touching disk. We don't, deliberately:

1. **Decoupled iteration.** A fascicle test is the simplest reproducible execution unit. `writeFileSync(... describe.json(flow))` makes the tree a first-class artifact you can `cat`, diff, commit, attach to a bug report.
2. **Multiple consumers.** The studio is one. A CI snapshot tool, a docs renderer, an inline preview in your editor — each can subscribe independently to the same file.
3. **The CLI ships without React.** `weft-watch` is pure Node (chokidar + ws + zod). It runs in containers, on remote machines, in CI without a browser.

## See also

- [packages/watch/README.md](../packages/watch/README.md) — full CLI reference, options, message envelope details.
- [studio.md](./studio.md) — the `/watch` route, banners, reconnect behavior.
- [embedding.md](./embedding.md) — if you want to wire your own data flow into the canvas instead of using weft-watch.
