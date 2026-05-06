# weft — Design System

The visual language for the canvas, the studio chrome, and any future v2 (`/diff`, `/edit`) routes. Used by builders to make per-component visual decisions and by the visual reviewer to score rendered output. **Hard tokens** below use imperative language ("must", "always", required exact values); **soft guidance** uses directional language ("prefer", "lean toward").

The shipped palette is a **subway map on cream paper**: an ink-on-paper base with six saturated kind-family hues, thick non-scaling orthogonal edges, and mono-uppercase typography. New visual surface in v2 must extend this palette, not replace it.

Single source of truth for live tokens: `packages/core/src/canvas/canvas.css` (`:root` block) and `packages/studio/src/index.css` (`:root` block). Token namespace is `--weft-*`. Adding a new token here implies adding the matching CSS variable in those files.

---

## Colors

### Paper ground (must use)

```text
--weft-color-bg            #f4ecdd   page / canvas behind everything
--weft-color-paper         #fbf6ea   panels, edge labels, paper-on-saturated reads
--weft-color-surface       #fbf6ea   default node surface
--weft-color-surface-raised #fff8e8  raised surface (panels, controls hover)
--weft-color-fg            #1a1611   ink text
--weft-color-fg-muted      #6b5f4d   secondary text, captions
--weft-color-fg-faint      #a89c84   hint text, disabled
--weft-color-border        #1a1611   ink rule, default border
--weft-color-grid          #e6dcc8   canvas dot pattern
```

Background variants form a three-step warm-paper ramp (`#f4ecdd → #fbf6ea → #fff8e8`). Use `--weft-color-bg` for the canvas; `--weft-color-paper` for panels and edge-label fills; `--weft-color-surface-raised` for hover lift on controls.

### Family hues (must use for kind identity)

Six saturated hues plus structural ink. Each maps to a kind family; never invent a new hue without adding a token.

| Token | Hex | Family / kinds |
| --- | --- | --- |
| `--weft-hue-ink` | `#1a1611` | `step`, `suspend` (the work atoms) |
| `--weft-hue-orange` | `#f25f1f` | `branch`, `fallback` (binary divergence); also `then`/`otherwise`/`primary`/`backup` edge role tagging |
| `--weft-hue-teal` | `#1f9b8e` | `parallel`, `map` (fan-out / cardinality) |
| `--weft-hue-yellow` | `#f4c20d` | `retry`, `timeout`, `generic` (timing + warning) |
| `--weft-hue-blue` | `#3868d9` | `pipe`, `checkpoint`, `compose` (transform / save-point / sub-program) |
| `--weft-hue-magenta` | `#d6347f` | `loop`, `cycle` (recursion) |
| `--weft-hue-green` | `#46a248` | `stash`, `use`, scope overlay edges (named state) |

Per-kind tokens map family hues to three slots: `--weft-{kind}-fill` (block color), `--weft-{kind}-on` (readable foreground on top of `fill`), `--weft-{kind}-accent` (saturated stroke for borders, edge tinting, badges). `on` flips between `--weft-color-paper` (on dark/saturated hues) and `--weft-hue-ink` (on yellow).

### Runtime overlay (must use; v1)

Layered additively on top of per-kind colors. Never replace per-kind hue with these.

```text
--weft-runtime-active   #f4c20d   yellow pulse (active span)
--weft-runtime-error    #d6347f   magenta scar (errored span)
--weft-runtime-emit     #3868d9   blue flash (emit event)
--weft-runtime-cost     #6b5f4d   muted ink (cost chip text)
```

### Studio chrome (must use; banners + status)

Studio-only; not used inside the canvas.

```text
--weft-validation       #3868d9   info / parse-error banner: blue
--weft-fetch-warn       #f4c20d   network warning banner: yellow
--weft-connection       #d6347f   disconnect / fatal banner: magenta
--weft-success          #46a248   success state
--weft-accent           #3868d9   default link / accent
```

### v2 additions (hard tokens — to be added in `[v2.0]`)

Diff halos extend the palette without inventing new hues. Each maps to an existing family hue with a halo treatment:

