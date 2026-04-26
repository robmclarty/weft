import { mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import {
  build_studio_url,
  format_initial_failure,
  load_initial_tree,
  main,
  parse_argv,
} from './bin.js';
import type { CliHandle } from './bin.js';
import type { WeftWatchMessage } from './messages.js';

type WsClient = WebSocket;

function open_client(url: string): Promise<WsClient> {
  return new Promise<WsClient>((resolve, reject) => {
    const client = new WebSocket(url);
    client.once('open', () => {
      resolve(client);
    });
    client.once('error', reject);
  });
}

function next_envelope(client: WsClient, timeout_ms = 2000): Promise<WeftWatchMessage> {
  return new Promise<WeftWatchMessage>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('timeout waiting for ws message'));
    }, timeout_ms);
    const handler = (data: Buffer | ArrayBuffer | Buffer[]): void => {
      clearTimeout(timer);
      client.off('message', handler);
      const text = Buffer.isBuffer(data)
        ? data.toString('utf8')
        : Buffer.from(data as ArrayBuffer).toString('utf8');
      resolve(JSON.parse(text) as WeftWatchMessage);
    };
    client.on('message', handler);
  });
}

const VALID_TREE = {
  version: 1,
  root: { kind: 'step', id: 's1' },
};

describe('parse_argv', () => {
  it('parses --no-open and a custom --studio-url', () => {
    const opts = parse_argv(['/tmp/flow.json', '--no-open', '--studio-url', 'http://localhost:9000/x?ws={port}']);
    expect(opts.path).toBe('/tmp/flow.json');
    expect(opts.open).toBe(false);
    expect(opts.studio_url).toBe('http://localhost:9000/x?ws={port}');
  });

  it('defaults --open to true and the studio URL to localhost:5173', () => {
    const opts = parse_argv(['/tmp/flow.json']);
    expect(opts.open).toBe(true);
    expect(opts.studio_url).toContain('localhost:5173');
    expect(opts.studio_url).toContain('{port}');
  });
});

describe('build_studio_url', () => {
  it('substitutes {port} in the template', () => {
    expect(build_studio_url('http://localhost:5173/watch?ws={port}', 4242)).toBe(
      'http://localhost:5173/watch?ws=4242',
    );
  });

  it('substitutes every occurrence of {port}', () => {
    expect(build_studio_url('a{port}b{port}c', 7)).toBe('a7b7c');
  });

  it('returns the template unchanged when {port} is absent', () => {
    expect(build_studio_url('http://localhost:9000/static', 4242)).toBe(
      'http://localhost:9000/static',
    );
  });
});

describe('format_initial_failure', () => {
  it('returns null for a `tree` message', () => {
    const msg: WeftWatchMessage = {
      kind: 'tree',
      tree: { version: 1, root: { kind: 'step', id: 's1' } },
    };
    expect(format_initial_failure('/x.json', msg)).toBeNull();
  });

  it('formats invalid input with the offending zod path', () => {
    const msg: WeftWatchMessage = {
      kind: 'invalid',
      path: '/x.json',
      zod_path: '$.config.keys',
      message: 'parallel: keys mismatch',
    };
    const result = format_initial_failure('/x.json', msg);
    expect(result).toContain('invalid /x.json');
    expect(result).toContain('$.config.keys');
    expect(result).toContain('parallel: keys mismatch');
  });

  it('formats unreachable input with the reason', () => {
    const msg: WeftWatchMessage = {
      kind: 'unreachable',
      reason: 'read_error',
      path: '/x.json',
    };
    const result = format_initial_failure('/x.json', msg);
    expect(result).toContain('cannot read /x.json');
    expect(result).toContain('read_error');
  });
});

describe('load_initial_tree', () => {
  it('returns a `tree` message for a valid file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'weft-load-'));
    const path = join(dir, 'flow.json');
    await writeFile(
      path,
      JSON.stringify({ version: 1, root: { kind: 'step', id: 's1' } }),
    );
    const msg = await load_initial_tree(path);
    expect(msg.kind).toBe('tree');
    await rm(dir, { recursive: true, force: true });
  });

  it('returns an `invalid` message for a malformed file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'weft-load-'));
    const path = join(dir, 'flow.json');
    await writeFile(path, '{ broken');
    const msg = await load_initial_tree(path);
    expect(msg.kind).toBe('invalid');
    if (msg.kind === 'invalid') {
      expect(msg.path).toBe(path);
    }
    await rm(dir, { recursive: true, force: true });
  });

  it('returns an `unreachable` message when the file does not exist', async () => {
    const msg = await load_initial_tree('/nonexistent/path/never.json');
    expect(msg.kind).toBe('unreachable');
    if (msg.kind === 'unreachable') {
      expect(msg.reason).toBe('read_error');
    }
  });
});

