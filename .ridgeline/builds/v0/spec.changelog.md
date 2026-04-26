# Spec Changelog

## Iteration 1

- **§3 Canvas state — renamed `tree_hash` → `tree_id`, switched from SHA-256 to FNV-1a (per research F8):** `crypto.subtle.digest` is unconditionally async and would force `await` through the synchronous render path. Collision resistance is unnecessary for a localStorage key.
- **§3 Canvas state — added LRU bookkeeping (per research F11):** specified `weft.canvas.index` shape, 50-entry cap, eviction on overflow, try/catch around `setItem` with retry on `QuotaExceededError`. Documents Safari's 7-day storage purge as a known limitation.
- **§4.2 / §5.4 — hardened `?src=` URL fetch (per research F13):** restricted protocols to `https:` / `http://localhost`; specified `credentials: 'omit'`, `redirect: 'error'`; banned `dangerouslySetInnerHTML` for error UI; documented Chrome 130+ Private Network Access caveat.
- **§4.3 — added ELK port-constraints note to `parallel` encoding (per research F5):** multi-handle layout requires `org.eclipse.elk.portConstraints: 'FIXED_ORDER'` and per-handle `port` declarations.
- **§5.1 — clarified ELK ↔ React Flow shape conversion and parent-relative coordinates (per research F2):** `tree_to_graph` emits ELK-shaped input directly (since `FlowNode` is already a tree), then converts to flat React Flow with `parentId`. Both formats use parent-relative coordinates; do not double-offset children.
- **§5.1 rules 2–3 — replaced `parentNode` with `parentId` (per research F1):** the field was renamed in xyflow v11.11+ and removed in v12.
- **§5.1 rule 7 — added flat-array depth-first ordering rule (per research F15):** mitigates xyflow Discussion #4830 subflow ordering bug. Cross-references the regression test in §9.
- **§5.2 — specified ELK integration via `elk-api` + `workerFactory` + `import.meta.url` (per research F3):** with code example. The default `elk.bundled.js` requires `unsafe-eval` and fights Vite. F5 fallback simplified to "omit `workerFactory`".
- **§5.2 — added two-pass measure-then-layout sequence (per research F4):** render hidden → `useNodesInitialized` → harvest `node.measured.*` → ELK → reveal. Documented the `node.measured.*` rename in v12. Recommended starting with the cheaper fixed-CSS-dimensions alternative for v0; tracked the choice as open question §13.8.
- **§5.5 — re-sequenced watch CLI startup to bind-then-resolve-then-open (per research F9):** added `--no-open` and `--studio-url <url>` flags; made explicit that the CLI does not start Vite.
- **§5.5 — specified WebSocket reconnect protocol (per research F10):** exponential backoff with jitter, banner UI, ~12-attempt cap with manual reconnect button, no extra dependency.
- **§5.6 (new) — PNG export recipe (per research F6, resolves Q4):** `getNodesBounds` → `getViewportForBounds` → `html-to-image.toPng` on `.react-flow__viewport`, filter selector excludes minimap/controls/attribution. Pinned `html-to-image` to exactly `1.11.11`.
- **§5.6 + §6 Constraints — first-party CSS / fonts requirement (per research F7):** `html-to-image` cannot read cross-origin stylesheets and fonts do not auto-inline. Self-host all fonts; no `<link>` to cross-origin stylesheets.
- **§6 Constraints — pinned `@xyflow/react ≥ 12.2` and `elkjs ≥ 0.9` (per research F1, F3, F4).**
- **§6 Constraints — added performance-optimization rule (per research F12):** above 200 nodes, enable `OnlyRenderVisibleElements` and disable minimap while panning; memoize custom node components.
- **§7 Dependencies — added `html-to-image@1.11.11` to `@repo/core` (exact version, per research F6); annotated `@xyflow/react` and `elkjs` version pins with rationale.**
- **§8 Failure Modes — added F8 (WebSocket disconnect, per research F10), F9 (`?src=` rejected schemes / PNA, per research F13), F10 (localStorage quota, per research F11), F11 (Safari PNG limitations, per research F7).**
- **§8 F3 — lowered performance targets (per research F12):** "60fps up to 500 nodes" instead of 2000; trees > 500 are best-effort. Added cross-reference to the §6 perf-optimization threshold.
- **§9 Success Criteria — added `parallel` ordering regression test (per research F15), watch-mode reconnect test (per research F10), localStorage LRU test (per research F11), and CI grep for `unsafe-eval` (per research F14).**
- **§10 File Structure — added `tree_id.ts`, `png_export.ts`, `use_watch_socket.ts`, and `parallel_ordering.json` fixture; annotated relevant files with research citations.**
- **§12 (new) — Content Security Policy template for hosted demo (per research F14):** explicit `script-src`, `worker-src`, `connect-src`, etc.; explains how the §5.2 ELK integration choice avoids needing `unsafe-eval`. Renumbered the prior §12 to §13.
- **§13 Open Questions — resolved Q4 (PNG export scale) per F6; added Q8 (first-pass layout strategy: fixed dimensions vs full two-pass) per research F4.**