```text
--weft-diff-added       green halo  (uses --weft-hue-green, 4px outer ring)
--weft-diff-removed     red halo    (uses --weft-hue-magenta, 4px outer ring + 50% node opacity)
--weft-diff-changed     amber halo  (uses --weft-hue-orange, 4px outer ring)
--weft-diff-meta        amber halo  (same as --weft-diff-changed but dotted)
--weft-diff-wrappers    amber halo + secondary ring  (--weft-hue-orange outer + --weft-hue-yellow inner)
```

Lock exact values during the v2.0 phase-2 design pass with `pnpm metrics:vision` in the loop.

---

## Typography

### Type families (required)

```text
--weft-font-stack   ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif
--weft-font-mono    ui-monospace, SFMono-Regular, Menlo, Consolas, monospace
```

Use system fonts only. **No `@font-face` from external origins** (research F7, enforced by `constraints.md` §5). Mono is the dominant face on the canvas — every label, badge, edge text, and id reads as monospace. Sans is reserved for studio chrome (panels, modals, body copy).

### Scale

| Use | Size | Weight | Tracking | Transform |
| --- | --- | --- | --- | --- |
| Container title | 11px | 700 | `0.04em` | uppercase |
| Leaf title (step / stash / use / cycle) | 11px | 700 | `0.02em` | uppercase |
| Step subtitle (`<fn:name>`) | 10px | 400 | `0.02em` | uppercase |
| Edge label (structural / role / wrapper) | 10–11px | 700 | `0.06em` | uppercase |
| Wrapper badge | 9px | 700 | `0.04em` | uppercase |
| Inspector pill / kind tag | 10px | 700 | `0.06em` | uppercase |
| END terminator | 11px | 700 | `0.12em` | uppercase |
| Studio body (panels) | 13px | 400 | normal | mixed case |
| Studio caption | 12px | 400 | normal | mixed case |

**Always use mono on the canvas.** Sans is only for studio chrome.

### Tracking and case rules (must use)

- All canvas text — node titles, subtitles, edge labels, badges, terminators — is **uppercase** with monospace tracking ≥ `0.02em`.
- Studio chrome (loader panel, inspector body, banners) is mixed case in the sans family.
- Never lower-case canvas text. Never use sans inside the canvas.

---

## Spacing

### Base unit (must use)

`4px`. All spacing values must be a multiple of 4. Common values: `4`, `6`, `8`, `10`, `12`, `14`, `24`.

### Node padding

```text
--weft-pad-x   14px   horizontal node padding
--weft-pad-y   10px   vertical node padding
```

### Container layout

```text
--weft-container-min-width    280px
--weft-container-min-height   120px
--weft-container-header-h      36px   corner-tab band height
```

Containers reserve `--weft-container-header-h + 8px` of top padding so ELK-laid children never overlap the title tab. ELK's per-container `padding` in `elk_runner.ts` matches.

### Layout engine spacing (ELK defaults — must use)

```text
node_spacing   120px   between siblings within a row/column
rank_spacing   200px   between ranks (LR direction: between columns)
direction      LR      left-to-right; never change without revisiting the studio chrome
fit_padding    0.06    around the bounding box on auto-fit
fit_min_zoom   0.1     allows very large graphs to fit
fit_max_zoom   1.0     stops single-node fixtures from ballooning
```

Always set both `node_spacing` and `rank_spacing` per-container — ELK does not propagate root-level spacing into nested subgraphs (see `learnings.md`).

### Studio shell

```text
panel margin     8px   default gap between panels
panel padding    12px  inner padding on panel cards
banner inset     8px   inset from canvas edge
```

---

## Component shapes

### Leaf (work / value-bearing)

```text
--weft-leaf-width                   220px
--weft-leaf-height                   60px
--weft-leaf-height-with-wrappers     88px   when wrapper badges are present
border                              1.5px solid --weft-color-border
border-radius                       --weft-radius (4px)
shape                               rectangle
```

Per-kind variants:

- **`step`** — ink fill, paper text. The black work pill that the chain runs through.
- **`stash`** — green fill; `border-radius: 999px` on the **left** edge (left half rounded). Reads as "key in".
- **`use`** — green fill; `border-radius: 999px` on the **right** edge. Reads as "key out".
- **`cycle`** — magenta fill, `168×56` (narrower); the gray-pill variant uses `--weft-cycle-fill`. Carries `↺ → <target_id>` glyph.
- **`generic`** — yellow fill, ink text, orange accent. Always shows an amber warning badge.
- **`suspend`** — ink fill, paper text, teal `‖ SUSPEND` badge.

### Junction

```text
size              56×56 (axis-aligned bounding box; SVG diamond inside)
border             0
background         transparent at the box; SVG path supplies the diamond fill
glyph              18×18 centered
handle dots        hidden (must use `.weft-node.weft-node-junction .react-flow__handle { opacity: 0 }`)
```

Three families all use the diamond:

- **`branch`**, **`fallback`** — orange fill. Two outgoing edges, role-tagged (`then` / `otherwise` solid+dashed, `primary` / `backup` solid+dashed).
- **`parallel`** — teal fill. N outgoing edges, port-keyed by `config.keys[i]`, ELK `FIXED_ORDER` preserves declaration order.

Arrow heads land **at the diamond's vertex**, not at a handle dot offset from it. Required by ELK `FIXED_POS` ports plus the hidden-handle CSS rule.

### Wrapper marker (legacy; reserved)

`44×44` round dot. Currently unused — wrappers became inline corner badges in v0.1.6. Tokens stay in CSS for future use (alternative wrapper kinds, custom kinds).

### Wrapper badge (must use for `pipe`, `timeout`, `checkpoint`, `map`)

Small inline pill on the wrapped step's leaf. Position: a flex row sitting above the bottom border of the leaf; leaf grows to `--weft-leaf-height-with-wrappers` (88px) when present.

```text
font          mono uppercase 9px / 700 / 0.04em
padding       1px 5px 1px 4px
border        1px solid currentColor (kind-tinted)
radius        999px (full pill)
background    paper, mixed 92%/transparent
```

Per-kind tinting:

- `pipe` — `--weft-hue-blue`
- `timeout` — `--weft-hue-yellow` mixed 75% with ink (yellow alone is too light on cream)
- `checkpoint` — `--weft-hue-blue`
- `map` — `--weft-hue-teal`

### Container

Outer container (the only one not nested inside another) renders as a single soft hairline rectangle with a thicker kind-tinted left bar:

```text
border           1.25px solid color-mix(in srgb, --weft-color-fg 35%, transparent)
border-left      3px solid <kind accent>
border-radius    --weft-radius (4px)
header tab       absolute top-left, 36px tall, kind-accent fill, paper-on-hue text
padding          calc(--weft-container-header-h + 8px) 14px 14px
```

Nested containers drop the rectangle entirely and read as section markers — only the colored left bar (`2.5px solid <kind accent>`) plus the corner tab. Avoids the "rectangles within rectangles" stack.

### `compose` container (only kind producing a visible outer box)

```text
expanded       212×114 minimum, header tab labeled `▾ COMPOSE: <name>`
collapsed      220×60 leaf with full kind-blue fill, label `▸ COMPOSE: <name>`
```

Click toggles between the two states. External edges always anchor on the box perimeter, never thread through the inside.

### `loop` container

```text
min-width        280px
min-height       226px
padding          142px 64px 24px   (top padding budgets the back-arc radius)
```

The labeled magenta box hosts body, optional guard, and the back-arc edge. Padding tracks `LOOP_BACK_RADIUS` and `LOOP_*_PADDING` in `elk_runner.ts`; drift here clips the arc against the header.

### `END` terminator

```text
size             96×40
shape            full pill (border-radius 999px)
fill             paper
border           2px solid ink
font             mono 11px / 700 / 0.12em uppercase
glyph            14×14 double-ring icon, 6px gap from "END" text
```

Synthesized by `tree_to_graph` at the tail of any linear chain that does not end in a divergent junction.

---

