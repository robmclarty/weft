#!/usr/bin/env node
/**
 * Graphviz `dot` benchmark — Phase 5 of docs/layout-quality-plan.md.
 *
 * Diagnostic only: lays the canonical fixtures out with Graphviz
 * (`splines=ortho`, `rankdir=LR`) and computes the same crossings / bends /
 * length / overlap metrics as `pnpm metrics`. Tells us whether the residual
 * 13 overlaps and 20 bends on `all_primitives` are an ELK ceiling or a
 * property of the input shape itself. **Not** for shipping — Graphviz
 * orthogonal mode ignores ports and degrades on cluster boundaries, both
 * of which the studio relies on.
 *
 *   # 1. Boot the studio in another terminal:
 *   pnpm --filter @repo/studio dev
 *
 *   # 2. Run the benchmark:
 *   pnpm metrics:graphviz
 *
 * Output: `.check/layout-graphviz-benchmark.json` (gitignored). Compares
 * line-by-line against the most recent `.check/layout-metrics.json` so the
 * "ELK vs Graphviz" delta is visible in the run summary.
 */

import { Graphviz } from '@hpcc-js/wasm-graphviz';
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { compute_metrics } from './lib/layout-geometry.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo_root = join(here, '..');
const out_dir = join(repo_root, '.check');
const out_path = join(out_dir, 'layout-graphviz-benchmark.json');
const metrics_path = join(out_dir, 'layout-metrics.json');

const STUDIO_ORIGIN = 'http://127.0.0.1:5173';
const VIEWPORT = { width: 1440, height: 900 };
const STABILITY_POLL_MS = 300;
const STABILITY_REQUIRED_READS = 3;
const STABILITY_TIMEOUT_MS = 15_000;
const GRAPHVIZ_DPI = 72;

const FIXTURE_NAMES = ['simple_sequence', 'all_primitives', 'full_primitive_set'];

async function check_server_up() {
  try {
    const res = await fetch(`${STUDIO_ORIGIN}/`);
    return res.ok;
  } catch {
    return false;
  }
}

async function wait_for_stable_layout(page) {
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

function extract_input_graph() {
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
    nodes.push({ id, w: rect.width / zoom, h: rect.height / zoom });
  }

  const edge_els = document.querySelectorAll('.react-flow__edge');
  const edges = [];
  for (const el of edge_els) {
    const id = el.getAttribute('data-id') ?? '';
    const source = el.getAttribute('data-source') ?? '';
    const target = el.getAttribute('data-target') ?? '';
    edges.push({ id, source, target });
  }
  return { nodes, edges };
}

function to_dot({ nodes, edges }) {
  const lines = [];
  lines.push('digraph G {');
  lines.push('  graph [rankdir=LR, splines=ortho, nodesep=0.4, ranksep=0.8];');
  lines.push('  node [shape=box];');
  for (const n of nodes) {
    const w_in = (n.w / GRAPHVIZ_DPI).toFixed(3);
    const h_in = (n.h / GRAPHVIZ_DPI).toFixed(3);
    lines.push(`  "${n.id}" [width=${w_in}, height=${h_in}, fixedsize=true];`);
  }
  for (const e of edges) {
    lines.push(`  "${e.source}" -> "${e.target}" [id="${e.id}"];`);
  }
  lines.push('}');
  return lines.join('\n');
}

function strip_quotes(s) {
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1);
  }
  return s;
}

