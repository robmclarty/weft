import { afterEach, describe, expect, it, vi } from 'vitest';

import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import type { FlowTree } from '@repo/weft';

import { LoaderPanel, type LoaderError } from '../LoaderPanel.js';

let mounted: { container: HTMLDivElement; root: Root } | null = null;

function mount(element: ReactElement): { container: HTMLDivElement; root: Root } {
  const container = document.createElement('div');
  document.body.append(container);
  let root!: Root;
  act(() => {
    root = createRoot(container);
    root.render(element);
  });
  return { container, root };
}

afterEach(() => {
  if (mounted !== null) {
    act(() => {
      mounted!.root.unmount();
    });
    mounted.container.remove();
    mounted = null;
  }
});

describe('LoaderPanel: paste flow', () => {
  it('emits on_loaded when valid JSON is pasted', () => {
    let loaded: FlowTree | null = null;
    const on_loaded = (tree: FlowTree): void => {
      loaded = tree;
    };
    const on_error = vi.fn<(err: LoaderError) => void>();
    mounted = mount(
      <LoaderPanel on_loaded={on_loaded} on_error={on_error} last_error={null} />,
    );
    const textarea = mounted.container.querySelector('textarea');
    expect(textarea).not.toBeNull();
    const text = JSON.stringify({
      version: 1,
      root: { kind: 'step', id: 'step:a' },
    });
    act(() => {
      const event = new Event('input', { bubbles: true });
      Object.defineProperty(event, 'target', { value: { value: text } });
      // Use the textarea's React change handler via input event
    });
    // Set value via property and dispatch change-like event
    if (textarea !== null) {
      // eslint-disable-next-line typescript-eslint/unbound-method -- setter is invoked via call() with explicit context below
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value',
      )?.set;
      act(() => {
        setter?.call(textarea, text);
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }
    const loadButton = Array.from(mounted.container.querySelectorAll('button')).find(
      (b) => b.textContent === 'load pasted JSON',
    );
    expect(loadButton).toBeDefined();
    act(() => {
      loadButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(on_error).not.toHaveBeenCalled();
    expect(loaded).not.toBeNull();
  });

  it('emits on_error with the offending JSON path on validation failure', () => {
    const on_loaded = vi.fn<(tree: FlowTree) => void>();
    let captured: LoaderError | null = null;
    const on_error = (err: LoaderError): void => {
      captured = err;
    };
    mounted = mount(
      <LoaderPanel on_loaded={on_loaded} on_error={on_error} last_error={null} />,
    );
    const textarea = mounted.container.querySelector('textarea');
    if (textarea !== null) {
      // eslint-disable-next-line typescript-eslint/unbound-method -- setter is invoked via call() with explicit context below
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value',
      )?.set;
      act(() => {
        // empty children but parallel kind → should fail
        setter?.call(
          textarea,
          JSON.stringify({
            version: 1,
            root: {
              kind: 'parallel',
              id: 'p:0',
              config: { keys: ['a'] },
              children: [],
            },
          }),
        );
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }
    const loadButton = Array.from(mounted.container.querySelectorAll('button')).find(
      (b) => b.textContent === 'load pasted JSON',
    );
    act(() => {
      loadButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(on_loaded).not.toHaveBeenCalled();
    expect(captured).not.toBeNull();
    if (captured !== null) {
      const err: LoaderError = captured;
      expect(err.zod_path).toContain('keys');
    }
  });

  it('emits an error when paste box is empty', () => {
    const on_loaded = vi.fn<(tree: FlowTree) => void>();
    const on_error = vi.fn<(err: LoaderError) => void>();
    mounted = mount(
      <LoaderPanel on_loaded={on_loaded} on_error={on_error} last_error={null} />,
    );
    const loadButton = Array.from(mounted.container.querySelectorAll('button')).find(
      (b) => b.textContent === 'load pasted JSON',
    );
    act(() => {
      loadButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(on_loaded).not.toHaveBeenCalled();
    expect(on_error).toHaveBeenCalled();
  });
});

describe('LoaderPanel: drag-drop', () => {
  it('reads a dropped file and emits on_loaded', async () => {
    let loaded: FlowTree | null = null;
    const on_loaded = (tree: FlowTree): void => {
      loaded = tree;
    };
    const on_error = vi.fn<(err: LoaderError) => void>();
    mounted = mount(
      <LoaderPanel on_loaded={on_loaded} on_error={on_error} last_error={null} />,
    );
    const dropzone = mounted.container.querySelector('[data-weft-dropzone]');
    expect(dropzone).not.toBeNull();
    const text = JSON.stringify({ kind: 'step', id: 'step:dropped' });
    const file = new File([text], 'flow.json', { type: 'application/json' });
    const data_transfer = {
      files: [file] as unknown as FileList,
      types: ['Files'],
      items: [],
    };
    await act(async () => {
      const drop_event = new Event('drop', { bubbles: true, cancelable: true });
      Object.defineProperty(drop_event, 'dataTransfer', { value: data_transfer });
      dropzone!.dispatchEvent(drop_event);
      // Allow FileReader to deliver onload async
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(on_error).not.toHaveBeenCalled();
    expect(loaded).not.toBeNull();
  });

  it('renders an error banner when last_error is provided', () => {
    mounted = mount(
      <LoaderPanel
        on_loaded={() => undefined}
        on_error={() => undefined}
        last_error={{
          source: 'paste',
          zod_path: '$.root.id',
          message: 'expected string',
        }}
      />,
    );
    expect(
      mounted.container.querySelector('[data-weft-loader-error]'),
    ).not.toBeNull();
    expect(mounted.container.textContent).toContain('expected string');
  });
});

describe('LoaderPanel: URL flow', () => {
  it('rejects an http://example.com URL without invoking fetch', async () => {
    const on_loaded = vi.fn<(tree: FlowTree) => void>();
    let captured: LoaderError | null = null;
    const on_error = (err: LoaderError): void => {
      captured = err;
    };
    const fake_fetch = vi.fn();
    mounted = mount(
      <LoaderPanel
        on_loaded={on_loaded}
        on_error={on_error}
        last_error={null}
        fetch_impl={fake_fetch}
      />,
    );
    const url_input = mounted.container.querySelector('input[type="url"]');
    if (url_input instanceof HTMLInputElement) {
      // eslint-disable-next-line typescript-eslint/unbound-method -- setter is invoked via call() with explicit context below
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )?.set;
      act(() => {
        setter?.call(url_input, 'http://example.com/flow.json');
        url_input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }
    const fetch_button = Array.from(mounted.container.querySelectorAll('button')).find(
      (b) => b.textContent === 'fetch URL',
    );
    await act(async () => {
      fetch_button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      // wait a microtask
      await Promise.resolve();
    });
    expect(on_loaded).not.toHaveBeenCalled();
    expect(captured).not.toBeNull();
    expect(fake_fetch).not.toHaveBeenCalled();
  });
});
