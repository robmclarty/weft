/**
 * Localhost WebSocket server for the watch CLI.
 *
 * Per spec §5.5 / research F9, the startup sequence is:
 *   1. Bind a WebSocket server on 127.0.0.1:0 (OS-assigned port).
 *   2. Await the `listening` event.
 *   3. Read `server.address().port`.
 *
 * Reading `address().port` before `listening` returns null; a separate probe
 * for a free port would TOCTOU-race another process. The order is enforced
 * here by `resolve_listening_port`, which is exported for unit-testing the
 * sequence in isolation (constraints §5.5).
 */

import type { AddressInfo } from 'node:net';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import type { WeftWatchMessage } from './messages.js';

export type WsServerHandle = {
  readonly port: number;
  readonly broadcast: (message: WeftWatchMessage) => void;
  readonly send_to: (client: SendableClient, message: WeftWatchMessage) => void;
  readonly on_connection: (callback: (client: WebSocket) => void) => void;
  readonly close: () => Promise<void>;
};

/**
 * Per-client send. Drops the message if the client is no longer in the OPEN
 * state. Extracted so the broadcast path can be exercised by a unit test
 * with mock clients (no real TCP connect is required).
 */
export type SendableClient = {
  readonly readyState: number;
  readonly OPEN: number;
  readonly send: (payload: string) => void;
};

export function send_to(client: SendableClient, message: WeftWatchMessage): void {
  if (client.readyState === client.OPEN) {
    client.send(JSON.stringify(message));
  }
}

/**
 * Iterates an iterable of clients and sends the JSON-serialized message to
 * each one whose readyState is OPEN. Pure: testable with mock clients.
 */
export function broadcast_to(
  clients: Iterable<SendableClient>,
  message: WeftWatchMessage,
): void {
  for (const client of clients) {
    send_to(client, message);
  }
}

export type ListeningServer = {
  readonly address: () => AddressInfo | string | null;
  readonly once: (event: 'listening' | 'error', listener: (...args: unknown[]) => void) => unknown;
};

/**
 * Awaits `listening` before reading `address()`. Exported to make the
 * sequence covered by a focused unit test (AC 5).
 */
export async function resolve_listening_port(server: ListeningServer): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once('listening', () => {
      resolve();
    });
    server.once('error', (err) => {
      reject(err instanceof Error ? err : new Error(String(err)));
    });
  });
  const address = server.address();
  if (typeof address !== 'object' || address === null) {
    throw new Error(
      `weft-watch: ws server did not return AddressInfo after listening (got ${String(address)})`,
    );
  }
  return address.port;
}

const LOCALHOST = '127.0.0.1';

export type StartWsServerOptions = {
  readonly host?: string;
  readonly port?: number;
};

export async function start_ws_server(
  options: StartWsServerOptions = {},
): Promise<WsServerHandle> {
  const host = options.host ?? LOCALHOST;
  const port = options.port ?? 0;
  const server = new WebSocketServer({ host, port });
  const resolved_port = await resolve_listening_port(server);

  const broadcast = (message: WeftWatchMessage): void => {
    broadcast_to(server.clients, message);
  };

  const on_connection = (callback: (client: WebSocket) => void): void => {
    server.on('connection', (client) => {
      callback(client);
    });
  };

  const close = (): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      for (const client of server.clients) {
        client.terminate();
      }
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

  return {
    port: resolved_port,
    broadcast,
    send_to,
    on_connection,
    close,
  };
}