function parse_plain(text, edge_id_lookup) {
  // Plain output spec: https://graphviz.org/docs/outputs/plain/
  // Coordinates are in inches, y-axis flipped (origin bottom-left).
  // We convert to pixels and flip y so positions sit in the same
  // top-left pixel space as the React Flow extractor.
  const lines = text.split('\n');
  let graph_height_in = 0;
  const nodes = [];
  const edges_raw = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (line.length === 0) continue;
    const parts = line.split(/\s+/);
    const kind = parts[0];
    if (kind === 'graph') {
      graph_height_in = parseFloat(parts[3] ?? '0');
    } else if (kind === 'node') {
      const name = strip_quotes(parts[1] ?? '');
      const x = parseFloat(parts[2] ?? '0');
      const y = parseFloat(parts[3] ?? '0');
      const w = parseFloat(parts[4] ?? '0');
      const h = parseFloat(parts[5] ?? '0');
      nodes.push({ id: name, x, y, w, h });
    } else if (kind === 'edge') {
      const tail = strip_quotes(parts[1] ?? '');
      const head = strip_quotes(parts[2] ?? '');
      const n = parseInt(parts[3] ?? '0', 10);
      const points = [];
      for (let i = 0; i < n; i += 1) {
        const x = parseFloat(parts[4 + i * 2] ?? '0');
        const y = parseFloat(parts[5 + i * 2] ?? '0');
        points.push([x, y]);
      }
      edges_raw.push({ tail, head, points });
    }
  }

  const px_nodes = nodes.map((n) => ({
    id: n.id,
    x: (n.x - n.w / 2) * GRAPHVIZ_DPI,
    y: (graph_height_in - n.y - n.h / 2) * GRAPHVIZ_DPI,
    w: n.w * GRAPHVIZ_DPI,
    h: n.h * GRAPHVIZ_DPI,
  }));

  const remaining = new Map();
  for (const e of edge_id_lookup) {
    const key = `${e.source} ${e.target}`;
    if (!remaining.has(key)) remaining.set(key, []);
    remaining.get(key).push(e.id);
  }

  const px_edges = edges_raw.map((e) => {
    const key = `${e.tail} ${e.head}`;
    const queue = remaining.get(key);
    const id = queue !== undefined && queue.length > 0
      ? queue.shift()
      : `e:${e.tail}->${e.head}:gv`;
    return {
      id,
      source: e.tail,
      target: e.head,
      points: e.points.map(([x, y]) => [
        x * GRAPHVIZ_DPI,
        (graph_height_in - y) * GRAPHVIZ_DPI,
      ]),
    };
  });

  return { nodes: px_nodes, edges: px_edges };
}

async function read_baseline() {
  try {
    const raw = await readFile(metrics_path, 'utf8');
    const parsed = JSON.parse(raw);
    return new Map(parsed.fixtures.map((f) => [f.name, f.metrics]));
  } catch {
    return new Map();
  }
}

function format_delta(curr, prev) {
  if (prev === undefined || prev === null) return '';
  const d = curr - prev;
  if (d === 0) return ' (=)';
  const sign = d > 0 ? '+' : '';
  const formatted = Number.isInteger(d) ? String(d) : d.toFixed(1);
  return ` (${sign}${formatted} vs elk)`;
}

async function main() {
  if (!(await check_server_up())) {
    process.stderr.write(
      `studio dev server not reachable at ${STUDIO_ORIGIN}\n` +
      `start it first:  pnpm --filter @repo/studio dev\n`,
    );
    process.exit(2);
  }

  await mkdir(out_dir, { recursive: true });
  const baseline = await read_baseline();
  const graphviz = await Graphviz.load();

  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();

    for (const name of FIXTURE_NAMES) {
      await page.goto(`${STUDIO_ORIGIN}/`);
      await page.evaluate(() => {
        try { localStorage.clear(); } catch { /* ignore */ }
      });
      await page.goto(`${STUDIO_ORIGIN}/view?src=${STUDIO_ORIGIN}/fixtures/${name}.json`);
      await page.waitForSelector('.react-flow__node', { timeout: 10_000 });
      await wait_for_stable_layout(page);

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

      const input = await page.evaluate(extract_input_graph);
      const dot = to_dot(input);
      const plain = graphviz.dot(dot, 'plain');
      const laid = parse_plain(plain, input.edges);
      const metrics = compute_metrics(laid);

      const prev = baseline.get(name);
      const summary = [
        `nodes=${metrics.nodes}`,
        `edges=${metrics.edges}`,
        `crossings=${metrics.crossings}${format_delta(metrics.crossings, prev?.crossings)}`,
        `bends=${metrics.bends}${format_delta(metrics.bends, prev?.bends)}`,
        `len=${metrics.totalEdgeLength}${format_delta(metrics.totalEdgeLength, prev?.totalEdgeLength)}`,
        `overlaps=${metrics.nodeEdgeOverlaps}${format_delta(metrics.nodeEdgeOverlaps, prev?.nodeEdgeOverlaps)}`,
      ].join('  ');
      process.stdout.write(`${name.padEnd(22)} ${summary}\n`);
      results.push({ name, metrics });
    }

    const report = {
      timestamp: new Date().toISOString(),
      engine: 'graphviz-dot',
      splines: 'ortho',
      fixtures: results,
    };
    await writeFile(out_path, `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`\nwrote ${out_path}\n`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  process.stderr.write(`layout-graphviz-benchmark failed: ${String(err)}\n`);
  process.exit(1);
});
