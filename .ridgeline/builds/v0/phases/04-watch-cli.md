# Phase 4: Watch CLI Standalone

## Goal

Deliver `@robmclarty/weft-watch` as a fully working, independently testable Node CLI: it watches a file with chokidar, validates each new revision against a Zod schema with parity to the studio's, and broadcasts the validated `flow_tree` to all connected WebSocket clients on a localhost-bound socket. Define the WebSocket message envelope (the contract phase 5's studio client will consume). Verify the CLI end-to-end with a bare `ws` test client — no studio required.

After this phase, the watch loop's *server side* is complete and load-bearing for phase 5: phase 5 builds the studio's WebSocket client against the envelope this phase defines, and the integration tests in phase 5 reuse the `weft-watch` binary built here.

## Context

Phase 1 set up the four-package workspace with `@repo/watch`'s manifest in place and the mechanical check that `@repo/watch/src/` does not import `react`, `react-dom`, `@xyflow/react`, `elkjs`, `@repo/core`, or `@repo/weft`. Phases 2 and 3 built the library and umbrella; this phase touches none of that code.

The watch CLI has zero React or canvas surface. It uses `chokidar` for file watching, `ws` for the WebSocket server, and `commander` for argv parsing. It validates input with `zod`. It cannot import `@repo/weft`'s schemas because the import boundary forbids it (constraints §3 watch CLI import rules — no React peer surface). The watch CLI defines its own Zod schema in `@repo/watch/src/schemas.ts`; a shared fixture suite asserts parity with `@repo/weft`'s schema (loads each fixture, validates against both, asserts identical accept/reject outcomes). This keeps the import boundary clean without risking schema drift.

The single source of truth for "done" remains `pnpm check` exiting 0.

Inputs: spec.md §4.2 (the `?ws=` route the CLI must construct), §5.5, §6 (Watch CLI ≥ Node 20), §8 F1 / F7 / F8 / F9, §9, §10, §11; constraints.md §3 (watch CLI import rules), §4 (forbidden dependencies), §5.3, §5.5, §5.6, §7 invariant 7, §9; the fixtures from phase 1.

Outputs consumed by phase 5: the `weft-watch` binary, the WebSocket message envelope contract, the file-deleted "unreachable" signal, the `--no-open` and `--studio-url` flags.

## Acceptance Criteria

