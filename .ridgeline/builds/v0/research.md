# Research Findings

> Research for spec: weft v0 — React Flow-based static visualizer for fascicle composition trees

## Active Recommendations

- **Standardize on `parentId` (not `parentNode`)** in §5.1 rules 2–3 and pin `@xyflow/react` ≥ 12.2 in §6 — the field was renamed in xyflow v11.11+ and removed in v12; v12.2 is also the first release that fixes the `useNodesInitialized` measurement race. [F1, F11]
- **Make the React Flow ↔ ELK shape conversion explicit in §5.1 / §5.2.** ELK requires nested `children` arrays with parent-relative `x/y`; React Flow uses a flat array with `parentId` and parent-relative positions. Either have `tree_to_graph` emit ELK-shaped input directly (preferred — `FlowNode` is already a tree) or add `flat_to_elk_tree` / `elk_tree_to_flat` helpers. Critically, when flattening: do **not** add the parent's position to the child's — both formats use parent-relative coordinates, so passing `position: { x: child.x, y: child.y }` straight through is correct. [F2]
- **Pin `elkjs ≥ 0.9` (current 0.11) and instantiate via `elkjs/lib/elk-api` + `workerFactory`** rather than the default `elk.bundled.js`. The bundled build uses `Function(...)` (requires `unsafe-eval`) and fights Vite's pre-bundling; the api+factory pattern gives Vite a static URL it can fingerprint. Reference: `new ELK({ workerFactory: () => new Worker(new URL('elkjs/lib/elk-worker.min.js', import.meta.url)) })`. The F5 fallback (no Worker) becomes "omit `workerFactory`" — elkjs runs in-thread automatically. [F3]
- **Adopt a two-pass measure-then-layout sequence in §5.2.** Custom node sizes are unknown until React renders them; in @xyflow/react v12, dimensions live on `node.measured.width/height`, not `node.*`. Render hidden, gate first layout on `useNodesInitialized`, harvest measurements, run ELK, apply, reveal. Cheaper alternative for v0's seven primitives: declare fixed widths/heights per kind in CSS so the first ELK pass uses known dimensions and the measure step is optional — trades visual flexibility for a simpler render path. [F4]
- **Add `org.eclipse.elk.portConstraints: 'FIXED_ORDER'`** to ELK input options in §5.2, with per-handle `port` declarations matching React Flow handle ids. Without this, ELK ignores handle positions and routes edges into arbitrary node sides — visible immediately on `parallel` (multi-handle container). [F5]
- **Pin `html-to-image` to exactly `1.11.11`** (no caret) in `@repo/core` deps and resolve §12 Q4 with the official recipe: `getNodesBounds(getNodes())` → `getViewportForBounds(...)` → `toPng(viewportEl, { width, height, style: { transform } })`. Filter selector must exclude `.react-flow__minimap`, `.react-flow__controls`, `.react-flow__attribution`. Versions after 1.11.11 are broken for React Flow edges. [F6]
- **Mandate first-party CSS and fonts** in operational notes. `html-to-image` cannot read cross-origin stylesheets and fonts do not auto-inline into `<foreignObject>`; a future "let's add Inter from Google Fonts" change would silently break PNG export and may throw `SecurityError`. Tailwind already complies. Document Safari `<foreignObject>` partial-support as a known limitation in §8. [F7]
- **Replace `tree_hash` (SHA-256) with `tree_id` (sync FNV-1a) in §3.** `crypto.subtle.digest` is unconditionally async and would force `await` through the otherwise-synchronous render path. Collision resistance is unnecessary for a localStorage key; collision consequence is "tree B briefly shows tree A's viewport, immediately overridden by panning." ~30 lines, zero deps, base36 or hex output. [F8]
- **Re-sequence §5.5 watch CLI startup** to bind-then-resolve-then-open: (1) `wsServer.listen(0, '127.0.0.1')`; (2) on `listening` event, read `server.address().port`; (3) construct studio URL with that port; (4) open it. Add `--no-open` and `--studio-url <url>` flags. Make explicit that the CLI does **not** start Vite — the studio dev server is the user's responsibility. [F9]
- **Specify a WebSocket reconnect protocol in §5.5.** On `close`, retry with `min(30s, 500ms × 2^attempt) + random(0..500ms)` jitter, surface a "disconnected, reconnecting…" banner, reset attempt counter on success, give up after ~12 attempts (~10 minutes) with a manual reconnect button. App-level heartbeat is probably overkill for a localhost dev tool — defer until false negatives appear. Implement inline (~40 lines), no `reconnecting-websocket` dependency. [F10]
- **Add a studio-internal LRU cap for canvas state in §3 / `use_canvas_persistence.ts`.** localStorage is 5MB per origin and the browser's LRU evicts entire origins, not individual keys; without an internal cap, daily fascicle hacking eventually triggers `QuotaExceededError` or whole-origin eviction. Maintain `weft.canvas.index` listing `{ tree_id, last_access }`, cap at 50 entries, evict oldest on overflow, wrap `setItem` in try/catch with aggressive evict-and-retry. Document Safari's 7-day no-interaction storage purge as a known limitation, not a bug. [F11]
- **Lower §8 F3 performance targets** to the realistic envelope: "Layout completes in < 5s for trees up to 500 nodes; canvas pan/zoom stays at 60fps up to 500 nodes; trees > 500 nodes are best-effort." React Flow maintainers explicitly say the library is not intended for 1000+ nodes. Add a §6 constraint enabling `OnlyRenderVisibleElements` and disabling minimap-while-panning above a node-count threshold. [F12]
- **Pin `/view?src=` as a client-side fetch and harden it.** Restrict `URL.protocol` to `https:` or `http://localhost`; reject `file:`, `javascript:`, `data:`. Use `fetch(url, { credentials: 'omit', redirect: 'error' })` so cookies aren't sent and redirects don't bounce to surprises. Render error messages through React's normal text-children path (no `dangerouslySetInnerHTML`). Document the Chrome Private Network Access caveat: a hosted weft cannot reach `localhost` JSON servers without `Access-Control-Allow-Private-Network: true` from the target — pushes localhost dev users toward the watch CLI (which the spec already prefers). Add as F8/F9 in §8. [F13]
- **Add a §13 (or §11 extension) CSP template for the hosted demo:** `script-src 'self'; worker-src 'self' blob:; connect-src 'self' ws://localhost:* wss:; img-src 'self' data: blob:; style-src 'self';`. Add a CI check that greps the production bundle for `unsafe-eval` and fails if found (catches accidental `elk.bundled.js` regressions). Dev server stays CSP-free. [F14]
- **Write a regression test for `parallel` ordering before writing `ParallelNode`.** xyflow Discussion #4830 documents an unresolved subflow ordering bug where multi-path layouts render in modification order, not declaration order — exactly weft's `parallel` case. If the bug bites, the documented escape hatch is setting `nodes[i].zIndex` explicitly from declaration order. Fixture: 3+ named branches, layout, re-layout after a config tweak, assert stable order. [F15]

