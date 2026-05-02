import { afterEach, describe, expect, it, vi } from 'vitest';

import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { ShortcutsModal } from '../ShortcutsModal.js';

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

describe('ShortcutsModal', () => {
  it('renders nothing when closed', () => {
    mounted = mount(<ShortcutsModal open={false} on_close={() => undefined} />);
    expect(
      mounted.container.querySelector('[data-weft-shortcuts-modal]'),
    ).toBeNull();
  });

  it('renders the dialog when open', () => {
    mounted = mount(<ShortcutsModal open={true} on_close={() => undefined} />);
    const dialog = mounted.container.querySelector(
      '[data-weft-shortcuts-modal="true"]',
    );
    expect(dialog).not.toBeNull();
    expect(mounted.container.textContent).toContain('keyboard shortcuts');
  });

  it('calls on_close when the backdrop is clicked', () => {
    const on_close = vi.fn();
    mounted = mount(<ShortcutsModal open={true} on_close={on_close} />);
    const backdrop = mounted.container.querySelector(
      '[data-weft-shortcuts-modal="true"]',
    );
    expect(backdrop).not.toBeNull();
    act(() => {
      backdrop?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(on_close).toHaveBeenCalled();
  });

  it('does not call on_close when the inner modal is clicked', () => {
    const on_close = vi.fn();
    mounted = mount(<ShortcutsModal open={true} on_close={on_close} />);
    const inner = mounted.container.querySelector('.weft-modal');
    expect(inner).not.toBeNull();
    act(() => {
      inner?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(on_close).not.toHaveBeenCalled();
  });
});