## Edges

Edges are **first-class subway lines**. Always thick, always non-scaling, always orthogonal.

### Default edge (must use)

```text
--weft-edge-stroke             4.5px
--weft-edge-stroke-selected    6px
stroke                         --weft-color-edge-default (#1a1611, ink)
stroke-linecap                 round
stroke-linejoin                round
vector-effect                  non-scaling-stroke
arrowhead                      ArrowClosed 16×16 ink
type                           weft-orth (renders ELK's computed waypoints)
```

`vector-effect: non-scaling-stroke` is required — at typical fitted zoom (~0.45) a scaling 4.5px stroke renders as ~2px and visually disappears.

### Role-tagged structural edges (branch/fallback)

| Role | Stroke | Style |
| --- | --- | --- |
| `then` | `--weft-hue-orange` | solid |
| `otherwise` | `--weft-hue-orange` | dashed `8 6` |
| `primary` | `--weft-hue-orange` | solid |
| `backup` | `--weft-hue-orange` | dashed `8 6` |

Convention: solid = happy path; dashed = alternate. Same hue family across roles so the divergence reads as one decision in two states.

### Wrapper-decoration edges

| Edge kind | Stroke | Notes |
| --- | --- | --- |
| `self-loop` (retry) | `--weft-hue-yellow` 3.5px | self-arc above the wrapped step |
| `loop-back` (loop) | `--weft-hue-magenta` 3.5px | wraps around the loop container |
| `pipe-fn` | `--weft-hue-blue` | when pipe is rendered as a marker (legacy) |
| `timeout-deadline` | `--weft-hue-yellow` | when timeout is rendered as a marker (legacy) |
| `checkpoint-key` | `--weft-hue-blue` | when checkpoint is rendered as a marker (legacy) |
| `map-cardinality` | `--weft-hue-teal` dasharray `14 4` | "track" reads as multi-item fan |

### Overlay edges (scope's `stash → use`)

```text
stroke              --weft-hue-green (#46a248)
stroke-dasharray    6 6
stroke-width        3px
```

Dashed green rides alongside the structural chain without disrupting it.

### Edge labels (must use)

Labels are **text, not pills**, with a paper text-stroke halo so characters stay legible whatever the underlying line color is:

```text
font            mono 10–11px / 700 / 0.06em uppercase
background      transparent
border          none
padding         0 4px
text-stroke     5px --weft-color-paper, paint-order stroke fill
```

Exception: role-tagged labels (`then` / `otherwise` / `primary` / `backup`) and the loop-back / self-loop labels render as **paper pills** with kind-tinted borders, because they sit on top of the same colored line they describe and need to mask the stroke directly. Self-loop label uses yellow border; loop-back uses magenta; role labels use orange.

Every orthogonal edge label is positioned at the polyline's arc-length midpoint by `WeftOrthogonalEdge`. z-index 3 keeps it above the SVG stroke.

---

## Motion

Motion is reserved for state change, never for decoration. The canvas is read at a glance; animations that draw the eye must mean something.

### Auto-fit (required)

```text
duration       220ms
easing         default (CSS default-cubic)
trigger        once per (tree, collapsed_composes) change after layout commits
retry fan      80ms / 220ms / 480ms (catches React Flow's late measurement passes)
padding        0.06
zoom range     [0.1, 1.0]
```

Subsequent runtime overlays (v1) leave the user's pan/zoom alone — auto-fit must not re-trigger on `runtime_state` changes.

### Runtime overlay (v1 — required when applicable)

```text
active span    weft-runtime-pulse: 1.6s ease-in-out infinite (yellow box-shadow ring fades 0 → 8px)
emit flash     weft-runtime-emit-flash: 600ms ease-out (blue dot scales 0.4 → 1.8 from center, fades)
error scar    no animation — static border + inset shadow
cost chip      no animation — static pill bottom-right
```

Animations are CSS only. No `requestAnimationFrame` loops; no JS-driven tweens.

### Diff halos (v2.0 — required when added)

Static borders only. Diff is structural information; pulsing it would compete with v1's runtime pulse for the same visual register.