## Findings Log

### Iteration 1 — 2026-04-25

#### F1 — `parentNode` renamed to `parentId` (xyflow v11.11+)

**Source:** [xyflow Discussion #3495](https://github.com/xyflow/xyflow/discussions/3495), [Migrate to React Flow 12](https://reactflow.dev/learn/troubleshooting/migrate-to-v12)
**Perspective:** academic + competitive (convergent)
**Relevance:** Spec §5.1 rules 2–3 use the old `parentNode` name; v12 removed it.
**Recommendation:** Change "`parentNode`-linked" to "`parentId`-linked" in §5.1; pin `@xyflow/react` ≥ 12.2 in §6.

#### F2 — React Flow flat ↔ ELK nested shape conversion

**Source:** [xyflow Discussion #3495](https://github.com/xyflow/xyflow/discussions/3495), [React Flow ELK Tree example](https://reactflow.dev/examples/layout/elkjs), [Sub Flows · React Flow](https://reactflow.dev/learn/layouting/sub-flows), [react-flow-elk-mixed-layout reference](https://github.com/dipockdas/react-flow-elk-mixed-layout)
**Perspective:** academic + competitive (convergent)
**Relevance:** Spec §5.1 says container kinds use `parentNode`-linked children; §5.2 says ELK lays them out. ELK requires nested `children` arrays, not a flat `parentId` array. Critically, ELK emits child positions parent-relative *when given a nested input* — same convention as React Flow's subflow renderer. Risk of regression: an implementer naively absolute-izing coordinates would double-offset children.
**Recommendation:** Make conversion explicit in §5.1 / §5.2. Preferred: have `tree_to_graph` emit ELK-shaped input directly (the source `FlowNode` is already a tree), then convert to React Flow flat shape after layout. Pass `position: { x: child.x, y: child.y }` straight through — no parent offset. Sort the resulting flat array depth-first (parents before children) to avoid the multi-path render-order bug noted in Discussion #4830.

#### F3 — elkjs in Vite: use `elk-api` + `workerFactory` + `import.meta.url`

**Source:** [elkjs README](https://github.com/kieler/elkjs/blob/master/README.md), [elkjs Issue #141](https://github.com/kieler/elkjs/issues/141), [elkjs Issue #272](https://github.com/kieler/elkjs/issues/272), [eclipse-glsp Discussion #1345](https://github.com/eclipse-glsp/glsp/discussions/1345), [Vite Pre-Bundling](https://vite.dev/guide/dep-pre-bundling)
**Perspective:** academic + competitive (convergent)
**Relevance:** §5.2 says "layout runs in a Web Worker" but does not name the integration. The default `elkjs/lib/elk.bundled.js` self-spawns via `Function(...)` (needs `unsafe-eval`, fights Vite pre-bundling). Authoring your own `worker.ts` that imports `elkjs` hits Issue #141 (open) and #272 (`_Worker is not a constructor` in Vite).
**Recommendation:** Pin `elkjs ≥ 0.9.0` (current 0.11.0). Use the GLSP-tested pattern:
```ts
import ELK from 'elkjs/lib/elk-api.js';
const elk = new ELK({
  workerFactory: () => new Worker(
    new URL('elkjs/lib/elk-worker.min.js', import.meta.url),
    { type: 'module' }
  ),
});
```
Weft does not author a worker module; it lets elkjs construct one. F5 fallback simplifies: omit `workerFactory` and elkjs runs in-thread.

#### F4 — Two-pass measure-then-layout via `useNodesInitialized` + `node.measured.*`

**Source:** [Migrate to React Flow 12](https://reactflow.dev/learn/troubleshooting/migrate-to-v12), [useNodesInitialized hook](https://reactflow.dev/api-reference/hooks/use-nodes-initialized), [xyflow Issue #4202](https://github.com/xyflow/xyflow/issues/4202), [xyflow Discussion #2973](https://github.com/xyflow/xyflow/discussions/2973)
**Perspective:** competitive
**Relevance:** ELK needs node `width`/`height`; custom node sizes are unknown until React renders them. In @xyflow/react v12, dimensions moved to `node.measured.width/height` (was `node.width/height` in v11). v12.0–v12.1 has a race where `useNodesInitialized` fires before `getNodes()` exposes measurements.
**Recommendation:** Document the two-pass flow in §5.2: render hidden → wait `useNodesInitialized` → harvest `node.measured.*` → run ELK → apply → reveal. Pin `@xyflow/react ≥ 12.2`. Cheaper v0 alternative: declare fixed CSS widths/heights per kind so the first pass already has dimensions — matches the bootcamp scope.

#### F5 — ELK port constraints required for multi-handle nodes

**Source:** [React Flow ELK Multiple Handles example](https://reactflow.dev/examples/layout/elkjs-multiple-handles)
**Perspective:** competitive
**Relevance:** §4.3 `parallel` encoding implies multiple handles per node. Without `'org.eclipse.elk.portConstraints': 'FIXED_ORDER'` and per-handle `port` declarations, ELK ignores handle positions and routes edges into arbitrary node sides.
**Recommendation:** Add to §5.2 layout options. Easy to miss; difference between "looks correct" and "doesn't."

#### F6 — PNG export: pin `html-to-image@1.11.11` + official recipe

**Source:** [Download Image example](https://reactflow.dev/examples/misc/download-image), [getNodesBounds](https://reactflow.dev/api-reference/utils/get-nodes-bounds), [getViewportForBounds](https://reactflow.dev/api-reference/utils/get-viewport-for-bounds), [html-to-image npm](https://www.npmjs.com/package/html-to-image), [xyflow Discussion #1061](https://github.com/xyflow/xyflow/discussions/1061)
**Perspective:** academic + competitive (convergent)
**Relevance:** §4.1 declares `export_png(): Promise<Blob>`; §12 Q4 leaves implementation open. Versions after 1.11.11 break React Flow edges (the official example pins exactly 1.11.11 in its package.json).
**Recommendation:** `"html-to-image": "1.11.11"` (exact, no caret). Capture `.react-flow__viewport`, not `.react-flow`. Compute bounds via `getNodesBounds(getNodes())` → `getViewportForBounds(...)`, pass `width`, `height`, and CSS `transform` override to `toPng`. Filter out `.react-flow__minimap`, `.react-flow__controls`, `.react-flow__attribution`. Resolve §12 Q4 with "full canvas via `getNodesBounds` + `getViewportForBounds`."

#### F7 — html-to-image cannot read cross-origin stylesheets or auto-inline web fonts

**Source:** [bubkoo/html-to-image#301](https://github.com/bubkoo/html-to-image/issues/301), [bubkoo/html-to-image#179](https://github.com/bubkoo/html-to-image/issues/179), [Rendering HTML to images with SVG foreignObject](https://semisignal.com/rendering-web-content-to-image-with-svg-foreign-object/)
**Perspective:** academic
**Relevance:** A future `<link rel="stylesheet" href="https://fonts.googleapis.com/...">` would throw `SecurityError: Not allowed to access cross-origin stylesheet` from `toPng`. Fonts also do not auto-inline into `<foreignObject>`. Safari has additional `<foreignObject>` security restrictions.
**Recommendation:** Add operational constraint: all CSS and fonts must be first-party. Self-host any web font. Tailwind already complies — risk is a future "let's add Inter from Google Fonts" PR. Document Safari second-class PNG export as a known limitation in §8.

#### F8 — Replace SHA-256 `tree_hash` with synchronous FNV-1a `tree_id`

**Source:** [SubtleCrypto.digest()](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest), [Non-cryptographic uses of SubtleCrypto](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API/Non-cryptographic_uses_of_subtle_crypto), [WICG synchronous WebCrypto](https://discourse.wicg.io/t/synchronous-webcrypto/628/)
**Perspective:** academic + competitive (convergent)
**Relevance:** §3 keys canvas state by SHA-256. `crypto.subtle.digest` is unconditionally async (runs on a native thread); a SHA over 1MB JSON is also wall-clock noticeable (~5–10ms cold). Forces `await` through the synchronous render path. Collision resistance is irrelevant — this is a localStorage key, not a security boundary.
**Recommendation:** Rename `tree_hash` → `tree_id` in §3, define as 64-bit FNV-1a over `JSON.stringify(root)` rendered as base36. Synchronous, deterministic, ~30 lines, zero deps. If scale demands stronger collision resistance later, swap in xxHash via wasm — not v0.

#### F9 — Watch CLI port handshake: bind, then resolve, then open

**Source:** [ws GitHub README](https://github.com/websockets/ws), [Maxim Orlov — Random Port to Node.js Server](https://maximorlov.com/tips/assign-a-random-port-to-nodejs-server/), [w3tutorials — Server Port Dynamically After Listening](https://www.w3tutorials.net/blog/nodejs-how-to-get-the-server-s-port/)
**Perspective:** academic + competitive (convergent)
**Relevance:** §5.5 step 1 says "opens a local WebSocket on `127.0.0.1:<random port>`" then "opens `http://localhost:5173/watch?ws=<port>`" — but doesn't pin the order. Inattentive impl could probe a free port via separate socket and TOCTOU-race another process. `server.address()` returns `null` until the `listening` event fires.
**Recommendation:** Replace §5.5 step 1: "Binds a WebSocket on `127.0.0.1:0` (OS-assigned). After `listening` fires, reads `server.address().port`." Step 2 stays but is now causally sequenced. Add `--no-open` and `--studio-url <url>` flags for headless / non-default-browser cases. The CLI does **not** start Vite — that's the user's responsibility.

#### F10 — WebSocket reconnect protocol

**Source:** [websocket.org Reconnection Guide](https://websocket.org/guides/reconnection/), [DEV — Robust WebSocket Reconnection with Exponential Backoff](https://dev.to/hexshift/robust-websocket-reconnection-strategies-in-javascript-with-exponential-backoff-40n1), [robust-websocket](https://github.com/nathanboktae/robust-websocket)
**Perspective:** academic + competitive (convergent)
**Relevance:** §4.2 / §5.5 are silent on disconnect. Page refresh, CLI restart, sleep/wake all silently leave the user with a stale tree.
**Recommendation:** Specify in §5.5: on `onclose`, retry with `min(30s, 500ms × 2^n) + random(0..500ms)` jitter; surface "disconnected, reconnecting…" banner; reset attempts on success; give up after ~12 attempts (~10 min) with manual reconnect button. App-level heartbeat is probably overkill for localhost dev; defer unless false-negatives surface. Implement inline (~40 lines), no `reconnecting-websocket` dep.

#### F11 — localStorage 5MB cap + Safari 7-day rule require LRU bookkeeping

**Source:** [MDN — Storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria), [MDN — Browser storage limits](https://devdoc.net/web/developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Browser_storage_limits_and_eviction_criteria.html)
**Perspective:** academic + competitive (convergent)
**Relevance:** §3 keys per-tree. Browser LRU evicts whole *origins* under disk pressure, not individual keys. Daily fascicle hacking accumulates ~100s of unique tree hashes; eventually `setItem` throws `QuotaExceededError` or the whole origin is dropped. Safari additionally purges script-written storage after 7 days of no user interaction.
**Recommendation:** Add internal LRU in `use_canvas_persistence.ts`: maintain `weft.canvas.index` with `{ tree_id, last_access }[]`, cap at 50 entries, evict oldest on overflow. Wrap `setItem` in try/catch; on `QuotaExceededError` evict aggressively then retry. Document Safari's 7-day rule in §8 as a known limitation.

#### F12 — Performance targets are unrealistic

**Source:** [React Flow Performance docs](https://reactflow.dev/learn/advanced-use/performance), [xyflow Discussion #3003](https://github.com/xyflow/xyflow/discussions/3003), [xyflow Discussion #4975](https://github.com/xyflow/xyflow/discussions/4975)
**Perspective:** competitive
**Relevance:** §8 F3 promises "60fps up to 2000 nodes." React Flow maintainers explicitly say the library "is not intended to be used at the scale of 1000+ nodes/edges" — a canvas-based renderer is the right tool at that scale. Hitting 60fps at 2000 requires aggressive `nodesDraggable={false}`, `elementsSelectable={false}`, `OnlyRenderVisibleElements`, disabled minimap, memoized custom nodes.
**Recommendation:** Lower targets: "Layout < 5s for trees up to 500 nodes; canvas pan/zoom 60fps up to 500 nodes; trees > 500 are best-effort." Add §6 constraint: enable `OnlyRenderVisibleElements` and disable minimap-while-panning above a threshold (e.g., 200 nodes). Spec what's promised, not aspirational.

#### F13 — `?src=` is client-side, CORS-bounded, but Private Network Access blocks hosted→localhost

**Source:** [Chrome — Private Network Access: introducing preflights](https://developer.chrome.com/blog/private-network-access-preflight), [Chrome PNA Update](https://developer.chrome.com/blog/private-network-access-update), [MDN — SSRF](https://developer.mozilla.org/en-US/docs/Web/Security/Attacks/SSRF), [MDN — CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS)
**Perspective:** academic + competitive (convergent, with PNA addition)
**Relevance:** §4.2 `?src=` doesn't say client-side vs proxy. As client-side fetch, classical SSRF is bounded by CORS. Residual risks: cookies on side-effecting GETs to internal URLs, `file://` / `javascript:` schemes, error UI XSS. Chrome 130+ also blocks `https://hosted-weft → http://localhost:N` requests without `Access-Control-Allow-Private-Network: true` from the target — local fascicle servers won't send this, so the natural "hosted weft + local JSON" use case silently fails.
**Recommendation:** Pin in §4.2 / §5.4: (a) `?src=` is a client-side fetch, no studio proxy; (b) restrict scheme to `https:` or `http://localhost`, reject `file:`, `javascript:`, `data:`; (c) `fetch(url, { credentials: 'omit', redirect: 'error' })`; (d) render errors via React text-children, no `dangerouslySetInnerHTML`; (e) document PNA caveat — pushes localhost dev users toward the watch CLI (which the spec already prefers). Add as F8/F9 in §8.

#### F14 — CSP for hosted demo

**Source:** [vitejs/vite#16749](https://github.com/vitejs/vite/issues/16749), [Working with CSP and Vite — Stackademic](https://stackademic.com/blog/working-with-csp-and-vite), [mswjs/msw#1715](https://github.com/mswjs/msw/discussions/1715), [vite-plugin-content-security-policy](https://github.com/Coreoz/vite-plugin-content-security-policy)
**Perspective:** academic + competitive (convergent)
**Relevance:** §6 constraints are silent on CSP. If hosted as a static demo, prod needs a CSP that doesn't break the elkjs worker. Vite's module-worker output sometimes uses blob URLs.
**Recommendation:** Add §13 (or §11 extension) template: `script-src 'self'; worker-src 'self' blob:; connect-src 'self' ws://localhost:* wss:; img-src 'self' data: blob:; style-src 'self';`. CI check that greps prod bundle for `unsafe-eval` and fails (catches accidental `elk.bundled.js` regressions per F3). Dev server stays CSP-free.

#### F15 — Subflow ordering bug (xyflow Discussion #4830) is unresolved upstream

**Source:** [xyflow Discussion #4830](https://github.com/xyflow/xyflow/discussions/4830)
**Perspective:** academic
**Relevance:** Multi-path subflow layouts can render in modification order, not declaration order — exactly weft's `parallel` case. Open with no maintainer response.
**Recommendation:** Write the regression test before writing `ParallelNode`: 3+ named branches, layout, re-layout after a config tweak, assert stable order. Documented escape hatch if the bug bites: set `nodes[i].zIndex` explicitly from declaration order.

## Sources

1. [xyflow Discussion #3495 — ElkJS/Dagre with subflows](https://github.com/xyflow/xyflow/discussions/3495)
2. [xyflow Discussion #4830 — ELKJS with subflow](https://github.com/xyflow/xyflow/discussions/4830)
3. [React Flow ELK Tree example](https://reactflow.dev/examples/layout/elkjs)
4. [React Flow ELK Multiple Handles example](https://reactflow.dev/examples/layout/elkjs-multiple-handles)
5. [Sub Flows · React Flow](https://reactflow.dev/learn/layouting/sub-flows)
6. [react-flow-elk-mixed-layout reference repo](https://github.com/dipockdas/react-flow-elk-mixed-layout)
7. [React Flow Download Image example](https://reactflow.dev/examples/misc/download-image)
8. [getNodesBounds — React Flow](https://reactflow.dev/api-reference/utils/get-nodes-bounds)
9. [getViewportForBounds — React Flow](https://reactflow.dev/api-reference/utils/get-viewport-for-bounds)
10. [xyflow Discussion #1061 — Save as image](https://github.com/xyflow/xyflow/discussions/1061)
11. [html-to-image GitHub](https://github.com/bubkoo/html-to-image)
12. [html-to-image npm](https://www.npmjs.com/package/html-to-image)
13. [bubkoo/html-to-image#301 — CSS CORS](https://github.com/bubkoo/html-to-image/issues/301)
14. [bubkoo/html-to-image#179](https://github.com/bubkoo/html-to-image/issues/179)
15. [Rendering HTML to images with SVG foreignObject](https://semisignal.com/rendering-web-content-to-image-with-svg-foreign-object/)
16. [Migrate to React Flow 12](https://reactflow.dev/learn/troubleshooting/migrate-to-v12)
17. [useNodesInitialized hook — React Flow](https://reactflow.dev/api-reference/hooks/use-nodes-initialized)
18. [xyflow Issue #4202 — nodesInitialized firing order](https://github.com/xyflow/xyflow/issues/4202)
19. [xyflow Discussion #2973 — initialize→measure→layout→render](https://github.com/xyflow/xyflow/discussions/2973)
20. [React Flow Performance guide](https://reactflow.dev/learn/advanced-use/performance)
21. [xyflow Discussion #3003 — 1000+ nodes feasibility](https://github.com/xyflow/xyflow/discussions/3003)
22. [xyflow Discussion #4975 — large-graph performance](https://github.com/xyflow/xyflow/discussions/4975)
23. [elkjs README](https://github.com/kieler/elkjs/blob/master/README.md)
24. [elkjs Issue #141 — Can't bundle for worker](https://github.com/kieler/elkjs/issues/141)
25. [elkjs Issue #272 — Vite `_Worker is not a constructor`](https://github.com/kieler/elkjs/issues/272)
26. [eclipse-glsp Discussion #1345 — latest elkjs integration](https://github.com/eclipse-glsp/glsp/discussions/1345)
27. [Vite Pre-Bundling docs](https://vite.dev/guide/dep-pre-bundling)
28. [Vite Worker docs](https://vite.dev/guide/features)
29. [vite-plugin-cjs-interop](https://www.npmjs.com/package/vite-plugin-cjs-interop)
30. [vitejs/vite#16749 — strict CSP in production](https://github.com/vitejs/vite/issues/16749)
31. [Working with CSP and Vite — Stackademic](https://stackademic.com/blog/working-with-csp-and-vite)
32. [mswjs/msw#1715 — Refused to create a worker](https://github.com/mswjs/msw/discussions/1715)
33. [vite-plugin-content-security-policy](https://github.com/Coreoz/vite-plugin-content-security-policy)
34. [websockets/ws GitHub](https://github.com/websockets/ws)
35. [websocket.org — Reconnection Guide](https://websocket.org/guides/reconnection/)
36. [DEV — Robust WebSocket Reconnection with Exponential Backoff](https://dev.to/hexshift/robust-websocket-reconnection-strategies-in-javascript-with-exponential-backoff-40n1)
37. [robust-websocket](https://github.com/nathanboktae/robust-websocket)
38. [Honeybadger — Setting up a WebSocket server in Node.js](https://www.honeybadger.io/blog/websocket-node/)
39. [Maxim Orlov — Random Port to Node.js Server](https://maximorlov.com/tips/assign-a-random-port-to-nodejs-server/)
40. [w3tutorials — Server's Port Dynamically After Listening](https://www.w3tutorials.net/blog/nodejs-how-to-get-the-server-s-port/)
41. [MDN — Storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
42. [MDN — Browser storage limits](https://devdoc.net/web/developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Browser_storage_limits_and_eviction_criteria.html)
43. [MDN — SubtleCrypto.digest()](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest)
44. [MDN — Non-cryptographic uses of SubtleCrypto](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API/Non-cryptographic_uses_of_subtle_crypto)
45. [WICG — Synchronous WebCrypto discussion](https://discourse.wicg.io/t/synchronous-webcrypto/628/)
46. [MDN — SSRF](https://developer.mozilla.org/en-US/docs/Web/Security/Attacks/SSRF)
47. [MDN — CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS)
48. [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
49. [Chrome — Private Network Access: introducing preflights](https://developer.chrome.com/blog/private-network-access-preflight)
50. [Chrome — Private Network Access deprecation trial update](https://developer.chrome.com/blog/private-network-access-update)
51. [useReactFlow() — React Flow](https://reactflow.dev/api-reference/hooks/use-react-flow)
