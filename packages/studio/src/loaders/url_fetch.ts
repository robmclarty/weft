/**
 * URL-fetch loader for the `/view?src=<url>` route.
 *
 * Hardened per research F13 / spec §4.2 §8 F9:
 *   - Restrict `URL.protocol` to `https:` or `http://localhost`.
 *   - Reject `file:`, `javascript:`, `data:` schemes.
 *   - `fetch(url, { credentials: 'omit', redirect: 'error' })` — cookies are
 *     not sent and redirects do not bounce to surprises.
 *   - On CORS / Private Network Access failures, surface a fetch error with
 *     a hint pointing the user toward the watch CLI.
 *
 * Validation of the fetched JSON is the caller's job (via
 * `validate_loader_payload`).
 */

const LOCALHOST_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const FETCH_HINT =
  'For local fascicle output, the watch CLI (weft-watch) avoids browser fetch restrictions.';

export type UrlFetchOk = {
  readonly ok: true;
  readonly payload: unknown;
};

export type UrlFetchErr = {
  readonly ok: false;
  readonly reason:
    | 'invalid_url'
    | 'forbidden_scheme'
    | 'forbidden_origin'
    | 'fetch_failed'
    | 'parse_failed';
  readonly message: string;
};

export type UrlFetchResult = UrlFetchOk | UrlFetchErr;

export function validate_src_url(input: string):
  | { readonly ok: true; readonly url: URL }
  | { readonly ok: false; readonly reason: 'invalid_url' | 'forbidden_scheme' | 'forbidden_origin'; readonly message: string } {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return {
      ok: false,
      reason: 'invalid_url',
      message: `not a valid URL: ${input}`,
    };
  }
  if (parsed.protocol === 'https:') return { ok: true, url: parsed };
  if (parsed.protocol === 'http:') {
    if (LOCALHOST_HOSTS.has(parsed.hostname)) return { ok: true, url: parsed };
    return {
      ok: false,
      reason: 'forbidden_origin',
      message: `http: is only permitted for localhost; got ${parsed.host}`,
    };
  }
  return {
    ok: false,
    reason: 'forbidden_scheme',
    message: `forbidden URL scheme: ${parsed.protocol}`,
  };
}

export type FetchLike = (
  input: string,
  init?: { credentials?: RequestCredentials; redirect?: RequestRedirect },
) => Promise<{ ok: boolean; status: number; statusText: string; text: () => Promise<string> }>;

export async function fetch_src_payload(
  input: string,
  fetch_impl: FetchLike,
): Promise<UrlFetchResult> {
  const validated = validate_src_url(input);
  if (!validated.ok) {
    return { ok: false, reason: validated.reason, message: validated.message };
  }
  let response: Awaited<ReturnType<FetchLike>>;
  try {
    response = await fetch_impl(validated.url.toString(), {
      credentials: 'omit',
      redirect: 'error',
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      reason: 'fetch_failed',
      message: `${detail}. ${FETCH_HINT}`,
    };
  }
  if (!response.ok) {
    return {
      ok: false,
      reason: 'fetch_failed',
      message: `HTTP ${String(response.status)} ${response.statusText}. ${FETCH_HINT}`,
    };
  }
  let body: string;
  try {
    body = await response.text();
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      reason: 'fetch_failed',
      message: `failed to read response body: ${detail}`,
    };
  }
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      reason: 'parse_failed',
      message: `JSON parse failed: ${detail}`,
    };
  }
  return { ok: true, payload };
}
