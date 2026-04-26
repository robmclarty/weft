/**
 * Loader panel — drag-drop, paste, URL fetch entry points.
 *
 * All three input modes flow through the same validate-then-replace
 * pipeline: parse JSON, auto-wrap a bare FlowNode, validate against
 * `flow_tree_schema`, hand the result to `on_loaded` (success) or
 * `on_error` (failure). Validation failure does not replace the previous
 * canvas — the parent owns that policy.
 *
 * Per spec §5.4: error UI uses React text children only; no
 * `dangerouslySetInnerHTML`.
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
};

export function LoaderPanel({
  on_loaded,
  on_error,
  fetch_impl,
  last_error,
}: LoaderPanelProps): JSX.Element {
  const file_input_id = useId();
  const paste_id = useId();
  const url_id = useId();
  const file_input_ref = useRef<HTMLInputElement | null>(null);
  const [paste_text, set_paste_text] = useState('');
  const [src_url, set_src_url] = useState('');
  const [is_dragging, set_is_dragging] = useState(false);

  const handle_payload = useCallback(
    (raw: unknown, source: LoaderError['source']) => {
      const result = validate_loader_payload(raw);
      if (result.ok) {
        on_loaded(result.tree, source);
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

  return (
    <section className="weft-panel" aria-label="Loader">
      <h2>load a flow_tree</h2>

      {last_error !== null && last_error !== undefined ? (
        <div
          className="weft-banner"
          data-tone="error"
          role="alert"
          data-weft-loader-error="true"
        >
          <strong>{last_error.source} error</strong>
          <div className="weft-error-text">
            {last_error.zod_path === undefined
              ? last_error.message
              : `${last_error.zod_path}: ${last_error.message}`}
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
        <label htmlFor={file_input_id}>
          drop a .json file or
          <input
            ref={file_input_ref}
            id={file_input_id}
            type="file"
            accept="application/json,.json"
            style={{ marginLeft: 6 }}
            onChange={(event) => {
              const f = event.target.files?.[0];
              if (f !== undefined) handle_file(f);
            }}
          />
        </label>

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
        <button type="button" onClick={handle_paste_load}>
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
    </section>
  );
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
