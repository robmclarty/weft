# weft

UI for [Fascicle](https://github.com/robmclarty/fascicle). A React Flow-based visualizer for fascicle composition trees.

The repo is a TypeScript/Node pnpm workspace with an agent-friendly `check` pipeline wired up.

## Layout

```text
├── packages/
│   ├── core/                 @repo/core — implementation
│   ├── weft/                 @repo/weft — published as @robmclarty/weft (umbrella, re-exports only)
│   ├── studio/               @repo/studio — Vite SPA (unpublished)
│   └── watch/                @repo/watch — published as @robmclarty/weft-watch (Node CLI)
├── fixtures/                 sample flow_tree JSON files for tests + manual use
├── rules/                    ast-grep structural rules
├── scripts/                  check.mjs and check-invariants.mjs
├── pnpm-workspace.yaml
├── tsconfig.json
├── fallow.toml  vitest.config.ts  stryker.config.mjs  cspell.json  sgconfig.yml
├── AGENTS.md  CLAUDE.md
└── package.json              all devDependencies live here
```

The package directories implement the v0 build (see `.ridgeline/builds/v0/spec.md`). The build is split into 5 phases under `.ridgeline/builds/v0/phases/`; **all five phases are complete**: workspace + check pipeline foundation, the pure data layer, layout + canvas + library umbrella, the standalone watch CLI, and the studio + integration hardening.

Runtime deps live in the package that imports them. DevDeps live at the root. Cross-package imports use workspace names (`@repo/other`), not relative paths.

## Quick start

```bash
pnpm install
pnpm check
```

Run the studio locally:

```bash
pnpm --filter @repo/studio dev      # http://127.0.0.1:5173
```

## The hacking loop

Write a fascicle test that emits the composition tree as JSON, point `weft-watch` at the file, and iterate:

```ts
// in your fascicle test
import { describe } from '@robmclarty/fascicle';
import { writeFileSync } from 'node:fs';
writeFileSync('/tmp/flow.json', JSON.stringify(describe.json(my_flow), null, 2));
```

```bash
pnpm --filter @repo/studio dev &
pnpm exec weft-watch /tmp/flow.json --no-open    # binds 127.0.0.1:<port>
# then open http://127.0.0.1:5173/watch?ws=<port> in your browser
```

The studio re-renders within ~500 ms of every save. If the file goes away, the canvas keeps the last known tree and surfaces a banner; the WebSocket client reconnects with exponential backoff after a CLI restart (research F10).

## Known limitations (v0)

- **Safari PNG export** — `html-to-image`'s `<foreignObject>` path is degraded on Safari. PNGs from `canvas_api.export_png()` may render with worse fidelity than Chrome / Firefox. Tracked in spec §8 F11.
- **localStorage on Safari** — Safari purges script-written storage after 7 days of no user interaction, which can drop saved viewport state. The studio re-creates state from defaults; no data loss. Tracked in spec §3.
- **Chrome 130+ Private Network Access** — when the hosted demo at `https://...` tries to fetch `http://localhost:N`, Chrome 130+ blocks the request unless the local target sends `Access-Control-Allow-Private-Network: true`. Use the watch CLI for local fascicle output instead. Tracked in spec §4.2 / §8 F9.
- **Workspace symlink hot-reload** — Vite + pnpm symlinks resolve correctly across `@repo/weft` → `@repo/core`. After running `pnpm add` at the root, run a follow-up `pnpm install` if `node_modules/@repo/*` symlinks look stale.

## Visual testing

See [docs/visual-testing.md](./docs/visual-testing.md) for the Playwright (deterministic e2e), `@vitest/browser` (component-level), and `agent-browser` (exploratory loop) split.

## The check

`pnpm check` is the single source of truth for "is this done?". It runs:

| Check    | Tool                             | Catches                                             |
| -------- | -------------------------------- | --------------------------------------------------- |
| `types`  | `tsc`                            | Type errors                                         |
| `lint`   | `oxlint` + `oxlint-tsgolint`     | Syntax, floating promises, unsafe any, type-aware   |
| `struct` | `ast-grep`                       | Structural rules in `rules/`                        |
| `dead`   | `fallow`                         | Unused code, circular deps, duplication, boundaries |
| `invariants` | `scripts/check-invariants.mjs` | Architectural invariants (constraints §7) + unsafe-eval guard |
| `test`   | `vitest` + `@vitest/coverage-v8` | Test failures and coverage floors                   |
| `docs`   | `markdownlint-cli2`              | Broken markdown                                     |
| `spell`  | `cspell`                         | Misspellings                                        |

On-demand:

- `pnpm check --include e2e` — full pipeline plus the Playwright e2e suite (boots the studio via `vite preview`)
- `pnpm check:mutation` — Stryker mutation testing
- `pnpm check:security` — `pnpm audit`
- `pnpm check:fix` — auto-fix oxlint and fallow where possible

Output lands in `.check/`: `summary.json` (aggregate), `<name>.json` (per tool), `coverage/` (vitest).

Flags: `--json`, `--bail`, `--only <list>`, `--skip <list>`.

## Extending

**Add a package.** Create the two files, then `pnpm install && pnpm check`:

```jsonc
// packages/<name>/package.json
{
  "name": "@repo/<name>",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" }
}
```

```ts
// packages/<name>/src/index.ts
export {};
```

Root configs already glob `packages/*/src/**`.

**Add a check.** Append to `CHECKS` in `scripts/check.mjs`.

**Add a structural rule.** Drop a YAML file in `rules/`. ast-grep picks it up.

**Add a boundary.** Edit `fallow.toml`.

## Cutting a release

Every package version moves in lockstep with the root `package.json`. The `/version` Claude Code skill (see `.claude/skills/version/`) drives the release:

```text
/version patch            # 0.1.0 → 0.1.1, updates CHANGELOG.md, commits vX.Y.Z, tags
/version minor            # 0.1.0 → 0.2.0
/version major            # 0.1.0 → 1.0.0
/version patch --repair-skew   # force-align workspace to the root's current version (no bump)
```

The backend (`scripts/bump-version.mjs` + `scripts/lib/lockstep.mjs`) auto-discovers the lockstep set: root `package.json`, every `packages/*/package.json`, and every `packages/*/src/version.ts` that declares `export const version = '<SEMVER>';`. Packages opt into the `version.ts` half by creating the file — no edits to the scripts required as you add packages.

## Working across packages

```bash
pnpm --filter @repo/core test                   # one package's tests
pnpm --filter @repo/core add zod                # runtime dep to one package
pnpm add -w -D typescript@latest                # root devDep
pnpm --filter @repo/weft add @repo/core --workspace
```

## Hosted-demo CSP

When deploying `@repo/studio`'s `dist/` output behind a CSP, ship the following header (per spec §12). The dev server stays CSP-free.

```text
script-src 'self';
worker-src 'self' blob:;
connect-src 'self' ws://localhost:* wss:;
img-src 'self' data: blob:;
style-src 'self';
```

Notes:

- `worker-src 'self' blob:` accommodates Vite's module-worker output (sometimes uses blob URLs).
- `connect-src ws://localhost:*` is required for the watch-mode WebSocket; subject to the Chrome Private Network Access caveat above.
- No `unsafe-eval` — required only by `elk.bundled.js`, but the spec mandates `elk-api` + `workerFactory`, so the bundled build is never present. CI verifies via the `invariants` check (see `scripts/check-invariants.mjs`).

## Fallow MCP

`.mcp.json` exposes fallow to Claude Code, Cursor, and Windsurf as a structured tool. Confirm with `claude mcp list`.

## License

[Apache 2.0](./LICENSE).
