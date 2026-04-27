/**
 * InspectorPanel — kind-aware detail view for the selected FlowNode.
 *
 * Each primitive shipped in v0 gets its own readable section. Unknown kinds
 * fall back to the raw-config disclosure (the spec-mandated path). The raw
 * disclosure is always available as a "show raw" fallback even when a
 * kind-aware section is rendered, so the user can always see what was in
 * the JSON.
 */

import type { JSX, ReactNode } from 'react';

import type { FlowNode } from '@repo/weft';

import {
  summarize_for_inspector,
  type InspectorSummary,
} from '../state/inspector.js';

export type InspectorPanelProps = {
  readonly selected: FlowNode | null;
};

export function InspectorPanel({ selected }: InspectorPanelProps): JSX.Element {
  if (selected === null) {
    return (
      <section
        className="weft-panel weft-inspector"
        aria-label="Inspector"
        data-weft-inspector="empty"
      >
        <div className="weft-inspector-header">
          <h2>inspector</h2>
        </div>
        <p className="weft-inspector-hint">click a node on the canvas to inspect.</p>
      </section>
    );
  }
  const summary = summarize_for_inspector(selected);
  return (
    <section
      className="weft-panel weft-inspector"
      aria-label="Inspector"
      data-weft-inspector="node"
      data-weft-inspector-id={summary.id}
      data-weft-inspector-kind={summary.kind}
    >
      <div className="weft-inspector-header">
        <span
          className="weft-inspector-kind-pill"
          data-weft-pill-kind={summary.kind}
        >
          {summary.kind}
        </span>
        <code className="weft-inspector-id">{summary.id}</code>
      </div>
      <KindBody summary={summary} />
      {summary.config_pretty !== null ? (
        <details className="weft-inspector-raw">
          <summary>show raw config</summary>
          <pre>{summary.config_pretty}</pre>
        </details>
      ) : null}
    </section>
  );
}

function KindBody({ summary }: { readonly summary: InspectorSummary }): JSX.Element | null {
  if (summary.step !== undefined) {
    return (
      <Field label="function">
        <code>{summary.step.fn_label}</code>
      </Field>
    );
  }
  if (summary.pipe !== undefined) {
    return (
      <>
        <Field label="tail function">
          <code>{summary.pipe.fn_label}</code>
        </Field>
        {summary.wrapper !== undefined ? <WrappedRow wrapper={summary.wrapper} /> : null}
      </>
    );
  }
  if (summary.retry !== undefined) {
    return (
      <>
        <Field label="max attempts">
          <code>{summary.retry.attempts ?? '—'}</code>
        </Field>
        <Field label="backoff">
          <code>
            {summary.retry.backoff_ms === null ? '—' : `${summary.retry.backoff_ms} ms`}
          </code>
        </Field>
        {summary.wrapper !== undefined ? <WrappedRow wrapper={summary.wrapper} /> : null}
      </>
    );
  }
  if (summary.parallel !== undefined) {
    return (
      <>
        <Field label="branches">
          <code>
            {summary.parallel.child_count} branch
            {summary.parallel.child_count === 1 ? '' : 'es'}
          </code>
        </Field>
        {summary.parallel.keys.length > 0 ? (
          <div className="weft-inspector-list">
            <div className="weft-inspector-label">keys</div>
            <ul>
              {summary.parallel.keys.map((key) => (
                <li key={key}><code>{key}</code></li>
              ))}
            </ul>
          </div>
        ) : null}
      </>
    );
  }
  if (summary.sequence !== undefined) {
    return (
      <Field label="children">
        <code>
          {summary.sequence.child_count} step
          {summary.sequence.child_count === 1 ? '' : 's'}
        </code>
      </Field>
    );
  }
  if (summary.scope !== undefined) {
    return (
      <>
        {summary.scope.stashes.length > 0 ? (
          <div className="weft-inspector-list">
            <div className="weft-inspector-label">
              stashes ({summary.scope.stashes.length})
            </div>
            <ul>
              {summary.scope.stashes.map((s) => (
                <li key={s.id}>
                  <code>{s.id}</code>
                  {s.key !== null ? <> → <code>{s.key}</code></> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {summary.scope.uses.length > 0 ? (
          <div className="weft-inspector-list">
            <div className="weft-inspector-label">
              uses ({summary.scope.uses.length})
            </div>
            <ul>
              {summary.scope.uses.map((u) => (
                <li key={u.id}>
                  <code>{u.id}</code> reads <code>{u.keys.join(', ')}</code>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </>
    );
  }
  if (summary.stash !== undefined) {
    return (
      <Field label="key">
        <code>{summary.stash.key ?? '(missing)'}</code>
      </Field>
    );
  }
  if (summary.use !== undefined) {
    return (
      <Field label="reads">
        <code>{summary.use.keys.join(', ') || '(none)'}</code>
      </Field>
    );
  }
  if (summary.cycle !== undefined) {
    return (
      <Field label="target">
        <code>{summary.cycle.target}</code>
      </Field>
    );
  }
  return (
    <p className="weft-inspector-hint">
      generic node — see raw config below.
    </p>
  );
}

function Field({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <div className="weft-inspector-field">
      <span className="weft-inspector-label">{label}</span>
      <span className="weft-inspector-value">{children}</span>
    </div>
  );
}

function WrappedRow({ wrapper }: { readonly wrapper: { readonly child_id: string; readonly child_kind: string } }): JSX.Element {
  return (
    <Field label="wraps">
      <code>{wrapper.child_kind}:{wrapper.child_id}</code>
    </Field>
  );
}
