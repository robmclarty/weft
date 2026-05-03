#!/usr/bin/env node
/**
 * Quantitative layout-quality metrics for the studio canvas.
 *
 * Drives Playwright through the canonical fixtures and extracts edge/node
 * geometry from the rendered React Flow DOM. Computes four metrics per
 * fixture:
 *
 *   - crossings        edge-segment crossings (canonical aesthetic metric)
 *   - bends            total polyline bends across all edges
 *   - totalEdgeLength  sum of segment Euclidean lengths in graph space
 *   - nodeEdgeOverlaps segments that cross a node bbox they don't terminate on
 *
 * All values are in untransformed graph coordinates (zoom-invariant), pulled
 * from the inline `transform: translate(...)` on `.react-flow__node` and the
 * `d=` on `.react-flow__edge-path`. The viewport zoom/pan applies at a
 * separate SVG group so the path data is the layout itself.
 *
 *   # 1. Boot the studio (in another terminal):
 *   pnpm --filter @repo/studio dev
 *
 *   # 2. Run metrics (in this terminal):
 *   pnpm metrics                       # all fixtures, write .check/layout-metrics.json
 *   pnpm metrics --label baseline      # tag the run in the output
 *
 * Output: .check/layout-metrics.json (gitignored). When the file already
 * exists, the previous values are echoed alongside the new ones for a quick
 * regression read.
 */

import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { compute_metrics } from './lib/layout-geometry.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo_root = join(here, '..');
const out_dir = join(repo_root, '.check');
const out_path = join(out_dir, 'layout-metrics.json');
const screenshots_dir = join(out_dir, 'layout-metrics-screenshots');

const STUDIO_ORIGIN = 'http://127.0.0.1:5173';
const VIEWPORT = { width: 1440, height: 900 };
// Layout settles via debounce + ELK worker. Poll node count instead of using
// a fixed sleep so we cover both small and large fixtures without picking a
// pessimistic ceiling.
const STABILITY_POLL_MS = 300;
const STABILITY_REQUIRED_READS = 3;
const STABILITY_TIMEOUT_MS = 15_000;

const FIXTURE_NAMES = ['simple_sequence', 'all_primitives', 'full_primitive_set'];

function build_fixtures(router) {
  const router_qs = router === null ? '' : `&router=${router}`;
  return FIXTURE_NAMES.map((name) => ({
    name,
    path: `/view?src=${STUDIO_ORIGIN}/fixtures/${name}.json${router_qs}`,
  }));
}

async function wait_for_stable_layout(page) {
  // Layout is "stable" when node count is unchanged for N consecutive polls.
  // Catches "first node renders before ELK lands the rest" and "expansion
  // click triggers a re-layout that hasn't finished yet."
  const deadline = Date.now() + STABILITY_TIMEOUT_MS;
  let last_count = -1;
  let stable_reads = 0;
  while (Date.now() < deadline) {
    await sleep(STABILITY_POLL_MS);
    const count = await page.evaluate(
      () => document.querySelectorAll('.react-flow__node').length,
    );
    if (count === last_count && count > 0) {
      stable_reads += 1;
      if (stable_reads >= STABILITY_REQUIRED_READS) return;
    } else {
      stable_reads = 0;
    }
    last_count = count;
  }
}

