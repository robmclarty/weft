import { describe, expect, it, vi } from 'vitest';
import { make_latest_wins_debounce } from '../debounce.js';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('make_latest_wins_debounce', () => {
  it('coalesces rapid successive calls into a single invocation with the most recent args', async () => {
    const fn = vi.fn(async (n: number) => n * 2);
    const debounced = make_latest_wins_debounce(fn, 50);

    const a = debounced.call(1);
    const b = debounced.call(2);
    const c = debounced.call(3);

    const [ra, rb, rc] = await Promise.all([a, b, c]);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(3);
    expect(ra).toBe(6);
    expect(rb).toBe(6);
    expect(rc).toBe(6);
  });

  it('runs again on a new call after the prior batch resolves', async () => {
    const fn = vi.fn(async (n: number) => n);
    const debounced = make_latest_wins_debounce(fn, 20);

    await debounced.call(1);
    await debounced.call(2);

    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn.mock.calls[0]?.[0]).toBe(1);
    expect(fn.mock.calls[1]?.[0]).toBe(2);
  });

  it('cancel() clears pending invocation without firing the function', async () => {
    const fn = vi.fn(async () => 'done');
    const debounced = make_latest_wins_debounce(fn, 100);

    void debounced.call();
    debounced.cancel();
    await delay(150);

    expect(fn).not.toHaveBeenCalled();
  });
});
