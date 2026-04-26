/**
 * `/view?src=<url>` — fetch the URL and render the result.
 *
 * The URL must be `https:` or `http://localhost` (research F13). The fetch
 * uses `credentials: 'omit'` and `redirect: 'error'`. Validation failures
 * never replace the previous canvas. The loader panel stays available so
 * users can switch input modes mid-stream.
 */

import { useEffect, useState, type JSX } from 'react';
import { useSearchParams } from 'react-router-dom';

import type { FlowTree } from '@repo/weft';

import { Banner } from '../components/Banner.js';
import { CanvasShell } from '../components/CanvasShell.js';
import {
  LoaderPanel,
  type LoaderError,
} from '../components/LoaderPanel.js';
import {
  fetch_src_payload,
  type FetchLike,
} from '../loaders/url_fetch.js';
import { validate_loader_payload } from '../loaders/validate_payload.js';

const DEFAULT_FETCH: FetchLike = async (input, init) => {
  const response = await fetch(input, init);
  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    text: () => response.text(),
  };
};

export type ViewRouteProps = {
  readonly fetch_impl?: FetchLike;
};

export function ViewRoute({ fetch_impl }: ViewRouteProps = {}): JSX.Element {
  const [params] = useSearchParams();
  const src = params.get('src');
  const [tree, set_tree] = useState<FlowTree | null>(null);
  const [error, set_error] = useState<LoaderError | null>(null);
  const [busy, set_busy] = useState<boolean>(false);

  useEffect(() => {
    if (src === null) {
      set_busy(false);
      return undefined;
    }
    let cancelled = false;
    set_busy(true);
    void (async () => {
      const fetched = await fetch_src_payload(src, fetch_impl ?? DEFAULT_FETCH);
      if (cancelled) return;
      if (!fetched.ok) {
        set_error({ source: 'url', message: fetched.message });
        set_busy(false);
        return;
      }
      const validated = validate_loader_payload(fetched.payload);
      if (!validated.ok) {
        set_error({
          source: 'url',
          zod_path: validated.zod_path,
          message: validated.message,
        });
        set_busy(false);
        return;
      }
      set_tree(validated.tree);
      set_error(null);
      set_busy(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [src, fetch_impl]);

  return (
    <main className="weft-main" data-weft-route="view">
      <CanvasShell
        tree={tree}
        empty_message={
          src === null
            ? 'pass ?src=<url> to fetch a flow_tree.'
            : busy
              ? `loading ${src}…`
              : 'load failed; check the loader panel.'
        }
        banners={
          busy ? <Banner tone="info">fetching {src}…</Banner> : undefined
        }
        side_top={
          <LoaderPanel
            on_loaded={(loaded) => {
              set_tree(loaded);
              set_error(null);
            }}
            on_error={(err) => {
              set_error(err);
            }}
            last_error={error}
          />
        }
      />
    </main>
  );
}
