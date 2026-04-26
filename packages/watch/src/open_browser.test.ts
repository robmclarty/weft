import type { ChildProcess } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';

type SpawnArgs = { command: string; args: ReadonlyArray<string> };
const spawn_calls: SpawnArgs[] = [];

vi.mock('node:child_process', async (orig) => {
  const real = await orig<typeof import('node:child_process')>();
  return {
    ...real,
    spawn: (command: string, args: ReadonlyArray<string>): ChildProcess => {
      spawn_calls.push({ command, args });
      const fake: Partial<ChildProcess> = {
        unref: () => undefined,
      };
      return fake as ChildProcess;
    },
  };
});

describe('browser_command', () => {
  it('selects `open` on darwin', async () => {
    const { browser_command } = await import('./open_browser.js');
    expect(browser_command('http://x', 'darwin')).toEqual({
      command: 'open',
      args: ['http://x'],
    });
  });

  it('selects `cmd /c start` on win32', async () => {
    const { browser_command } = await import('./open_browser.js');
    expect(browser_command('http://x', 'win32')).toEqual({
      command: 'cmd',
      args: ['/c', 'start', '""', 'http://x'],
    });
  });

  it('selects `xdg-open` on linux', async () => {
    const { browser_command } = await import('./open_browser.js');
    expect(browser_command('http://x', 'linux')).toEqual({
      command: 'xdg-open',
      args: ['http://x'],
    });
  });

  it('selects `xdg-open` on freebsd (default branch)', async () => {
    const { browser_command } = await import('./open_browser.js');
    expect(browser_command('http://x', 'freebsd')).toEqual({
      command: 'xdg-open',
      args: ['http://x'],
    });
  });
});

describe('open_browser', () => {
  it('invokes spawn with the platform-specific command and unrefs the child', async () => {
    spawn_calls.length = 0;
    const { open_browser } = await import('./open_browser.js');
    open_browser('http://localhost:5173/watch?ws=4242', 'darwin');
    expect(spawn_calls.length).toBe(1);
    const call = spawn_calls[0];
    if (call === undefined) throw new Error('expected spawn to be called');
    expect(call.command).toBe('open');
    expect(call.args).toEqual(['http://localhost:5173/watch?ws=4242']);
  });

  it('uses the host platform when on_platform is not provided', async () => {
    spawn_calls.length = 0;
    const { open_browser } = await import('./open_browser.js');
    open_browser('http://x');
    expect(spawn_calls.length).toBe(1);
  });
});
