#!/usr/bin/env node
/**
 * Probe whether outbound TCP connect to a freshly-bound 127.0.0.1 port works.
 *
 * Used by the repo-root `vitest.config.ts` to decide whether to enable the
 * watch CLI's network-dependent integration tests. Some sandboxes (notably
 * macOS sandboxed harnesses) bind 127.0.0.1 sockets fine but reject
 * outbound connect() calls with EPERM; the watch CLI itself works in
 * production where the studio runs in the user's browser, but tests that
 * spin up an in-process ws client cannot run.
 *
 * The probe binds, connects, and tears down — both ends in the same
 * process. If it succeeds, the tests can run.
 *
 * Exit codes:
 *   0  Loopback connect works.
 *   1  Loopback connect is blocked.
 *
 * Stdout (single line):
 *   ok      Loopback connect is available.
 *   skip    Loopback connect is blocked (with reason on stderr).
 */

import { createServer, connect } from 'node:net';

async function main() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      resolve();
    });
  });
  const address = server.address();
  if (typeof address !== 'object' || address === null) {
    process.stderr.write('skip: server.address() returned non-AddressInfo\n');
    process.stdout.write('skip\n');
    server.close();
    process.exit(1);
  }
  const port = address.port;
  try {
    await new Promise((resolve, reject) => {
      const client = connect(port, '127.0.0.1', () => {
        client.end();
        resolve();
      });
      client.once('error', reject);
    });
    server.close();
    process.stdout.write('ok\n');
    process.exit(0);
  } catch (err) {
    server.close();
    process.stderr.write(`skip: ${err.message}\n`);
    process.stdout.write('skip\n');
    process.exit(1);
  }
}

main().catch((err) => {
  process.stderr.write(`detect-loopback error: ${err.message}\n`);
  process.exit(1);
});
