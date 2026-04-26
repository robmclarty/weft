#!/usr/bin/env node
/**
 * weft-watch CLI entry point.
 *
 * Parses argv, runs the startup sequence, and (when invoked as a binary)
 * keeps the event loop alive on the WebSocket server. The CLI is the only
 * place in @repo/watch that reads `process.argv`; constraints §2 forbids
 * `process.env` reads anywhere in package source.
 *
 * Startup sequence per spec §5.5 / research F9:
 *   1. Bind WebSocket server on 127.0.0.1:0.
 *   2. Await `listening`; resolve `address().port`.
 *   3. Read + validate the file. On invalid input, exit non-zero.
 *   4. Construct the studio URL.
 *   5. Open the default browser (unless --no-open).
 *   6. Start the chokidar watcher.
 */

import { resolve } from 'node:path';
import { argv as process_argv, exit, stderr, stdout } from 'node:process';
import { Command } from 'commander';
import { open_browser } from './open_browser.js';
import { read_and_validate } from './validate.js';
import { start_watcher } from './watcher.js';
import { start_ws_server } from './ws_server.js';
import type { WeftWatchMessage } from './messages.js';
import type { WsServerHandle } from './ws_server.js';

const DEFAULT_STUDIO_URL = 'http://localhost:5173/watch?ws={port}';

export type CliOptions = {
  readonly path: string;
  readonly open: boolean;
  readonly studio_url: string;
};

export type CliHandle = {
  readonly url: string;
  readonly port: number;
  readonly close: () => Promise<void>;
};

function build_program(): Command {
  const program = new Command();
  program
    .name('weft-watch')
    .description(
      'Watch a fascicle FlowNode JSON file and broadcast changes over a localhost WebSocket.',
    )
    .argument('<path>', 'path to the JSON file to watch')
    .option('--no-open', 'do not open the studio in the default browser')
    .option(
      '--studio-url <url>',
      'override the default studio URL (use {port} as the port placeholder)',
      DEFAULT_STUDIO_URL,
    )
    .helpOption('-h, --help', 'show help');
  return program;
}

export function parse_argv(argv: ReadonlyArray<string>): CliOptions {
  const program = build_program();
  program.parse(['node', 'weft-watch', ...argv]);
  const opts = program.opts<{ open: boolean; studioUrl: string }>();
  const file_path = program.args[0];
  if (typeof file_path !== 'string' || file_path.length === 0) {
    throw new Error('weft-watch: missing required <path> argument');
  }
  return {
    path: file_path,
    open: opts.open,
    studio_url: opts.studioUrl,
  };
}

export function build_studio_url(template: string, port: number): string {
  if (template.includes('{port}')) {
    return template.replaceAll('{port}', String(port));
  }
  return template;
}

export async function load_initial_tree(
  file_path: string,
): Promise<WeftWatchMessage> {
  const result = await read_and_validate(file_path);
  if (result.kind === 'tree') return { kind: 'tree', tree: result.tree };
  if (result.kind === 'invalid') {
    return {
      kind: 'invalid',
      path: file_path,
      zod_path: result.zod_path,
      message: result.message,
    };
  }
  return {
    kind: 'unreachable',
    reason: 'read_error',
    path: file_path,
  };
}

export function format_initial_failure(
  file_path: string,
  message: WeftWatchMessage,
): string | null {
  if (message.kind === 'invalid') {
    return `weft-watch: invalid ${file_path} at ${message.zod_path}: ${message.message}`;
  }
  if (message.kind === 'unreachable') {
    return `weft-watch: cannot read ${file_path} (${message.reason})`;
  }
  return null;
}

export async function main(argv: ReadonlyArray<string>): Promise<CliHandle> {
  const options = parse_argv(argv);
  const absolute_path = resolve(options.path);

  const server: WsServerHandle = await start_ws_server();
  const url = build_studio_url(options.studio_url, server.port);

  const initial = await load_initial_tree(absolute_path);
  const failure = format_initial_failure(absolute_path, initial);
  if (failure !== null) {
    await server.close();
    throw new Error(failure);
  }

  let current: WeftWatchMessage = initial;

  server.on_connection((client) => {
    server.send_to(client, current);
  });

  const watcher = start_watcher(absolute_path, {
    on_message: (message) => {
      if (message.kind === 'tree') {
        current = message;
      } else if (message.kind === 'unreachable' || message.kind === 'invalid') {
        // Keep the previous valid `current` tree so newly connecting clients
        // still see the last known good state. The state-of-the-watch is
        // signalled separately via the broadcast below.
      }
      server.broadcast(message);
    },
  });

  stdout.write(`weft-watch listening on ws://127.0.0.1:${server.port}\n`);
  stdout.write(`weft-watch studio url ${url}\n`);

  if (options.open) {
    open_browser(url);
  }

  const close = async (): Promise<void> => {
    await watcher.close();
    await server.close();
  };

  return { url, port: server.port, close };
}

const invoked_directly = import.meta.url === `file://${process_argv[1] ?? ''}`;
if (invoked_directly) {
  main(process_argv.slice(2)).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    stderr.write(`${message}\n`);
    exit(1);
  });
}
