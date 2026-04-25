# weft — Constraints

**Document:** `.ridgeline/constraints.md` (project-wide, authoritative)
**Sibling documents:** `taste.md` (design philosophy), `design.md` (architectural sketches), per-build `spec.md` under `.ridgeline/builds/<build>/`
**Status:** implementation-ready
**Upstream:** weft consumes `@robmclarty/fascicle`'s public surface (composition trees, trajectory events). Fascicle's own conventions are the upstream contract; weft inherits its language and style rules verbatim except where called out.

---

## What a constraint is

A constraint is a non-negotiable: if it changes, the entire design needs revisiting. Constraints are the load-bearing walls. They are not API aesthetics (that belongs in `taste.md`), and they are not interface definitions or visual choices (that belongs in each build's `spec.md`).

This document deliberately constrains only what is *known across builds*. Where the v0/v1/v2 specs leave room — exact visual encoding, inspector layout, specific React Flow patterns, choice of UI primitive libraries — this document is silent. Builds may decide.

On conflicts with per-build `spec.md`: this file wins.

---

## Check Command

```bash
pnpm check
```

The single source of truth for "done". Defined in `scripts/check.mjs`. A phase is done when `pnpm check` exits 0; no other signal counts. See `AGENTS.md` for the per-tool breakdown.

---

## §1 — Language and Runtime

- **TypeScript:** 5.x with `strict: true`. No looser settings, including in tests. No `any` on public surface. No `!` non-null assertions without a justification comment.
- **Module format:** ESM only. Source `.ts` / `.tsx`, output `.js` + `.d.ts`.
- **Compile target:** ES2022 minimum. Library output runs on modern browsers (latest two majors of Chrome, Firefox, Safari) and Node ≥ 20.
- **tsconfig basics:** `module: "NodeNext"`, `moduleResolution: "NodeNext"`, `verbatimModuleSyntax: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`.
- **Import specifiers:** relative imports use the `.js` extension even from `.ts` / `.tsx` source. Cross-package imports go through workspace names (`@repo/core`, `@repo/weft`, etc.), never relative paths.

---

## §2 — Code Style (Hard Rules)

Enforced mechanically (ast-grep / oxlint / fallow). Review alone is not sufficient.

- **No `class`.** No `extends`. No `this`. Factory functions return plain objects; React components are function components. Enforced by `rules/no-class.yml`.
  - **No permitted exception in weft today.** Promote to a single `errors.ts` per package (`class <name> extends Error`) only if a build introduces typed errors that need `instanceof` branching, and update the rule's `ignores:` accordingly.
- **Functional and procedural.** Side effects live at edges (file I/O, WebSocket, DOM, layout worker postMessage). No inheritance.
- **Named exports only.** No `export default`. Enforced by `rules/no-default-export.yml`.
- **Naming:**
  - variables, functions, parameters, hooks, non-component files → `snake_case`
  - type aliases and interfaces → `PascalCase`
  - React components, custom-hook component-style symbols, and React Flow node-type keys → `PascalCase`
  - module-level constants → `SCREAMING_SNAKE_CASE`
  - **no camelCase** anywhere in source, including parameter names on public types
- **File naming:**
  - `snake_case.ts` for non-component source
  - `PascalCase.tsx` for files whose primary export is a React component
  - `*.test.ts` / `*.test.tsx` colocated with the file under test
- **No ambient module-level mutable state.** No singleton registries, no module-level `let` that accumulates across calls. Canvas state lives in component state or per-tree localStorage entries; never module-global.
- **No `process.env` reads in any package source.** CLI flags and URL params are the configuration surface. The watch CLI parses `process.argv` in its `bin.ts`; nothing else reads env.
- **No global CSS** beyond a single base/tokens entry point. Component styles are colocated.
- **Limit em dashes** in code comments, docstrings, and user-facing strings. Prefer commas, colons, or separate sentences.

---

## §3 — Architectural Boundaries

Strict downward dependency direction:

```text
Application code (published consumers; none in this repo)
      ↓
@repo/studio   (Vite SPA, unpublished)
      ↓
@repo/weft     (= @robmclarty/weft — published umbrella; re-exports only)
      ↓
@repo/core     (workspace-only; React components, transforms, layout, schemas)
      ↓
react, react-dom, @xyflow/react, elkjs, zod, @robmclarty/fascicle (types only)

@repo/watch    (= @robmclarty/weft-watch — published CLI; depends on no React surface)
```

No layer may import from a layer above it.

### Library import rules (`@repo/core`)

**May import:** `react`, `react-dom`, `@xyflow/react`, `elkjs`, `zod`; `@robmclarty/fascicle` via `import type` only; sibling files within `packages/core/src/`.

**May NOT import:** `@repo/studio`, `@repo/watch`, application-level modules, `process.env`, value imports from `@robmclarty/fascicle`.

### Umbrella import rules (`@repo/weft`)

**May import:** `@repo/core` (workspace).

**Must NOT contain implementation logic.** `packages/weft/src/` is re-exports of the curated public surface of `@repo/core` and nothing else. Refactors inside `@repo/core` are free as long as the umbrella's exported names and shapes hold.

### Studio import rules (`@repo/studio`)

**May import:** `@repo/weft` (the published umbrella, *not* `@repo/core` directly — studio dogfoods the public surface); React; routing, styling, and UI primitive libraries; sibling files within `packages/studio/src/`.

**May NOT import:** `@repo/core` directly, `@repo/watch`.

### Watch CLI import rules (`@repo/watch`)

**May import:** Node built-ins via `node:` prefix; file watching, WebSocket, and CLI argument libraries (specific picks per build); `zod` for input validation.

**May NOT import:** `@repo/core`, `@repo/weft`, `@repo/studio`, `react`, `react-dom`, `@xyflow/react`. The CLI ships without the React peer surface — that is the point of separating it.

### Node-type components do not import other node-type components

Each component in `packages/core/src/nodes/` (or wherever node components live) depends only on React, `@xyflow/react`, and shared helpers. `StepNode` does not import `SequenceNode`. Sharing happens through the React Flow node-data contract. Promote to mechanical enforcement only if a regression appears.

### Dispatch-on-kind, never branch-on-kind

The node-type registry (the React Flow `nodeTypes` map) is the single dispatch table mapping `kind` → component. No component contains kind-specific branching for *other* kinds. Unknown kinds fall through to a generic component, never to a crash.

---

## §4 — Runtime Dependencies

Locked **stack-shaping** dependencies — picks that affect the entire architecture and would be expensive to swap. Dependencies whose purpose is replaceable (UI primitive library, routing library, CLI argument parser) are not listed here; each build's `spec.md` may pick or revise.

### `@repo/core`

| Package | Purpose |
|---|---|
| `react`, `react-dom` (peer ≥ 18) | UI framework |
| `@xyflow/react` | Canvas and graph rendering |
| `elkjs` | Auto-layout |
| `zod` | `FlowNode` schema validation |
| `@robmclarty/fascicle` (peer, types only) | Shared `FlowNode` / `FlowValue` / `TrajectoryEvent` shapes |

### `@repo/watch`

A Node CLI that watches a file and pushes changes over a local WebSocket. Specific libraries (file watcher, WebSocket server, argv parser) are a build decision.

### Forbidden across all packages

- HTTP client libraries (no remote calls in v0; the watch CLI uses local WebSocket only)
- logging libraries (use `console` at the watch CLI; the studio surfaces errors via UI)
- ORM / DB packages
- CSS-in-JS runtimes (a single styling system is chosen per build; component-style runtimes that ship JS for styling are off the table)
- Telemetry / analytics SDKs (see §5.6)
- `node-pty` and shell-interpreted argv (carry-over from fascicle's subprocess discipline; relevant if/when watch grows transports)

---

## §5 — Operational Non-Negotiables

These are correctness requirements. "Try to" and "best effort" do not apply.

### §5.1 Layout never blocks the canvas

Auto-layout runs in a Web Worker. The main thread builds the graph, posts it, and applies positioned nodes back as a single state update. If `Worker` is unavailable in the host environment, layout falls back to the main thread with a console warning; it never crashes the canvas.

Layout requests are debounced. Latest request wins.

### §5.2 Unknown kinds render, never crash

The graph transform and the node-type registry tolerate any `kind` string. Unknown kinds render as a generic component with a visible "unknown kind" affordance (badge, color, or label — visual choice deferred to the build). Children still render. This is the load-bearing rule for forward compatibility with future fascicle composers.

### §5.3 Validation is at the system boundary

Incoming `FlowNode` JSON is validated by Zod at exactly two points: the studio's loader and the watch CLI's read. Internal modules trust the validated shape. Validation failures show the offending JSON path and do not replace the previous canvas.

### §5.4 Canvas state is per-tree, never ambient

The studio persists canvas UI state (zoom, viewport, selection, collapse) keyed by a hash of the serialized tree. Two tabs viewing different trees do not share state. Module-global canvas state is forbidden.

### §5.5 Watch CLI binds to localhost

The watch CLI's WebSocket server binds to `127.0.0.1`. No remote watch in v0 or v1. v2 may revisit only with an explicit auth story.

### §5.6 No telemetry

Weft sends nothing over the network beyond the local watch WebSocket. No analytics, no error reporting beacon, no remote feature-flag fetch.

### §5.7 No mutation of caller inputs

`flow_tree`, `FlowNode`, and any options objects passed into the public API are treated as immutable inputs. The library may copy internally but must not mutate caller state.

---

## §6 — Project-Wide Scope Fence

Sibling builds (`v0`, `v1`, `v2`, future) own their feature scope individually. The project-wide fence covers what *no build* will ship without revisiting these constraints:

- **Server-side persistent storage, multi-user, auth.** Studio is a local viewer (or a static hosted demo). Server state is out.
- **Mobile / touch-first UI.** Desktop browsers only.
- **Cloud deployment of the watch CLI.** Localhost only.
- **In-canvas function-body editing.** Weft is not a code editor (carry-over from `weft-v2` non-goals).
- **Telemetry.** Hard rule, no exceptions.

A feature beyond this fence requires a new build directory, a constraints update, and explicit sign-off — not a quiet addition.

---

## §7 — Architectural Invariants (Mechanically Checkable)

CI must verify each of these. A failing check fails the build.

1. **No `class` keyword in `packages/*/src/`.** Enforced by `rules/no-class.yml`. (Permitted-exception scope updated when typed errors are introduced.)
2. **No `export default` in `packages/*/src/`.** Enforced by `rules/no-default-export.yml`.
3. **No `process.env` reads in `packages/*/src/`.** Recognized obligation; rule lands in the first build that needs it.
4. **snake_case for exported value symbols and public parameter names; PascalCase for type aliases, interfaces, and React components.** Recognized obligation; rule lands in the first build that needs it.
5. **`@repo/weft/src/` contains only re-exports.** No function bodies, no JSX, no non-trivial expressions. Recognized obligation.
6. **`@repo/core/src/` has no value imports from `@robmclarty/fascicle`.** Only `import type`. Recognized obligation.
7. **`@repo/watch/src/` does not import `react`, `react-dom`, `@xyflow/react`, or `elkjs`.** Recognized obligation.
8. **`@repo/studio/src/` does not import `@repo/core` directly.** Imports go through `@repo/weft`. Recognized obligation.

Rules marked **recognized obligation** are not yet wired in CI. Each build that introduces or modifies the regulated surface ships the rule.

---

## §8 — Distribution and Versioning

### Packages

| Package | Directory | Published as | Purpose |
|---|---|---|---|
| `@repo/core` | `packages/core/` | (unpublished) | implementation |
| `@repo/weft` | `packages/weft/` | `@robmclarty/weft` | umbrella library; re-exports the curated public surface of `@repo/core` |
| `@repo/studio` | `packages/studio/` | (unpublished) | Vite SPA; runs locally or as a static hosted demo |
| `@repo/watch` | `packages/watch/` | `@robmclarty/weft-watch` | Node CLI; tails a file and pushes changes over a local WebSocket |

- **License:** Apache 2.0.
- **Build:** ESM `.js` + `.d.ts` per published package. Source maps included. No minification of library output.

### Lockstep versioning

Every workspace package ships at the same version, bumped via the `/version` skill (see `AGENTS.md`). One number, one tag, one release note. Adopt independent semver only when one layer churns meaningfully faster than another.

### Semver hooks (project-wide; per-package specifics live with the build)

- removing or renaming any export from `@robmclarty/weft` → **major**
- adding a new export to `@robmclarty/weft` → **minor**
- changing the watch CLI's WebSocket message shape → **major** on `@robmclarty/weft-watch`
- internal refactors with no public surface change → **patch**

---

## §9 — Testing Requirements

- **Runner:** `vitest`. Consistent across every package.
- **Test location:** colocated (`foo.ts` alongside `foo.test.ts`). Cross-cutting harnesses live under `packages/<name>/test/`.
- **Coverage floor:** 70% lines / functions / branches / statements. Raise as the codebase matures.
- **No real network in default CI.** Watch CLI tests use a localhost socket; no fetches to the public internet.
- **Architectural invariants (§7) run as a pre-test CI step.** If any invariant fails, the test suite does not run.

Per-build coverage requirements (which kinds, which failure modes, end-to-end flows) live in each `spec.md`'s success criteria.

---

## §10 — What This Document Does Not Cover

- Exact `WeftCanvas` props, `canvas_api` shape, or `WeftNodeData` fields → `.ridgeline/builds/v0/spec.md` §4.
- Specific visual encoding per kind (handles, badges, colors, layout direction defaults) → build `spec.md`.
- Inspector panel layout, keyboard shortcut set → build `spec.md`.
- Choice of styling system, routing library, UI primitive library, CLI argument parser, file-watcher, WebSocket library → build `spec.md`.
- v1 trajectory event shapes, span-to-node mapping → `.ridgeline/builds/v1/spec.md`.
- v2 DSL serialization format, edit commands, diff semantics → `.ridgeline/builds/v2/spec.md`.
- Code formatting (indentation, semicolons, line length) → `taste.md`.
- Rationale for the package layout, umbrella seam, sibling-builds split → `taste.md`.
- The visualizable shape of the architecture (diagram, file tree, data flow) → `design.md`.
