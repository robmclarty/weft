#!/usr/bin/env node
/**
 * Vision-LLM layout-quality scorer.
 *
 * The quantitative `pnpm metrics` scorer counts crossings/bends/length/overlaps,
 * but two layouts with identical numbers can still read very differently — a
 * pink U-turn near a junction port, a label sitting on top of a node, edges
 * grazing a container boundary. This script asks Claude to score the
 * fixture screenshots on a structured visual-quality rubric and cite the
 * specific coordinates of each issue, giving us a tiebreaker the
 * geometry-only metrics can't provide.
 *
 *   # Run after `pnpm metrics` so the screenshots are fresh:
 *   pnpm metrics
 *   pnpm metrics:vision
 *
 *   # Score a single fixture:
 *   pnpm metrics:vision --fixture all_primitives
 *
 * Output: .check/layout-vision-scores.json (gitignored).
 *
 * Requires ANTHROPIC_API_KEY in the environment.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo_root = join(here, '..');
const out_dir = join(repo_root, '.check');
const metrics_path = join(out_dir, 'layout-metrics.json');
const out_path = join(out_dir, 'layout-vision-scores.json');

const MODEL = 'claude-sonnet-4-6';
const API_URL = 'https://api.anthropic.com/v1/messages';
const MAX_TOKENS = 1500;

const RUBRIC = `
Score the canvas layout in this screenshot on these four axes (1-5, where
5 is best). The canvas renders a directed graph as a "subway map": nodes
are stops, edges are tracks running in horizontal/vertical orthogonal
segments, containers (compose, sequence, scope) are bordered regions
that enclose their children.

Axes:

1. **edge_clutter** — how easy is it to follow a single edge from source
   to target? Penalize: long detours, U-turns, edges that visually merge
   with unrelated edges, edges crossing through nodes they don't connect.

2. **label_readability** — are edge labels (e.g. "summary", "otherwise",
   "<fn:to_>") and node titles legible without overlapping each other or
   the nodes they describe?

3. **container_clarity** — do the bordered container rectangles clearly
   group their children? Penalize: edges grazing a container boundary,
   children spilling outside, container headers occluded.

4. **balance** — is the overall composition balanced? Penalize: large
   empty regions, content crowded into one corner, severe asymmetry that
   doesn't reflect graph structure.

For each axis, give a score (1-5), a one-sentence rationale, and up to
3 specific issues with approximate pixel coordinates (relative to the
top-left of the screenshot).

Return ONLY valid JSON with this exact shape — no prose, no markdown:

{
  "edge_clutter": {
    "score": <int 1-5>,
    "rationale": "<one sentence>",
    "issues": [{"x": <int>, "y": <int>, "note": "<short>"}]
  },
  "label_readability": { ... },
  "container_clarity": { ... },
  "balance": { ... },
  "overall": <float 1-5, weighted average — clutter and labels weigh
              double the others>
}
`.trim();

async function read_metrics() {
  const raw = await readFile(metrics_path, 'utf8');
  return JSON.parse(raw);
}

async function read_image_b64(path) {
  const buf = await readFile(path);
  return buf.toString('base64');
}

async function score_fixture(fixture, api_key) {
  const b64 = await read_image_b64(fixture.screenshot);
  const metrics_summary = `Quantitative metrics for this layout:
- nodes=${fixture.metrics.nodes}, edges=${fixture.metrics.edges}
- crossings=${fixture.metrics.crossings}
- bends=${fixture.metrics.bends}
- totalEdgeLength=${fixture.metrics.totalEdgeLength}
- nodeEdgeOverlaps=${fixture.metrics.nodeEdgeOverlaps}

Use these as ground truth, not as the score itself — your job is to add
visual judgement the geometry-only counts miss.`;

  const body = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: b64 } },
          { type: 'text', text: `${metrics_summary}\n\n${RUBRIC}` },
        ],
      },
    ],
  };

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': api_key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`anthropic ${String(res.status)}: ${text.slice(0, 500)}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text ?? '';
  const trimmed = text.trim().replace(/^```json\s*/i, '').replace(/```\s*$/i, '');
  try {
    return JSON.parse(trimmed);
  } catch (err) {
    throw new Error(
      `vision response was not JSON for ${fixture.name}: ${String(err)}\n--- raw ---\n${text}`,
    );
  }
}

function format_score(score) {
  const axes = ['edge_clutter', 'label_readability', 'container_clarity', 'balance'];
  const parts = axes.map((a) => `${a}=${String(score[a]?.score ?? '?')}`);
  parts.push(`overall=${String(score.overall ?? '?')}`);
  return parts.join('  ');
}

async function main() {
  const args = process.argv.slice(2);
  const fix_idx = args.indexOf('--fixture');
  const only_fixture = fix_idx >= 0 ? args[fix_idx + 1] : null;

  const api_key = process.env.ANTHROPIC_API_KEY ?? '';
  if (api_key === '') {
    process.stderr.write('ANTHROPIC_API_KEY not set\n');
    process.exit(2);
  }

  let metrics_report;
  try {
    metrics_report = await read_metrics();
  } catch (err) {
    process.stderr.write(
      `could not read ${metrics_path}: ${String(err)}\n` +
      `run \`pnpm metrics\` first\n`,
    );
    process.exit(2);
  }

  const targets = only_fixture === null
    ? metrics_report.fixtures
    : metrics_report.fixtures.filter((f) => f.name === only_fixture);

  if (targets.length === 0) {
    process.stderr.write(`no fixtures matched ${String(only_fixture)}\n`);
    process.exit(2);
  }

  const results = [];
  for (const fixture of targets) {
    process.stdout.write(`scoring ${fixture.name}…\n`);
    try {
      const score = await score_fixture(fixture, api_key);
      results.push({ name: fixture.name, score });
      process.stdout.write(`  ${format_score(score)}\n`);
    } catch (err) {
      process.stderr.write(`  failed: ${String(err)}\n`);
      results.push({ name: fixture.name, error: String(err) });
    }
  }

  const report = {
    timestamp: new Date().toISOString(),
    model: MODEL,
    metrics_timestamp: metrics_report.timestamp,
    ...(metrics_report.label !== undefined && metrics_report.label !== null
      ? { metrics_label: metrics_report.label }
      : {}),
    fixtures: results,
  };
  await writeFile(out_path, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`\nwrote ${out_path}\n`);
}

main().catch((err) => {
  process.stderr.write(`layout-vision-score failed: ${String(err)}\n`);
  process.exit(1);
});