async function check_server_up() {
  try {
    const res = await fetch(`${STUDIO_ORIGIN}/`);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Runs in the browser. Walks the React Flow DOM and returns raw geometry.
 *
 * Returns { nodes: [{id, x, y, w, h}], edges: [{id, source, target, points: [[x,y],...]}] }
 *
 * Path parser handles M/L/Q (smoothstep edges use Q for rounded corners; we
 * keep only the endpoint of each Q so the polyline preserves the actual
 * corner location).
 */
function extract_geometry() {
  /** @param {string} d */
  function parse_path(d) {
    const points = [];
    const tokens = d
      .replace(/([MLQHVCZmlqhvcz])/g, ' $1 ')
      .replace(/,/g, ' ')
      .trim()
      .split(/\s+/);
    let i = 0;
    let cx = 0;
    let cy = 0;
    while (i < tokens.length) {
      const cmd = tokens[i];
      i += 1;
      if (cmd === 'M' || cmd === 'L') {
        cx = parseFloat(tokens[i]);
        cy = parseFloat(tokens[i + 1]);
        i += 2;
        points.push([cx, cy]);
      } else if (cmd === 'Q') {
        // Q cx1 cy1 x y — drop the control point, keep the endpoint.
        cx = parseFloat(tokens[i + 2]);
        cy = parseFloat(tokens[i + 3]);
        i += 4;
        points.push([cx, cy]);
      } else if (cmd === 'C') {
        cx = parseFloat(tokens[i + 4]);
        cy = parseFloat(tokens[i + 5]);
        i += 6;
        points.push([cx, cy]);
      } else if (cmd === 'H') {
        cx = parseFloat(tokens[i]);
        i += 1;
        points.push([cx, cy]);
      } else if (cmd === 'V') {
        cy = parseFloat(tokens[i]);
        i += 1;
        points.push([cx, cy]);
      } else if (cmd === 'Z' || cmd === 'z') {
        // No-op for our open polylines.
      } else if (/^-?\d/.test(cmd)) {
        // Implicit continuation of the previous command. Treat as L.
        cx = parseFloat(cmd);
        cy = parseFloat(tokens[i]);
        i += 1;
        points.push([cx, cy]);
      } else {
        break;
      }
    }
    return points;
  }

  /** @param {string} transform */
  function parse_translate(transform) {
    const m = /translate\(\s*(-?\d+(?:\.\d+)?)px[,\s]+(-?\d+(?:\.\d+)?)px\s*\)/.exec(transform);
    if (m === null) return null;
    return [parseFloat(m[1]), parseFloat(m[2])];
  }

  const viewport = document.querySelector('.react-flow__viewport');
  let zoom = 1;
  if (viewport !== null) {
    const m = /matrix\(\s*(-?\d+(?:\.\d+)?)/.exec(viewport.style.transform || '');
    if (m !== null) zoom = parseFloat(m[1]);
    if (!Number.isFinite(zoom) || zoom === 0) zoom = 1;
  }

  const node_els = document.querySelectorAll('.react-flow__node');
  const nodes = [];
  for (const el of node_els) {
    const id = el.getAttribute('data-id') ?? '';
    const t = parse_translate(el.style.transform);
    if (t === null) continue;
    const rect = el.getBoundingClientRect();
    nodes.push({
      id,
      x: t[0],
      y: t[1],
      w: rect.width / zoom,
      h: rect.height / zoom,
    });
  }

  const edge_els = document.querySelectorAll('.react-flow__edge');
  const edges = [];
  for (const el of edge_els) {
    const id = el.getAttribute('data-id') ?? el.getAttribute('id') ?? '';
    const source = el.getAttribute('data-source') ?? '';
    const target = el.getAttribute('data-target') ?? '';
    const path = el.querySelector('.react-flow__edge-path');
    if (path === null) continue;
    const d = path.getAttribute('d') ?? '';
    const points = parse_path(d);
    if (points.length < 2) continue;
    edges.push({ id, source, target, points });
  }

  return { nodes, edges };
}

async function read_previous() {
  try {
    const raw = await readFile(out_path, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function format_delta(curr, prev) {
  if (prev === undefined || prev === null) return '';
  const d = curr - prev;
  if (d === 0) return ' (=)';
  const sign = d > 0 ? '+' : '';
  const formatted = Number.isInteger(d) ? String(d) : d.toFixed(1);
  return ` (${sign}${formatted})`;
}

async function main() {
  const args = process.argv.slice(2);
  const label_idx = args.indexOf('--label');
  const label = label_idx >= 0 ? args[label_idx + 1] : null;
  const router_idx = args.indexOf('--router');
  const router = router_idx >= 0 ? args[router_idx + 1] : null;
  if (router !== null && router !== 'elk' && router !== 'libavoid') {
    process.stderr.write(`--router must be 'elk' or 'libavoid' (got ${router})\n`);
    process.exit(2);
  }
  const fixtures = build_fixtures(router);

  if (!(await check_server_up())) {
    process.stderr.write(
      `studio dev server not reachable at ${STUDIO_ORIGIN}\n` +
      `start it first:  pnpm --filter @repo/studio dev\n`,
    );
    process.exit(2);
  }

  await mkdir(out_dir, { recursive: true });
  await mkdir(screenshots_dir, { recursive: true });
  const previous = await read_previous();
  const previous_by_name = new Map(
    (previous?.fixtures ?? []).map((f) => [f.name, f.metrics]),
  );

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();

    const console_errors = [];
    page.on('pageerror', (err) => console_errors.push(`pageerror: ${err.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') console_errors.push(`console.error: ${msg.text()}`);
    });

    const results = [];
    for (const fixture of fixtures) {
      console_errors.length = 0;
      await page.goto(`${STUDIO_ORIGIN}/`);
      await page.evaluate(() => {
        try { localStorage.clear(); } catch { /* ignore */ }
      });
      await page.goto(`${STUDIO_ORIGIN}${fixture.path}`);
      await page.waitForSelector('.react-flow__node', { timeout: 10_000 });
      await wait_for_stable_layout(page);

      // Compose nodes start collapsed (in-memory state, see WeftCanvas.tsx).
      // The whole point of this measurement is the *expanded* layout — the
      // squiggly subway-edge view the user looks at — so click every
      // collapsed compose, re-settle, and repeat until none remain.
      let expand_passes = 0;
      while (expand_passes < 20) {
        const collapsed = await page.$$('.weft-node-compose-collapsed');
        if (collapsed.length === 0) break;
        for (const handle of collapsed) {
          await handle.click({ force: true }).catch(() => undefined);
        }
        await wait_for_stable_layout(page);
        expand_passes += 1;
      }

      const geometry = await page.evaluate(extract_geometry);
      const metrics = compute_metrics(geometry);

      // Auto-fit so the screenshot matches what a user would see after the
      // canvas's first-mount fit. The Controls toolbar exposes a fit-view
      // button; click it (idempotent) before snapping.
      await page.locator('.react-flow__controls-fitview').click().catch(() => undefined);
      await sleep(400);
      const screenshot_path = join(screenshots_dir, `${fixture.name}.png`);
      await page.screenshot({ path: screenshot_path, fullPage: false });

      results.push({ name: fixture.name, metrics, screenshot: screenshot_path });

      if (console_errors.length > 0) {
        process.stderr.write(`  ⚠ ${fixture.name} page errors:\n`);
        for (const err of console_errors) process.stderr.write(`    ${err}\n`);
      }

      const prev = previous_by_name.get(fixture.name);
      const summary = [
        `nodes=${metrics.nodes}`,
        `edges=${metrics.edges}`,
        `crossings=${metrics.crossings}${format_delta(metrics.crossings, prev?.crossings)}`,
        `bends=${metrics.bends}${format_delta(metrics.bends, prev?.bends)}`,
        `len=${metrics.totalEdgeLength}${format_delta(metrics.totalEdgeLength, prev?.totalEdgeLength)}`,
        `overlaps=${metrics.nodeEdgeOverlaps}${format_delta(metrics.nodeEdgeOverlaps, prev?.nodeEdgeOverlaps)}`,
      ].join('  ');
      process.stdout.write(`${fixture.name.padEnd(22)} ${summary}\n`);
    }

    const report = {
      timestamp: new Date().toISOString(),
      ...(label !== null ? { label } : {}),
      ...(router !== null ? { router } : {}),
      fixtures: results,
      ...(previous !== null ? { previous: { timestamp: previous.timestamp, label: previous.label ?? null } } : {}),
    };
    await writeFile(out_path, `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`\nwrote ${out_path}\n`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  process.stderr.write(`layout-metrics failed: ${String(err)}\n`);
  process.exit(1);
});
