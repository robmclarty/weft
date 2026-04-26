/**
 * Default-browser launcher.
 *
 * The watch CLI opens the studio in the user's default browser unless
 * --no-open is set (per spec §5.5). The child process is detached and its
 * stdio ignored so the CLI does not block on browser exit.
 */

import { spawn } from 'node:child_process';
import { platform as host_platform } from 'node:process';

/**
 * Per-platform launch arguments. Pure: returns the command + argv that
 * `open_browser` will hand to spawn(). Exported so tests can verify the
 * branch behaviour for every platform without spawning real subprocesses.
 */
export function browser_command(
  url: string,
  on_platform: NodeJS.Platform,
): { command: string; args: ReadonlyArray<string> } {
  if (on_platform === 'darwin') {
    return { command: 'open', args: [url] };
  }
  if (on_platform === 'win32') {
    return { command: 'cmd', args: ['/c', 'start', '""', url] };
  }
  return { command: 'xdg-open', args: [url] };
}

export function open_browser(
  url: string,
  on_platform: NodeJS.Platform = host_platform,
): void {
  const { command, args } = browser_command(url, on_platform);
  const child = spawn(command, args, { detached: true, stdio: 'ignore' });
  child.unref();
}
