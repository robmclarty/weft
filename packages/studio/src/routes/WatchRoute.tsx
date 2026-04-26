/**
 * `/watch?ws=<port>` — subscribe to a localhost weft-watch server and
 * render whatever it pushes.
 *
 * On `tree` envelopes the canvas updates. On `unreachable` envelopes the
 * canvas keeps the last known tree and surfaces a banner. On `invalid`
 * envelopes the loader panel surfaces the offending JSON path. The
 * connection auto-reconnects with backoff (see `use_watch_socket`); after
 * the cap is exceeded a manual reconnect button replaces the banner.
 */

import { useEffect, useMemo, useState, type JSX } from 'react';
import { useSearchParams } from 'react-router-dom';

import { flow_tree_schema, type FlowTree } from '@repo/weft';

import { Banner } from '../components/Banner.js';
import { CanvasShell } from '../components/CanvasShell.js';
import { use_watch_socket } from '../state/use_watch_socket.js';

export type WatchRouteProps = {
  readonly socket_factory?: Parameters<typeof use_watch_socket>[0]['socket_factory'];
};

export function WatchRoute({ socket_factory }: WatchRouteProps = {}): JSX.Element {
  const [params] = useSearchParams();
  const port = params.get('ws');
  const url = useMemo(() => {
    if (port === null) return null;
    if (!/^[0-9]+$/.test(port)) return null;
    return `ws://127.0.0.1:${port}`;
  }, [port]);

  const socket_state = use_watch_socket({
    url,
    ...(socket_factory !== undefined ? { socket_factory } : {}),
  });

  const [tree, set_tree] = useState<FlowTree | null>(null);
  const [invalid_msg, set_invalid_msg] = useState<string | null>(null);
  const [unreachable_msg, set_unreachable_msg] = useState<string | null>(null);

  useEffect(() => {
    const env = socket_state.last_envelope;
    if (env === null) return;
    if (env.kind === 'tree') {
      const parsed = flow_tree_schema.safeParse(env.tree);
      if (parsed.success) {
        set_tree(parsed.data);
        set_invalid_msg(null);
        set_unreachable_msg(null);
      } else {
        const issue = parsed.error.issues[0];
        set_invalid_msg(
          `watch payload failed validation: ${issue?.message ?? 'unknown'}`,
        );
      }
      return;
    }
    if (env.kind === 'invalid') {
      set_invalid_msg(`${env.path}: ${env.zod_path} ${env.message}`);
      return;
    }
    if (env.kind === 'unreachable') {
      set_unreachable_msg(`${env.path} is ${env.reason}`);
    }
  }, [socket_state.last_envelope]);

  const banner = build_status_banner(socket_state, unreachable_msg, invalid_msg);

  return (
    <main className="weft-main" data-weft-route="watch">
      <CanvasShell
        tree={tree}
        empty_message={
          url === null
            ? 'pass ?ws=<port> to connect to weft-watch.'
            : 'waiting for the watch server to push a flow_tree…'
        }
        banners={banner}
      />
    </main>
  );
}

function build_status_banner(
  state: ReturnType<typeof use_watch_socket>,
  unreachable_msg: string | null,
  invalid_msg: string | null,
): JSX.Element | undefined {
  if (state.status === 'gave_up') {
    return (
      <Banner
        tone="error"
        action={
          <button
            type="button"
            onClick={() => {
              state.retry();
            }}
            data-weft-watch-reconnect="true"
          >
            reconnect
          </button>
        }
      >
        watch socket gave up after {String(state.attempt)} attempts.
      </Banner>
    );
  }
  if (state.status === 'reconnecting') {
    return (
      <Banner tone="warn" action={<span data-weft-watch-banner="reconnecting" />}>
        disconnected, reconnecting (attempt {String(state.attempt)})…
      </Banner>
    );
  }
  if (state.status === 'connecting') {
    return <Banner tone="info">connecting to weft-watch…</Banner>;
  }
  if (unreachable_msg !== null) {
    return <Banner tone="warn">{unreachable_msg}</Banner>;
  }
  if (invalid_msg !== null) {
    return <Banner tone="error">{invalid_msg}</Banner>;
  }
  return undefined;
}
