/**
 * @repo/studio module entry. The Vite app is bootstrapped from
 * `src/main.tsx` against `index.html`; this module entry exists so
 * fallow / tests can resolve the package by name.
 */

export { version } from './version.js';
export { App, SEARCH_INPUT_ID } from './App.js';
export { auto_wrap_payload } from './loaders/auto_wrap.js';
export {
  parse_json_text,
  validate_loader_payload,
} from './loaders/validate_payload.js';
export type {
  ValidationOk,
  ValidationErr,
  ValidationResult,
} from './loaders/validate_payload.js';
export {
  fetch_src_payload,
  validate_src_url,
} from './loaders/url_fetch.js';
export type {
  FetchLike,
  UrlFetchOk,
  UrlFetchErr,
  UrlFetchResult,
} from './loaders/url_fetch.js';
export {
  next_backoff_delay,
  should_keep_retrying,
  BACKOFF_BASE_MS,
  BACKOFF_MAX_MS,
  BACKOFF_JITTER_MS,
  BACKOFF_MAX_ATTEMPTS,
} from './state/backoff.js';
export {
  persist_state,
  read_state,
  read_index,
  state_key,
  touch_index,
  INDEX_CAP,
  INDEX_KEY,
  STATE_KEY_PREFIX,
} from './state/canvas_persistence.js';
export type {
  CanvasState,
  CanvasViewport,
  IndexEntry,
  PersistOk,
  PersistErr,
  PersistResult,
} from './state/canvas_persistence.js';
export { use_canvas_persistence } from './state/use_canvas_persistence.js';
export type { UseCanvasPersistenceResult } from './state/use_canvas_persistence.js';
export { use_watch_socket } from './state/use_watch_socket.js';
export type {
  WatchStatus,
  WatchSocketState,
  UseWatchSocketOptions,
  UseWatchSocketResult,
} from './state/use_watch_socket.js';
export type {
  WatchEnvelope,
  WatchUnreachableReason,
} from './state/watch_envelope.js';
export { is_watch_envelope } from './state/watch_envelope.js';
export { apply_collapse } from './state/collapse.js';
export { summarize_for_inspector } from './state/inspector.js';
export type {
  InspectorSummary,
  WrapperSummary,
  ParallelSummary,
  ScopeSummary,
  ScopeStash,
  ScopeUse,
  SequenceSummary,
} from './state/inspector.js';
export { CanvasShell } from './components/CanvasShell.js';
export type { CanvasShellProps } from './components/CanvasShell.js';
export { LoaderPanel } from './components/LoaderPanel.js';
export type { LoaderError, LoaderPanelProps } from './components/LoaderPanel.js';
export { InspectorPanel } from './components/InspectorPanel.js';
export type { InspectorPanelProps } from './components/InspectorPanel.js';
export { ShortcutsModal } from './components/ShortcutsModal.js';
export type { ShortcutsModalProps } from './components/ShortcutsModal.js';
export { Banner } from './components/Banner.js';
export type { BannerProps, BannerTone } from './components/Banner.js';
export { EmptyRoute } from './routes/EmptyRoute.js';
export { ViewRoute } from './routes/ViewRoute.js';
export type { ViewRouteProps } from './routes/ViewRoute.js';
export { WatchRoute } from './routes/WatchRoute.js';
export type { WatchRouteProps } from './routes/WatchRoute.js';
