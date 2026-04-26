import type { JSX } from 'react';

import type { FlowNode } from '@repo/weft';

import { summarize_for_inspector } from '../state/inspector.js';

export type InspectorPanelProps = {
  readonly selected: FlowNode | null;
};

export function InspectorPanel({ selected }: InspectorPanelProps): JSX.Element {
  if (selected === null) {
    return (
      <section className="weft-panel" aria-label="Inspector" data-weft-inspector="empty">
        <h2>inspector</h2>
        <p style={{ margin: 0, color: 'var(--weft-fg-muted)', fontSize: 12 }}>
          click a node to inspect it
        </p>
      </section>
    );
  }
  const summary = summarize_for_inspector(selected);
  return (
    <section
      className="weft-panel"
      aria-label="Inspector"
      data-weft-inspector="node"
      data-weft-inspector-id={summary.id}
    >
      <h2>inspector</h2>
      <dl style={{ margin: 0, fontSize: 12 }}>
        <dt style={{ color: 'var(--weft-fg-muted)' }}>kind</dt>
        <dd style={{ margin: '0 0 6px', fontFamily: 'var(--weft-mono)' }}>
          {summary.kind}
        </dd>
        <dt style={{ color: 'var(--weft-fg-muted)' }}>id</dt>
        <dd style={{ margin: '0 0 6px', fontFamily: 'var(--weft-mono)' }}>
          {summary.id}
        </dd>
      </dl>

      {summary.wrapper !== undefined ? (
        <p style={{ margin: '8px 0', fontSize: 12 }}>
          wraps&nbsp;
          <code>{summary.wrapper.child_kind}:{summary.wrapper.child_id}</code>
        </p>
      ) : null}

      {summary.parallel !== undefined ? (
        <div style={{ margin: '8px 0', fontSize: 12 }}>
          <div>
            {summary.parallel.child_count} parallel branch
            {summary.parallel.child_count === 1 ? '' : 'es'}
          </div>
          <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
            {summary.parallel.keys.map((key) => (
              <li key={key} style={{ fontFamily: 'var(--weft-mono)' }}>
                {key}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {summary.sequence !== undefined ? (
        <p style={{ margin: '8px 0', fontSize: 12 }}>
          {summary.sequence.child_count} child step
          {summary.sequence.child_count === 1 ? '' : 's'}
        </p>
      ) : null}

      {summary.scope !== undefined ? (
        <div style={{ margin: '8px 0', fontSize: 12 }}>
          <div>stash entries: {summary.scope.stashes.length}</div>
          <ul style={{ margin: '4px 0 8px 18px', padding: 0 }}>
            {summary.scope.stashes.map((s) => (
              <li key={s.id} style={{ fontFamily: 'var(--weft-mono)' }}>
                {s.id}
                {s.key !== null ? ` → ${s.key}` : ''}
              </li>
            ))}
          </ul>
          <div>use entries: {summary.scope.uses.length}</div>
          <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
            {summary.scope.uses.map((u) => (
              <li key={u.id} style={{ fontFamily: 'var(--weft-mono)' }}>
                {u.id} reads {u.keys.join(', ')}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {summary.config_pretty !== null ? (
        <details style={{ marginTop: 8 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12 }}>config</summary>
          <pre>{summary.config_pretty}</pre>
        </details>
      ) : null}
    </section>
  );
}
