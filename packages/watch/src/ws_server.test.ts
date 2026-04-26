import { describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import {
  broadcast_to,
  resolve_listening_port,
  send_to,
  start_ws_server,
} from './ws_server.js';
import type { ListeningServer, SendableClient } from './ws_server.js';
import type { WeftWatchMessage } from './messages.js';

function wait_for_ws_event<T>(client: WebSocket, event: 'message' | 'open'): Promise<T> {
  return new Promise<T>((resolve) => {
    if (event === 'open') {
      client.once('open', () => {
        resolve(undefined as T);
      });
    } else {
      client.once('message', (data) => {
        resolve(data as T);
      });
    }
  });
}

describe('resolve_listening_port', () => {
  it('reads address() only AFTER `listening` fires', async () => {
    const order: string[] = [];
    let listening_listener: (() => void) | null = null;
    let address_value: { port: number; address: string; family: string } | null = null;
    const fake_server: ListeningServer = {
      address: () => {
        order.push(`address():${address_value === null ? 'null' : 'port'}`);
        return address_value;
      },
      once: (event, listener) => {
        order.push(`once:${event}`);
        if (event === 'listening') {
          listening_listener = listener as () => void;
        }
        return undefined;
      },
    };

    const promise = resolve_listening_port(fake_server);
    // Give the microtask queue a chance to call address() if the implementation
    // is buggy (i.e., does it before awaiting `listening`).
    await Promise.resolve();
    await Promise.resolve();
    expect(order).not.toContain('address():null');
    expect(order).not.toContain('address():port');

    // Fire `listening`. The resolver should now read address().
    address_value = { port: 12345, address: '127.0.0.1', family: 'IPv4' };
    if (listening_listener === null) {
      throw new Error('listening listener was not registered');
    }
    (listening_listener as () => void)();
    const port = await promise;
    expect(port).toBe(12345);
    expect(order[0]).toBe('once:listening');
    expect(order).toContain('address():port');
    // Crucial: address() is read AFTER once:listening was registered AND fired.
    const address_idx = order.indexOf('address():port');
    expect(address_idx).toBeGreaterThan(order.indexOf('once:listening'));
  });

  it('rejects when the server emits `error` before `listening`', async () => {
    let error_listener: ((err: Error) => void) | null = null;
    const fake_server: ListeningServer = {
      address: () => null,
      once: (event, listener) => {
        if (event === 'error') {
          error_listener = listener as (err: Error) => void;
        }
        return undefined;
      },
    };
    const promise = resolve_listening_port(fake_server);
    if (error_listener === null) {
      throw new Error('error listener was not registered');
    }
    (error_listener as (err: Error) => void)(new Error('bind failed'));
    await expect(promise).rejects.toThrow(/bind failed/);
  });

  it('throws when address() returns null after listening (defensive)', async () => {
    let listening_listener: (() => void) | null = null;
    const fake_server: ListeningServer = {
      address: () => null,
      once: (event, listener) => {
        if (event === 'listening') {
          listening_listener = listener as () => void;
        }
        return undefined;
      },
    };
    const promise = resolve_listening_port(fake_server);
    if (listening_listener === null) {
      throw new Error('listening listener was not registered');
    }
    (listening_listener as () => void)();
    await expect(promise).rejects.toThrow(/AddressInfo/);
  });
});

function make_mock_client(): SendableClient & { sent: string[] } {
  const sent: string[] = [];
  return {
    readyState: 1,
    OPEN: 1,
    send: (payload: string) => {
      sent.push(payload);
    },
    sent,
  };
}

const SAMPLE_TREE_MESSAGE: WeftWatchMessage = {
  kind: 'tree',
  tree: { version: 1, root: { kind: 'step', id: 's1' } },
};

describe('send_to', () => {
  it('sends the JSON-encoded message when the client is OPEN', () => {
    const client = make_mock_client();
    send_to(client, SAMPLE_TREE_MESSAGE);
    expect(client.sent.length).toBe(1);
    expect(JSON.parse(client.sent[0] ?? '')).toEqual(SAMPLE_TREE_MESSAGE);
  });

  it('drops the message when the client is not OPEN', () => {
    const client = make_mock_client();
    const closed = { ...client, readyState: 3 };
    send_to(closed, SAMPLE_TREE_MESSAGE);
    expect(client.sent.length).toBe(0);
  });
});

describe('broadcast_to', () => {
  it('sends to every OPEN client and skips closed ones', () => {
    const open_a = make_mock_client();
    const open_b = make_mock_client();
    const closed = { ...make_mock_client(), readyState: 3 };
    broadcast_to([open_a, open_b, closed], {
      kind: 'unreachable',
      reason: 'deleted',
      path: '/x.json',
    });
    expect(open_a.sent.length).toBe(1);
    expect(open_b.sent.length).toBe(1);
    expect(open_a.sent[0]).toContain('"kind":"unreachable"');
  });

  it('is a no-op when given an empty iterable', () => {
    expect(() => {
      broadcast_to([], SAMPLE_TREE_MESSAGE);
    }).not.toThrow();
  });
});

describe('start_ws_server (bind only)', () => {
  it('binds to 127.0.0.1 with an OS-assigned port and exposes a handle', async () => {
    const handle = await start_ws_server();
    expect(handle.port).toBeGreaterThan(0);
    expect(typeof handle.broadcast).toBe('function');
    expect(typeof handle.send_to).toBe('function');
    expect(typeof handle.on_connection).toBe('function');
    expect(typeof handle.close).toBe('function');
    // broadcast with no clients connected is a no-op.
    handle.broadcast(SAMPLE_TREE_MESSAGE);
    await handle.close();
  });

  it('rejects when an attempt to bind a duplicate port collides', async () => {
    const first = await start_ws_server();
    await expect(
      start_ws_server({ port: first.port }),
    ).rejects.toThrow();
    await first.close();
  });
});

// Some sandboxes block outbound 127.0.0.1 connect() even when bind() works.
// vitest.config.ts probes for this and exposes the result via this env var.
const LOOPBACK_OK = process.env['WEFT_LOOPBACK_AVAILABLE'] !== '0';

describe.skipIf(!LOOPBACK_OK)('start_ws_server (with clients)', () => {
  it('binds to 127.0.0.1 with an OS-assigned port and broadcasts to clients', async () => {
    const handle = await start_ws_server();
    expect(handle.port).toBeGreaterThan(0);

    const client = new WebSocket(`ws://127.0.0.1:${handle.port}`);
    await wait_for_ws_event<undefined>(client, 'open');

    const received: string[] = [];
    client.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
      received.push(Buffer.isBuffer(data) ? data.toString('utf8') : Buffer.from(data as ArrayBuffer).toString('utf8'));
    });

    handle.broadcast({
      kind: 'unreachable',
      reason: 'deleted',
      path: '/tmp/x.json',
    });

    // Give the message a tick to arrive.
    await new Promise<void>((r) => setTimeout(r, 50));
    expect(received.length).toBe(1);
    expect(received[0]).toContain('"kind":"unreachable"');

    client.close();
    await handle.close();
  });

  it('invokes the connection callback with the new client', async () => {
    const handle = await start_ws_server();
    let connections = 0;
    handle.on_connection(() => {
      connections += 1;
    });
    const client = new WebSocket(`ws://127.0.0.1:${handle.port}`);
    await wait_for_ws_event<undefined>(client, 'open');
    // Wait for connection event to fire on the server.
    await new Promise<void>((r) => setTimeout(r, 50));
    expect(connections).toBe(1);
    client.close();
    await handle.close();
  });
});
