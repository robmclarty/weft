# v0 Visual Spec

**Status:** decision document for the v0 re-evaluation
**Companion:** `visual-audit.md` (the baseline this is responding to)

## Decisions

1. **Theme: dark only.** One surface, dark, dev-tool aesthetic. No light mode in v0. Light mode can be added later as a token swap; designing two themes now doubles the design surface for no proven user need.
2. **Styling system: plain CSS with disciplined tokens.** Tailwind was on the table; the v0 handoff already weighed it and chose plain CSS to keep `@repo/core` from imposing utilities on consumers of the published `@robmclarty/weft` umbrella. That trade-off still holds. The fix is *better tokens and better encoding*, not a different tool.
3. **Token namespace unchanged: `--weft-*`.** Keeps interop with React Flow's `--xy-*` and the existing `weft-*` class taxonomy.
4. **Glyphs: small inline SVGs**, one per kind. No icon-library dependency on `@repo/core`. SVGs are colocated with their node component.
5. **Selection: 2px ring in the kind's accent hue + subtle elevation shadow.** Visible at every zoom level.
6. **Initial fit: auto-fit-view on tree load** (already feasible via `fit_view` on the canvas API; just call it from `WeftCanvas` after first layout).

## Token additions (`@repo/core`)

Migrate `packages/core/src/canvas/canvas.css:13-41` from light-theme baseline to dark-theme + per-kind palette:

```css
/* surfaces */
--weft-color-bg: #0f1115;            /* canvas body, matches studio shell */
--weft-color-surface: #161a22;       /* nodes default */
--weft-color-surface-raised: #1f242e;/* selected / hovered */
--weft-color-fg: #e6e8ee;
--weft-color-fg-muted: #8a92a3;
--weft-color-border: #2a3040;
--weft-color-grid: #1c212b;          /* dot grid */

/* per-kind hue families: bg / border / accent-fg */
--weft-step-bg:        #161a22;
--weft-step-border:    #3a4458;
--weft-step-accent:    #c0c8d8;

--weft-sequence-bg:        #1a1830;
--weft-sequence-border:    #5b4dbf;
--weft-sequence-accent:    #b6acff;

--weft-parallel-bg:        #0f2421;
--weft-parallel-border:    #1f7a6e;
--weft-parallel-accent:    #79e0c9;

--weft-pipe-bg:        #102134;
--weft-pipe-border:    #2c5fa8;
--weft-pipe-accent:    #88baff;

--weft-retry-bg:       #2a1f10;
--weft-retry-border:   #a26a1c;
--weft-retry-accent:   #ffce7a;

--weft-scope-bg:       #0f2618;
--weft-scope-border:   #2f8a52;
--weft-scope-accent:   #79e09a;

--weft-stash-bg:       #14241a;
--weft-stash-border:   #4ca271;
--weft-stash-accent:   #a4e9be;

--weft-use-bg:         #14241a;
--weft-use-border:     #357c52;
--weft-use-accent:     #8cc8a8;

--weft-cycle-bg:       #2a1015;
--weft-cycle-border:   #c8334a;
--weft-cycle-accent:   #ff9aa6;

--weft-generic-bg:     #2a200d;
--weft-generic-border: #c89033;
--weft-generic-accent: #ffd17a;

/* edges */
--weft-edge-default:   #4a5267;
--weft-edge-overlay:   #6e8c70;       /* scope overlay (greenish to match scope family) */
--weft-edge-label-bg:  #1f242e;
```

## Per-kind visual encoding

| kind | shape | hue | glyph (badge) | content lines |
|---|---|---|---|---|
| `step` | solid rounded rect | step (neutral) | dot/triangle | id, then `<fn:name>` mono |
| `sequence` | dashed container, header band | sequence (violet) | ordered list | id, count badge "n steps" |
| `parallel` | dashed container, header band | parallel (teal) | fan-out | id, "× N branches", branches list as edge labels |
| `pipe` | dashed container, header band | pipe (blue) | arrow→dot | id, "pipe → fn:name" |
| `retry` | dashed container, header band | retry (amber) | circular arrow | id, "N attempts · 250ms" (readable) |
| `scope` | dashed container, header band | scope (emerald) | brace `{}` | id, summary "K stashes / U uses" |
| `stash` | solid leaf | stash (emerald-light) | arrow-into-key | id, "key: <name>" |
| `use` | solid leaf | use (emerald-dim) | arrow-from-key | id, "reads: <names>" |
| `cycle` | solid leaf, larger | cycle (rose) | warning loop | id, "→ <target>" |
| `generic` | solid leaf or container | generic (amber) | warning triangle | id, kind name visibly displayed |

Container header band: `position: relative` with the title placed in a top header band that has its own padding, and the children area pushed down via `padding-top` on the container body. Eliminates the absolute-positioning overlap from `canvas.css:159-164`.

## Edge styling

- Default structural edge: 1.5px stroke `--weft-edge-default`, arrowhead.
- Parallel branch labels: render with `--weft-edge-label-bg` background pill, mono 11px, `--weft-parallel-accent` text.
- Stash→use overlay: dashed 1.5px `--weft-edge-overlay`; label rendered with same pill style but in `--weft-scope-accent`.
- Selected edge: brightened by 10–15% lightness.

## Studio shell

- Empty state (`/`): canvas region renders a centered card with one prominent affordance (drop file or paste JSON) and a secondary collapsed URL input below. Inspector panel hidden until tree loads. Loader panel collapses to a small "load another" link in the header once a tree is loaded.
- Errors: three categories, three accent colors:
  - validation (red) — JSON parse / schema
  - fetch (amber) — URL fetch / Private Network blocks
  - connection (orange-red) — websocket disconnect
- Banner layer: positioned absolutely at the top of the canvas region, above React Flow content. Cleared on user dismiss or state change.
- Header: shortcuts hint visible (e.g. small `?` chip on the right of the search box) so the modal is discoverable.
- Search box: filters visible nodes by id substring or kind match; non-matching nodes get reduced opacity; Enter calls `fit_view` on the matched set.

## Watch route

- Add `LoaderPanel` as `side_top` so input modes compose. The user can switch from watch to paste without navigating away.
- Disconnect banner uses the connection (orange-red) error styling.
- After the 12-attempt cap, banner upgrades to a prominent "manual reconnect" button.

## Inspector

Kind-aware view per primitive (raw JSON kept as a `<details>` "show raw" fallback always):

- **step**: id, function reference (mono, prominent), parent kind+id (back-link).
- **sequence**: id, ordered child list with click-to-focus.
- **parallel**: id, named branches list (key → child id), click-to-focus per branch.
- **pipe**: id, tail function, wrapped child id+kind link.
- **retry**: id, "N attempts" line, "Backoff: Nms" line, wrapped child id+kind link.
- **scope**: id, two tables — stashes (key → step id) and uses (id → keys), click-to-focus.
- **stash**: id, key, parent scope link.
- **use**: id, keys, parent scope link.
- **cycle**: id, target id (click-to-focus).
- **generic / unknown**: kind name, id, full config dump (the spec-mandated fallback path).

## Out of scope (deferred)

- Light mode (no proven need; defer to a later token swap).
- Custom designed icon set (use small inline SVG glyphs; bring in lucide-react or similar only if v1 needs it).
- Animation polish (focus on legibility first).
- Dense vs. comfortable density toggle.
- Custom edge routers (rely on ELK + React Flow defaults; revisit if visual clutter persists after Step 3.4).
