# @robmclarty/weft-watch

Tail a [fascicle](https://github.com/robmclarty/fascicle) `FlowNode` JSON file
and broadcast every change to a localhost WebSocket. The companion to the
[weft](https://github.com/robmclarty/weft) studio: as a fascicle test rewrites
the file, the studio re-renders the canvas in real time.

The CLI ships without React, the canvas, or any heavy peer dependencies. The
studio is published separately under
[`@robmclarty/weft`](https://www.npmjs.com/package/@robmclarty/weft).

## Install

```bash
npm i -g @robmclarty/weft-watch
```

Node >= 20 is required.

## Usage

```bash
weft-watch <path> [options]
```

The CLI reads `<path>` once at startup, validates it against the `FlowNode`
schema, and then watches it for changes. On each change it re-reads,
re-validates, and broadcasts the result to all connected WebSocket clients.

### Options

| Flag                    | Default                                 | Description                                                |
| ----------------------- | --------------------------------------- | ---------------------------------------------------------- |
| `--no-open`             | open                                    | Do not open the studio in the default browser.             |
| `--studio-url <url>`    | `http://localhost:5173/watch?ws={port}` | Override the studio URL. `{port}` is replaced at runtime.  |
| `-h, --help`            |                                         | Show usage.                                                |

### Startup output

The CLI prints two machine-parseable lines to stdout when the WebSocket server
is ready and the initial file has been validated:

```text
weft-watch listening on ws://127.0.0.1:<port>
weft-watch studio url <resolved studio url>
```

If the initial file is missing or invalid, the CLI exits non-zero and writes
the error (with the offending JSON path on validation failure) to stderr.

The WebSocket server binds to `127.0.0.1` only. There is no remote watch.

## WebSocket message envelope

Every message broadcast on the WebSocket is JSON encoding the following
discriminated union (the `kind` field is the discriminator):

```typescript
type WeftWatchMessage =
  | { kind: 'tree'; tree: flow_tree }
  | {
      kind: 'unreachable';
      reason: 'deleted' | 'moved' | 'read_error';
      path: string;
    }
  | {
      kind: 'invalid';
      path: string;
      zod_path: string;
      message: string;
    };

type flow_tree = { version: 1; root: FlowNode };
```

Notes on each kind:

- **`tree`**: the file was successfully read and validated. `tree.root` is the
  parsed `FlowNode`.
- **`unreachable`**: the file is no longer readable. `reason` is `'deleted'`
  if the file was removed, `'moved'` if it was renamed, or `'read_error'` for
  any other I/O failure.
- **`invalid`**: the file exists but failed validation. `zod_path` is a JSON
  pointer to the offending field; `message` is the validator's diagnostic.
  The previous `tree` state on the client side should be preserved.

A new client receives the most recent `tree` (or last-known
`invalid`/`unreachable`) immediately on connect, so a late-joining studio
catches up without waiting for the next file change.

The `kind` discriminator is the protocol's growth seam: future kinds (e.g.,
v1 trajectory overlay events) can be added without breaking existing clients
that branch on `kind` and ignore unknown values.

## Iteration loop with fascicle

Inside a fascicle test or scratchpad:

```typescript
import { describe } from '@robmclarty/fascicle';
import { writeFileSync } from 'node:fs';

writeFileSync('/tmp/flow.json', JSON.stringify(describe.json(my_flow), null, 2));
```

In another shell:

```bash
weft-watch /tmp/flow.json
```

Save the test, weft-watch picks up the change, the studio re-renders.

## License

[Apache 2.0](../../LICENSE)