1. `pnpm check` exits 0 across the entire workspace after this phase completes.
2. `packages/watch/package.json` declares `"bin": { "weft-watch": "./dist/bin.js" }`, name `@repo/watch`, published name `@robmclarty/weft-watch`, and is ESM. Node engine `>= 20`.
3. `packages/watch/src/` source files import none of: `react`, `react-dom`, `@xyflow/react`, `elkjs`, `@repo/core`, `@repo/weft`, `@repo/studio`. The mechanical check from phase 1 (constraints §7 invariant 7) passes against the new code.
4. `@repo/watch/src/` reads no `process.env`. `bin.ts` parses `process.argv` only (constraints §2). The mechanical check from phase 1 (constraints §7 invariant 3) passes against the new code.
5. Startup sequence per research F9, in this exact order: bind a WebSocket server on `127.0.0.1:0`; await the `listening` event; **then** read `server.address().port`. The resolved port is used to construct the studio URL. A test verifies the port is never read before `listening` fires (e.g., by stubbing `address()` to return `null` until after `listening` and asserting the CLI does not race ahead).
6. `weft-watch <path>` reads the file, validates it through `@repo/watch/src/schemas.ts`, and exits non-zero with a stderr message (including the offending JSON path) on validation failure (spec §8 F1).
7. **Schema parity test.** For every fixture in `fixtures/`, a test validates the fixture against both `@repo/weft`'s schema and `@repo/watch`'s schema and asserts identical accept/reject outcomes (and identical offending-path output on rejection). This keeps the duplicated schema honest without violating the import boundary.
8. The CLI does **not** start a Vite dev server — that is the user's responsibility (spec §5.5). The CLI assumes the studio is running or can be started separately.
9. `weft-watch` opens `http://localhost:5173/watch?ws=<port>` in the default browser by default. The `--no-open` flag skips the browser launch (headless / CI). The `--studio-url <url>` flag overrides the default studio URL (spec §5.5, research F9).
10. The CLI watches the file with `chokidar`. On change it re-reads, re-validates, and broadcasts the new tree to all connected WebSocket clients in a documented, stable message envelope. The envelope shape is:

    ```typescript
    type WeftWatchMessage =
      | { kind: 'tree'; tree: flow_tree }
      | { kind: 'unreachable'; reason: 'deleted' | 'moved' | 'read_error'; path: string }
      | { kind: 'invalid'; path: string; zod_path: string; message: string };
    ```

    The `kind` discriminator allows the protocol to grow without breaking clients (spec §5.5). The envelope is documented in `packages/watch/README.md` (the published package's user-facing doc) so the contract is discoverable from npm.
11. If the watched file is deleted or moved, the CLI keeps the WebSocket open and emits `{ kind: 'unreachable', reason, path }` to all clients (spec §8 F7). Phase 5's studio surfaces a banner against this signal; for now, a `ws` test client receives and asserts on the message.
12. If the watched file is replaced with content that fails Zod validation, the CLI emits `{ kind: 'invalid', ... }` (not `tree`), so the previous canvas remains valid on the client side (spec §5.3 / §8 F1 carry across the wire).
13. Validation failures during a hot reload do not crash the CLI; the watcher remains active and waits for the next change.
14. Logging is `console`-only (constraints §4). No third-party logging library.
15. **Integration tests against a bare `ws` client (no studio):**
    - **Startup + happy path:** spawn `weft-watch fixtures/simple_sequence.json --no-open`; read the resolved URL from CLI stdout (per AC 16); connect a `ws` client; receive the initial `tree` message; assert envelope shape and tree content.
    - **File change broadcast:** with the client connected, modify the watched file, assert a new `tree` message arrives within 500ms.
    - **File deleted:** with the client connected, delete the watched file, assert an `unreachable` message arrives.
    - **Invalid replacement:** with the client connected, replace the file with malformed JSON, assert an `invalid` message arrives and the previous tree state is implicitly preserved (no `tree` message follows).
16. The startup sequence prints the resolved URL to stdout on a single line in a documented machine-parseable format (e.g., `weft-watch listening on ws://127.0.0.1:<port>`), so phase 5's integration tests and human users can both discover the port without race conditions.
17. Coverage floor of 70% lines / functions / branches / statements is met for `@repo/watch`.

## Spec Reference

- spec.md §4.2 (Studio app interface — `/watch?ws=<port>` is the URL the CLI constructs)
- spec.md §5.5 (Watch mode — startup sequence per research F9, CLI flags, no Vite startup)
- spec.md §6 (Watch CLI ≥ Node 20; no logging library)
- spec.md §8 F1 (malformed JSON), F7 (file deleted/moved), F8 (WebSocket disconnect — server-side handling), F9 (URL fetch failure / PNA — informs studio's preference for the watch CLI)
- spec.md §9 (Success Criteria — watch-mode integration test landing in phase 5; this phase ships its server-only counterpart)
- spec.md §10 (File Structure — `packages/watch/`)
- spec.md §11 (Environment Variables — none)
- constraints.md §3 (Watch CLI import rules — no React, no `@repo/core`, no `@repo/weft`)
- constraints.md §4 (Forbidden dependencies — no HTTP clients, no logging libraries)
- constraints.md §5.3 (Validation at the system boundary), §5.5 (Watch CLI binds to localhost), §5.6 (No telemetry)
- constraints.md §7 invariants 3, 7 (re-verified against real watch source)
- constraints.md §9 (Testing Requirements — no real network in CI; localhost socket only)
- taste.md principles 1, 7, 9
- design.md §3 (Watch path data flow)
