/**
 * Spawn the weft-watch CLI as a subprocess and resolve its WebSocket
 * port from the first stdout line.
 *
 * Used by the watch-loop e2e specs so the CLI runs in its own process
 * just as a real user would invoke it. We use `node` against the TS
 * source directly; Node 24 strips types automatically.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo_root = join(here, '..', '..', '..');
const bin_source = join(repo_root, 'packages', 'watch', 'src', 'bin.ts');

export type WatchProcess = {
  readonly port: number;
  readonly proc: ChildProcess;
  readonly close: () => Promise<void>;
};

export async function spawn_watch(
  file_path: string,
  extra_args: ReadonlyArray<string> = [],
): Promise<WatchProcess> {
  const proc = spawn(
    'node',
    [bin_source, file_path, '--no-open', ...extra_args],
    { cwd: repo_root, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const stdout = proc.stdout;
  if (stdout === null) {
    throw new Error('spawn_watch: child stdout is null');
  }
  const port = await new Promise<number>((resolve, reject) => {
    let buffer = '';
    const on_data = (chunk: Buffer): void => {
      buffer += chunk.toString();
      const match = /listening on ws:\/\/127\.0\.0\.1:(\d+)/.exec(buffer);
      if (match?.[1] !== undefined) {
        stdout.off('data', on_data);
        resolve(Number(match[1]));
      }
    };
    stdout.on('data', on_data);
    proc.on('exit', (code) => {
      reject(new Error(`weft-watch exited before listening (code ${String(code)})`));
    });
    proc.on('error', reject);
    setTimeout(() => {
      reject(new Error('timed out waiting for weft-watch listening line'));
    }, 30_000).unref();
  });
  return {
    port,
    proc,
    close: async () => {
      if (proc.exitCode !== null) return;
      proc.kill('SIGTERM');
      await new Promise<void>((resolve) => {
        proc.on('exit', () => {
          resolve();
        });
        setTimeout(() => {
          if (proc.exitCode === null) proc.kill('SIGKILL');
          resolve();
        }, 2000).unref();
      });
    },
  };
}
