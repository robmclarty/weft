/**
 * Loader panel — drag-drop, paste, URL fetch entry points.
 *
 * All three input modes flow through the same validate-then-replace
 * pipeline: parse JSON, auto-wrap a bare FlowNode, validate against
 * `flow_tree_schema`, hand the result to `on_loaded` (success) or
 * `on_error` (failure). Validation failure does not replace the previous
 * canvas — the parent owns that policy.
 *
 * Two presentations:
 *   - expanded (initial / on demand): the full input surface.
 *   - collapsed (after a tree is loaded): a compact "load another" link
 *     that re-expands the surface. Saves sidebar space when the user is
 *     already inspecting a tree.
 *
 * Per spec §5.4: error messages render as React text children only.
 * Untrusted-HTML render APIs are forbidden in the studio.
 */

import {
  useCallback,
  useId,
  useRef,
  useState,
  type DragEvent,
  type JSX,
} from 'react';

import type { FlowTree } from '@repo/weft';

import {
  fetch_src_payload,
  type FetchLike,
} from '../loaders/url_fetch.js';
import {
  parse_json_text,
  validate_loader_payload,
} from '../loaders/validate_payload.js';

export type LoaderError = {
  readonly source: 'drag-drop' | 'paste' | 'url';
  readonly zod_path?: string;
  readonly message: string;
};

export type LoaderPanelProps = {
  readonly on_loaded: (tree: FlowTree, source: LoaderError['source']) => void;
  readonly on_error: (err: LoaderError) => void;
  readonly fetch_impl?: FetchLike;
  readonly last_error?: LoaderError | null;
  readonly tree_loaded?: boolean;
};

export function LoaderPanel({
  on_loaded,
  on_error,
  fetch_impl,
  last_error,
  tree_loaded = false,
}: LoaderPanelProps): JSX.Element {
  const file_input_id = useId();
  const paste_id = useId();
  const url_id = useId();
  const file_input_ref = useRef<HTMLInputElement | null>(null);
  const [paste_text, set_paste_text] = useState('');
  const [src_url, set_src_url] = useState('');
  const [is_dragging, set_is_dragging] = useState(false);
  const [expanded, set_expanded] = useState(false);
  const has_error = last_error !== null && last_error !== undefined;
  const show_full = !tree_loaded || expanded || has_error;

  const handle_payload = useCallback(
    (raw: unknown, source: LoaderError['source']) => {
      const result = validate_loader_payload(raw);
      if (result.ok) {
        on_loaded(result.tree, source);
        set_expanded(false);
        return;
      }
      on_error({
        source,
        zod_path: result.zod_path,
        message: result.message,
      });
    },
    [on_loaded, on_error],
  );

  const handle_text = useCallback(
    (text: string, source: LoaderError['source']) => {
      let parsed: unknown;
      try {
        parsed = parse_json_text(text);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        on_error({ source, message: `JSON parse failed: ${detail}` });
        return;
      }
      handle_payload(parsed, source);
    },
    [handle_payload, on_error],
  );

  const handle_file = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        const text = typeof reader.result === 'string' ? reader.result : '';
        handle_text(text, 'drag-drop');
      });
      reader.addEventListener('error', () => {
        on_error({
          source: 'drag-drop',
          message: `failed to read file: ${file.name}`,
        });
      });
      reader.readAsText(file);
    },
    [handle_text, on_error],
  );

  const handle_drop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      set_is_dragging(false);
      const file = event.dataTransfer.files[0];
      if (file === undefined) return;
      handle_file(file);
    },
    [handle_file],
  );

  const handle_drag_over = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    set_is_dragging(true);
  }, []);

  const handle_drag_leave = useCallback(() => {
    set_is_dragging(false);
  }, []);

  const handle_paste_load = useCallback(() => {
    if (paste_text.trim().length === 0) {
      on_error({ source: 'paste', message: 'paste box is empty' });
      return;
    }
    handle_text(paste_text, 'paste');
  }, [paste_text, handle_text, on_error]);

  const handle_url_load = useCallback(async () => {
    if (src_url.trim().length === 0) {
      on_error({ source: 'url', message: 'URL is empty' });
      return;
    }
    const result = await fetch_src_payload(src_url, fetch_impl ?? default_fetch);
    if (!result.ok) {
      on_error({ source: 'url', message: result.message });
      return;
    }
    handle_payload(result.payload, 'url');
  }, [src_url, fetch_impl, handle_payload, on_error]);

  if (!show_full) {
    return (
      <div className="weft-loader-collapsed" data-weft-loader-state="collapsed">
        <span>tree loaded.</span>
        <button
          type="button"
          onClick={() => {
            set_expanded(true);
          }}
          data-weft-action="expand-loader"
        >
          load another →
        </button>
      </div>
    );
  }

  return (
    <section
      className="weft-panel weft-loader"
      aria-label="Loader"
      data-weft-loader-state={tree_loaded ? 'expanded' : 'initial'}
    >
      <h2>load a flow_tree</h2>

      {has_error ? (
        <div
          className="weft-banner"
          data-tone={tone_for(last_error.source)}
          role="alert"
          data-weft-loader-error="true"
        >
          <div>
            <strong>{label_for(last_error.source)}</strong>
            <div className="weft-banner-detail">
              {last_error.zod_path === undefined
                ? last_error.message
                : `${last_error.zod_path}: ${last_error.message}`}
            </div>
          </div>
        </div>
      ) : null}

      <div
        className="weft-loader-actions"
        onDrop={handle_drop}
        onDragOver={handle_drag_over}
        onDragLeave={handle_drag_leave}
        data-weft-dropzone="true"
        data-weft-dragging={String(is_dragging)}
      >
        <label htmlFor={file_input_id}>drop a .json file or pick one</label>
        <input
          ref={file_input_ref}
          id={file_input_id}
          type="file"
          accept="application/json,.json"
          onChange={(event) => {
            const f = event.target.files?.[0];
            if (f !== undefined) handle_file(f);
          }}
        />

        <label htmlFor={paste_id}>paste JSON</label>
        <textarea
          id={paste_id}
          className="weft-textarea"
          value={paste_text}
          onChange={(event) => {
            set_paste_text(event.target.value);
          }}
          placeholder='{"version": 1, "root": {...}}'
        />
        <button type="button" className="weft-primary" onClick={handle_paste_load}>
          load pasted JSON
        </button>

        <label htmlFor={url_id}>fetch from URL (https or localhost only)</label>
        <input
          id={url_id}
          type="url"
          value={src_url}
          onChange={(event) => {
            set_src_url(event.target.value);
          }}
          placeholder="https://example.com/flow.json"
        />
        <button
          type="button"
          onClick={() => {
            void handle_url_load();
          }}
        >
          fetch URL
        </button>
      </div>

      {tree_loaded ? (
        <button
          type="button"
          onClick={() => {
            set_expanded(false);
          }}
          data-weft-action="collapse-loader"
        >
          done
        </button>
      ) : null}
    </section>
  );
}

function tone_for(source: LoaderError['source']): string {
  if (source === 'url') return 'warn';
  return 'info';
}

function label_for(source: LoaderError['source']): string {
  if (source === 'paste') return 'JSON parse / validation';
  if (source === 'drag-drop') return 'file load / validation';
  return 'URL fetch';
}

const default_fetch: FetchLike = async (input, init) => {
  const response = await fetch(input, init);
  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    text: () => response.text(),
  };
};