### Soft motion guidance

- Prefer instant state transitions; lean toward `<= 220ms` when transitions are unavoidable.
- Avoid scaling animations on canvas chrome (would fight the non-scaling-stroke contract).
- Generally avoid `transform: scale` on nodes — the layout engine owns position; animating it desyncs from edge waypoints.

---

## Iconography

- **All glyphs are inline SVG**, currentColor-tinted, no external icon font (research F7).
- Glyphs live in `packages/core/src/nodes/glyphs.tsx`. Adding a new glyph means adding an export there, never inlining a path elsewhere.
- Sizing: 22×22 for marker dots, 14×14 for END's double-ring, 18×18 for junction center glyphs, 9–11px for badge glyphs.
- **Stroke weight ≥ 1.5px on glyphs** so they read at the canvas's typical zoom range.

---

## Borders, radius, shadows

```text
--weft-radius      4px      default node corner
--weft-radius-sm   2px      panel chrome, controls
node border        1.5px solid --weft-color-border
container border   1.25px hairline + 3px left bar (kind-tinted)
selection ring     box-shadow: 0 0 0 3px --weft-color-fg
panel shadow       box-shadow: 0 4px 12px rgba(26,22,17,0.18)   (controls only)
```

**No drop shadows on canvas nodes.** The paper palette reads as pressed-into-paper, not floating; shadows undermine that.

`vector-effect: non-scaling-stroke` is required on all SVG strokes inside the canvas (edges, junctions, glyphs).

---

## Accessibility

- **WCAG AA on text contrast.** Verified for ink-on-paper, paper-on-ink, paper-on-saturated-hue. Yellow (`#f4c20d`) is the one hue that requires `--weft-{kind}-on: --weft-hue-ink` (dark text on yellow); enforced in canvas.css.
- **Focus rings visible.** The `selected` state uses a 3px ink ring around the node (`box-shadow: 0 0 0 3px var(--weft-color-fg)`). Keyboard navigation through React Flow's selection inherits this.
- **No color-only signaling.** Role-tagged edges use solid vs dashed in addition to hue. Diff halos (v2.0) use distinct outline patterns in addition to hue.
- **`prefers-reduced-motion`.** v1's runtime pulse should be replaced by a static border tint when `@media (prefers-reduced-motion: reduce)` matches. Currently not honored — tracked as a v1.x follow-up.
- **Minimum interactive target.** 44×44 (matches marker dot dimensions). Junctions are 56×56; leaves are 220×60. All hit-targets clear the bar.

---

## Visual checks

- **`pnpm screenshots`** — writes per-scenario PNGs to `.screenshots/<scenario>.png`. Diff against the previous baseline before locking visual changes.
- **`pnpm metrics`** — quantitative: crossings, bends, total edge length, node-edge overlaps. Every visual rework must report a delta.
- **`pnpm metrics:vision`** — Claude vision-LLM rubric scoring screenshots on edge clutter / label readability / container clarity / balance with pixel-cited issues. Run before and after large visual changes.
- **`pnpm metrics:graphviz`** — diagnostic-only Graphviz benchmark for "is this an engine ceiling or a property of the input shape" questions.

A visual change ships when: screenshots diff cleanly, metrics improve or stay neutral, and `metrics:vision` does not regress.

---

## What this document is not

- It is not the architectural shape — that lives in [`docs/architecture.md`](../docs/architecture.md).
- It is not the per-kind topology rules (which kind emits what) — those live in [`docs/primitives.md`](../docs/primitives.md) and [`docs/canvas-redesign-bc-deluxe.md`](../docs/canvas-redesign-bc-deluxe.md).
- It is not the keyboard / interaction layer — those live in [`docs/studio.md`](../docs/studio.md).
- It is not the layout engine internals — those live in [`docs/layout.md`](../docs/layout.md).
- It is not the hard *technical* rules (no class, no default exports, ESM only) — those live in [`constraints.md`](./constraints.md).
- It is not stylistic preferences (named exports, tests colocation) — those live in [`taste.md`](./taste.md).
