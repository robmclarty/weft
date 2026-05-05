/**
 * @repo/watch (= @robmclarty/weft-watch) module entry.
 *
 * Re-exports the schema, message envelope, and CLI entry function for use
 * by tests. End users invoke the package via the `weft-watch` binary; this
 * module is not the consumption surface for end users.
 */

export { version } from './version.js';
export { main, parse_argv } from './bin.js';
export type { CliOptions, CliHandle } from './bin.js';
export {
  flow_node_schema,
  flow_tree_schema,
  flow_value_schema,
} from './schemas.js';
export type { FlowNode, FlowTree, FlowValue } from './schemas.js';
export type { WeftWatchMessage, UnreachableReason } from './messages.js';
export { validate_input, read_and_validate } from './validate.js';
export type { ValidationResult, ReadResult } from './validate.js';
export {
  start_ws_server,
  resolve_listening_port,
} from './ws_server.js';
export type { WsServerHandle, ListeningServer } from './ws_server.js';
export { start_tree_watcher } from './watcher.js';
export type { WatcherHandle, WatcherCallbacks } from './watcher.js';
export { start_events_tail } from './events_tail.js';
export type { EventsTailHandle, EventsTailCallbacks } from './events_tail.js';
export {
  trajectory_event_schema,
  span_start_event_schema,
  span_end_event_schema,
  emit_event_schema,
  custom_event_schema,
} from './trajectory_event_schema.js';
export type { ParsedTrajectoryEvent } from './trajectory_event_schema.js';
