import type { JSX } from 'react';

export type ShortcutsModalProps = {
  readonly open: boolean;
  readonly on_close: () => void;
};

export function ShortcutsModal({ open, on_close }: ShortcutsModalProps): JSX.Element | null {
  if (!open) return null;
  return (
    <div
      className="weft-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      onClick={on_close}
      data-weft-shortcuts-modal="true"
    >
      <div
        className="weft-modal"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <h2>keyboard shortcuts</h2>
        <dl className="weft-shortcut-list">
          <dt>f</dt>
          <dd>fit view to canvas</dd>
          <dt>/</dt>
          <dd>focus the search box</dd>
          <dt>Esc</dt>
          <dd>clear selection or close this dialog</dd>
          <dt>?</dt>
          <dd>show or hide this help</dd>
        </dl>
        <div style={{ marginTop: 12, textAlign: 'right' }}>
          <button type="button" onClick={on_close}>
            close
          </button>
        </div>
      </div>
    </div>
  );
}