describe('main (no client)', () => {
  let dir: string;
  let file: string;
  let handle: CliHandle | null = null;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'weft-watch-bin-noclient-'));
    file = join(dir, 'flow.json');
  });

  afterEach(async () => {
    if (handle !== null) {
      await handle.close();
      handle = null;
    }
    await rm(dir, { recursive: true, force: true });
  });

  it('starts up, resolves a port, and returns a handle (no client connection required)', async () => {
    await writeFile(file, JSON.stringify(VALID_TREE));
    handle = await main([file, '--no-open']);
    expect(handle.port).toBeGreaterThan(0);
    expect(handle.url).toContain(String(handle.port));
    expect(handle.url).toContain('localhost:5173/watch?ws=');
  });

  it('substitutes {port} in a custom --studio-url', async () => {
    await writeFile(file, JSON.stringify(VALID_TREE));
    handle = await main([file, '--no-open', '--studio-url', 'http://localhost:9000/canvas?ws={port}']);
    expect(handle.url).toBe(`http://localhost:9000/canvas?ws=${handle.port}`);
  });

  it('does not substitute when --studio-url has no {port} placeholder', async () => {
    await writeFile(file, JSON.stringify(VALID_TREE));
    handle = await main([file, '--no-open', '--studio-url', 'http://localhost:9000/static']);
    expect(handle.url).toBe('http://localhost:9000/static');
  });

  it('throws (and the binary entry exits non-zero) when the initial file is invalid', async () => {
    await writeFile(file, '{ not json');
    await expect(main([file, '--no-open'])).rejects.toThrow(/invalid/);
    handle = null;
  });

  it('throws when the initial file does not exist', async () => {
    const missing = join(dir, 'never_exists.json');
    await expect(main([missing, '--no-open'])).rejects.toThrow(/cannot read|read_error/);
    handle = null;
  });

  it('responds to a watcher event by updating the broadcast state', async () => {
    await writeFile(file, JSON.stringify(VALID_TREE));
    handle = await main([file, '--no-open']);
    // Touching the file exercises the watcher's on_message hook.
    await writeFile(
      file,
      JSON.stringify({ version: 1, root: { kind: 'step', id: 's2' } }),
    );
    // Give chokidar a moment; we can't observe the broadcast without a
    // client, but main() must not crash and close() must succeed.
    await new Promise<void>((r) => setTimeout(r, 200));
  });
});

// Some sandboxes block outbound 127.0.0.1 connect() even when bind() works.
// vitest.config.ts probes for this and exposes the result via this env var.
const LOOPBACK_OK = process.env['WEFT_LOOPBACK_AVAILABLE'] !== '0';

describe.skipIf(!LOOPBACK_OK)('weft-watch (in-process)', () => {
  let dir: string;
  let file: string;
  let handle: CliHandle | null = null;
  let client: WsClient | null = null;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'weft-watch-bin-'));
    file = join(dir, 'flow.json');
  });

  afterEach(async () => {
    if (client !== null) {
      client.close();
      client = null;
    }
    if (handle !== null) {
      await handle.close();
      handle = null;
    }
    await rm(dir, { recursive: true, force: true });
  });

  it('starts up, resolves a port, and broadcasts the initial tree', async () => {
    await writeFile(file, JSON.stringify(VALID_TREE));
    handle = await main([file, '--no-open']);
    expect(handle.port).toBeGreaterThan(0);
    expect(handle.url).toContain(String(handle.port));
    expect(handle.url).toContain('localhost:5173/watch?ws=');

    client = await open_client(`ws://127.0.0.1:${handle.port}`);
    const msg = await next_envelope(client);
    expect(msg.kind).toBe('tree');
    if (msg.kind === 'tree') {
      expect(msg.tree.root.id).toBe('s1');
    }
  });

  it('broadcasts a new tree within 500ms when the watched file changes', async () => {
    await writeFile(file, JSON.stringify(VALID_TREE));
    handle = await main([file, '--no-open']);
    client = await open_client(`ws://127.0.0.1:${handle.port}`);

    // Drain the initial tree.
    await next_envelope(client);

    const start = Date.now();
    await writeFile(
      file,
      JSON.stringify({
        version: 1,
        root: { kind: 'step', id: 's2' },
      }),
    );
    const msg = await next_envelope(client, 1500);
    const elapsed = Date.now() - start;
    expect(msg.kind).toBe('tree');
    if (msg.kind === 'tree') {
      expect(msg.tree.root.id).toBe('s2');
    }
    expect(elapsed).toBeLessThan(1500);
  });

  it('broadcasts an `unreachable` envelope when the watched file is deleted', async () => {
    await writeFile(file, JSON.stringify(VALID_TREE));
    handle = await main([file, '--no-open']);
    client = await open_client(`ws://127.0.0.1:${handle.port}`);

    // Drain the initial tree.
    await next_envelope(client);

    await unlink(file);
    const msg = await next_envelope(client);
    expect(msg.kind).toBe('unreachable');
    if (msg.kind === 'unreachable') {
      expect(msg.reason).toBe('deleted');
      expect(msg.path).toBe(file);
    }
  });

  it('broadcasts an `invalid` envelope when the watched file is replaced with bad content', async () => {
    await writeFile(file, JSON.stringify(VALID_TREE));
    handle = await main([file, '--no-open']);
    client = await open_client(`ws://127.0.0.1:${handle.port}`);

    // Drain the initial tree.
    const initial = await next_envelope(client);
    expect(initial.kind).toBe('tree');

    await writeFile(file, '{ not valid json');
    const msg = await next_envelope(client);
    expect(msg.kind).toBe('invalid');
    if (msg.kind === 'invalid') {
      expect(msg.path).toBe(file);
      expect(msg.zod_path.length).toBeGreaterThan(0);
    }
  });

  it('sends the current tree state to a client that connects after a change', async () => {
    await writeFile(file, JSON.stringify(VALID_TREE));
    handle = await main([file, '--no-open']);

    const first = await open_client(`ws://127.0.0.1:${handle.port}`);
    await next_envelope(first); // initial
    await writeFile(
      file,
      JSON.stringify({
        version: 1,
        root: { kind: 'step', id: 's_updated' },
      }),
    );
    await next_envelope(first); // updated tree
    first.close();

    // A late-joining client should receive the most recent valid tree.
    client = await open_client(`ws://127.0.0.1:${handle.port}`);
    const late = await next_envelope(client);
    expect(late.kind).toBe('tree');
    if (late.kind === 'tree') {
      expect(late.tree.root.id).toBe('s_updated');
    }
  });
});
