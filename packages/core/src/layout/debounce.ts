/**
 * Debounced "latest wins" wrapper for async layout requests.
 *
 * Used by WeftCanvas to coalesce rapid-fire `layout_graph` calls into at most
 * one call per `delay_ms` (spec.md §5.2: 200ms in v0). Callers that fire
 * before the delay elapses receive the same Promise that resolves with the
 * **most recent** invocation's result, not their own arguments.
 *
 * Returned by a factory rather than declared at module scope so each canvas
 * gets its own queue (constraints §2: no module-level mutable state).
 */

type Args<T extends unknown[]> = T;
type AsyncFn<T extends unknown[], R> = (...args: Args<T>) => Promise<R>;

export type DebouncedAsync<T extends unknown[], R> = {
  readonly call: (...args: Args<T>) => Promise<R>;
  readonly cancel: () => void;
};

type Pending<R> = {
  resolve: (value: R) => void;
  reject: (err: unknown) => void;
};

export function make_latest_wins_debounce<T extends unknown[], R>(
  fn: AsyncFn<T, R>,
  delay_ms: number,
): DebouncedAsync<T, R> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let queued_args: Args<T> | null = null;
  let waiters: Pending<R>[] = [];

  function flush(): void {
    timer = null;
    const args = queued_args;
    const callers = waiters;
    queued_args = null;
    waiters = [];
    if (args === null) return;
    fn(...args).then(
      (value) => { for (const p of callers) p.resolve(value); },
      (err) => { for (const p of callers) p.reject(err); },
    );
  }

  function cancel(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    queued_args = null;
    waiters = [];
  }

  function call(...args: Args<T>): Promise<R> {
    queued_args = args;
    if (timer !== null) clearTimeout(timer);
    return new Promise<R>((resolve, reject) => {
      waiters.push({ resolve, reject });
      timer = setTimeout(flush, delay_ms);
    });
  }

  return { call, cancel };
}
