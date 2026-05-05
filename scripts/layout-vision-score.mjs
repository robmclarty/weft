#!/usr/bin/env node
/**
 * Vision-LLM layout-quality scorer.
 *
 * The quantitative `pnpm metrics` scorer counts crossings/bends/length/overlaps,
 * but two layouts with identical numbers can still read very differently — a
 * pink U-turn near a junction port, a label sitting on top of a node, edges
 * grazing a container boundary. This script asks Claude to score the
 * example screenshots on a structured visual-quality rubric and cite the
 * specific coordinates of each issue, giving us a tiebreaker the
 * geometry-only metrics can't provide.
 *
 *   # Run after `pnpm metrics` so the screenshots are fresh:
 *   pnpm metrics
 *   pnpm metrics:vision
 *
 *   # Score a single example:
 *   pnpm metrics:vision --example all_primitives
 *
 * Output: .check/layout-vision-scores.json (gitignored).
 *
 * Uses the locally-installed `claude` CLI so the user's existing auth
 * (Claude Code OAuth, ANTHROPIC_API_KEY, or Bedrock/Vertex creds) is
 * picked up without extra wiring. The script spawns `claude -p
 * --output-format json --model claude-sonnet-4-6 --allowedTools Read`
 * with the screenshot path embedded in the prompt; Claude reads the file
 * via its Read tool and returns a JSON envelope whose `.result` field is
 * the model's text response (a single JSON object matching the rubric).
 */

import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo_root = join(here, '..');
const out_dir = join(repo_root, '.check');
const metrics_path = join(out_dir, 'layout-metrics.json');
const out_path = join(out_dir, 'layout-vision-scores.json');

const MODEL = 'claude-sonnet-4-6';
const CLI_BINARY = process.env['CLAUDE_CLI_BIN'] ?? 'claude';
const CLI_TIMEOUT_MS = 120_000;

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

function build_prompt(example) {
  const metrics_summary = `Quantitative metrics for this layout:
- nodes=${example.metrics.nodes}, edges=${example.metrics.edges}
- crossings=${example.metrics.crossings}
- bends=${example.metrics.bends}
- totalEdgeLength=${example.metrics.totalEdgeLength}
- nodeEdgeOverlaps=${example.metrics.nodeEdgeOverlaps}

Use these as ground truth, not as the score itself — your job is to add
visual judgement the geometry-only counts miss.`;

  return `Read the screenshot at this absolute path:
${example.screenshot}

${metrics_summary}

${RUBRIC}`;
}

function extract_inner_json(text) {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try {
    return JSON.parse(trimmed);
  } catch {
    // Model sometimes wraps the JSON in surrounding prose. Pull the first
    // balanced { ... } block out of the response and parse that.
    const start = trimmed.indexOf('{');
    if (start === -1) throw new Error('no `{` in CLI response');
    let depth = 0;
    for (let i = start; i < trimmed.length; i += 1) {
      const ch = trimmed[i];
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) return JSON.parse(trimmed.slice(start, i + 1));
      }
    }
    throw new Error('unbalanced braces in CLI response');
  }
}

async function spawn_claude(prompt, example) {
  // Allow Read on the screenshots directory so Claude can open the PNG.
  const screenshot_dir = dirname(example.screenshot);
  const argv = [
    '-p',
    '--output-format', 'json',
    '--model', MODEL,
    '--allowedTools', 'Read',
    '--add-dir', screenshot_dir,
    '--permission-mode', 'bypassPermissions',
  ];
  return new Promise((resolve, reject) => {
    const proc = spawn(CLI_BINARY, argv, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    const settle = (fn) => {
      if (settled) return;
      settled = true;
      fn();
    };

    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      settle(() => reject(new Error(`claude CLI timed out after ${String(CLI_TIMEOUT_MS)}ms`)));
    }, CLI_TIMEOUT_MS);

    proc.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    proc.on('error', (err) => {
      clearTimeout(timer);
      settle(() => reject(err));
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        settle(() => reject(new Error(
          `claude CLI exited ${String(code)}: ${stderr.slice(0, 500)}`,
        )));
        return;
      }
      try {
        const envelope = JSON.parse(stdout);
        const text = typeof envelope?.result === 'string' ? envelope.result : '';
        if (text === '') {
          settle(() => reject(new Error(
            `claude CLI returned empty result; raw envelope: ${stdout.slice(0, 500)}`,
          )));
          return;
        }
        settle(() => resolve(extract_inner_json(text)));
      } catch (err) {
        settle(() => reject(new Error(
          `failed to parse CLI output: ${String(err)}\n--- raw ---\n${stdout.slice(0, 800)}`,
        )));
      }
    });

    proc.stdin.end(prompt);
  });
}

async function score_example(example) {
  const prompt = build_prompt(example);
  return spawn_claude(prompt, example);
}

function format_score(score) {
  const axes = ['edge_clutter', 'label_readability', 'container_clarity', 'balance'];
  const parts = axes.map((a) => `${a}=${String(score[a]?.score ?? '?')}`);
  parts.push(`overall=${String(score.overall ?? '?')}`);
  return parts.join('  ');
}

async function main() {
  const args = process.argv.slice(2);
  const ex_idx = args.indexOf('--example');
  const only_example = ex_idx >= 0 ? args[ex_idx + 1] : null;

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

  const targets = only_example === null
    ? metrics_report.examples
    : metrics_report.examples.filter((f) => f.name === only_example);

  if (targets.length === 0) {
    process.stderr.write(`no examples matched ${String(only_example)}\n`);
    process.exit(2);
  }

  const results = [];
  for (const example of targets) {
    process.stdout.write(`scoring ${example.name}…\n`);
    try {
      const score = await score_example(example);
      results.push({ name: example.name, score });
      process.stdout.write(`  ${format_score(score)}\n`);
    } catch (err) {
      process.stderr.write(`  failed: ${String(err)}\n`);
      results.push({ name: example.name, error: String(err) });
    }
  }

  const report = {
    timestamp: new Date().toISOString(),
    model: MODEL,
    via: 'claude-cli',
    metrics_timestamp: metrics_report.timestamp,
    ...(metrics_report.label !== undefined && metrics_report.label !== null
      ? { metrics_label: metrics_report.label }
      : {}),
    examples: results,
  };
  await writeFile(out_path, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`\nwrote ${out_path}\n`);
}

main().catch((err) => {
  process.stderr.write(`layout-vision-score failed: ${String(err)}\n`);
  process.exit(1);
});
