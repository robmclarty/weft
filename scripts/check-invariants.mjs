#!/usr/bin/env node
/**
 * Architectural-invariant pre-test check.
 *
 * Wires the constraints.md §7 invariants that ast-grep does not already cover.
 * Runs before the test suite (see scripts/check.mjs); a failure here prevents
 * the test step from running.
 *
 * Covers:
 *   3. no `process.env` reads in packages/*\/src/
 *   4. snake_case exported value symbols; PascalCase type aliases / interfaces
 *      / React components
 *   5. packages/weft/src/ contains only re-exports (no function bodies, no JSX,
 *      no non-trivial expressions)
 *   6. packages/core/src/ has no value imports from @robmclarty/fascicle
 *   7. packages/watch/src/ does not import react, react-dom, @xyflow/react,
 *      or elkjs
 *   8. packages/studio/src/ does not import @repo/core directly
 *
 * Plus the spec §9 architectural-validation guard:
 *   - no `unsafe-eval` or `eval(` literal in package source
 *
 * Invariants 1 (no `class`) and 2 (no `export default`) are enforced by ast-grep
 * rules under rules/.
 *
 * Output:
 *   .check/invariants.json    machine-readable findings
 *   stderr                    human-readable summary
 *
 * Exit codes:
 *   0  no violations
 *   1  one or more violations
 *   2  orchestrator error (IO failure)
 */

import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const PACKAGES_DIR = join(ROOT, 'packages');
const OUTPUT_DIR = join(ROOT, '.check');

const PACKAGE_NAMES = ['core', 'weft', 'studio', 'watch'];

const TEST_FILE = /\.(test|spec)\.tsx?$/;
const DECLARATION_FILE = /\.d\.ts$/;
const SOURCE_FILE = /\.tsx?$/;

const FORBIDDEN_WATCH_IMPORTS = new Set([
  'react',
  'react-dom',
  '@xyflow/react',
  'elkjs',
]);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(full));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

async function package_source_files(pkg) {
  const src = join(PACKAGES_DIR, pkg, 'src');
  try {
    const all = await walk(src);
    return all.filter((f) =>
      SOURCE_FILE.test(f) && !DECLARATION_FILE.test(f) && !TEST_FILE.test(f),
    );
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

/**
 * Strip `//` line comments and `/* ... *\/` block comments so token scanning
 * does not match comment text. Preserves line count by replacing block-comment
 * bodies with newline-padded blanks.
 */
function strip_comments(source) {
  let out = '';
  let i = 0;
  let in_line = false;
  let in_block = false;
  let in_string = null;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (in_line) {
      if (ch === '\n') {
        in_line = false;
        out += ch;
      }
      i += 1;
      continue;
    }
    if (in_block) {
      if (ch === '*' && next === '/') {
        in_block = false;
        i += 2;
        continue;
      }
      out += ch === '\n' ? '\n' : ' ';
      i += 1;
      continue;
    }
    if (in_string) {
      out += ch;
      if (ch === '\\' && next !== undefined) {
        out += next;
        i += 2;
        continue;
      }
      if (ch === in_string) in_string = null;
      i += 1;
      continue;
    }
    if (ch === '/' && next === '/') {
      in_line = true;
      i += 2;
      continue;
    }
    if (ch === '/' && next === '*') {
      in_block = true;
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      in_string = ch;
      out += ch;
      i += 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

function locate(source, index) {
  const before = source.slice(0, index);
  const line = before.split('\n').length;
  const last_newline = before.lastIndexOf('\n');
  const column = index - (last_newline + 1) + 1;
  return { line, column };
}

function add(violations, file, line, rule, message) {
  violations.push({ file: relative(ROOT, file), line, rule, message });
}

function check_no_process_env(file, source, violations) {
  const stripped = strip_comments(source);
  const re = /\bprocess\.env\b/g;
  let m;
  while ((m = re.exec(stripped)) !== null) {
    const { line } = locate(stripped, m.index);
    add(violations, file, line, 'no-process-env',
      'process.env reads are forbidden in package source (constraints §2, §7.3).');
  }
}

function check_no_unsafe_eval(file, source, violations) {
  const stripped = strip_comments(source);
  const patterns = [
    { re: /\bunsafe-eval\b/g, label: '`unsafe-eval` literal' },
    { re: /\beval\s*\(/g, label: '`eval(` call' },
  ];
  for (const { re, label } of patterns) {
    let m;
    while ((m = re.exec(stripped)) !== null) {
      const { line } = locate(stripped, m.index);
      add(violations, file, line, 'no-unsafe-eval',
        `${label} is forbidden (spec §9 architectural validation).`);
    }
  }
}

function check_no_fascicle_value_import(file, source, violations) {
  const stripped = strip_comments(source);
  // Match any `import` from @robmclarty/fascicle that is NOT `import type`.
  // Disallowed:  import { X } from '@robmclarty/fascicle'
  //              import X from '@robmclarty/fascicle'
  //              import * as X from '@robmclarty/fascicle'
  // Allowed:     import type { X } from '@robmclarty/fascicle'
  const re = /^[ \t]*import\b([^;]*?)from\s+['"]@robmclarty\/fascicle['"]/gm;
  let m;
  while ((m = re.exec(stripped)) !== null) {
    const head = m[1] ?? '';
    if (/^\s*type\b/.test(head)) continue;
    const { line } = locate(stripped, m.index);
    add(violations, file, line, 'no-fascicle-value-import',
      '@repo/core may import only types from @robmclarty/fascicle (constraints §3, §7.6). Use `import type`.');
  }
}

function check_no_watch_react_imports(file, source, violations) {
  const stripped = strip_comments(source);
  const re = /^[ \t]*import\b[^;]*?from\s+['"]([^'"]+)['"]/gm;
  let m;
  while ((m = re.exec(stripped)) !== null) {
    const spec = m[1] ?? '';
    if (FORBIDDEN_WATCH_IMPORTS.has(spec)) {
      const { line } = locate(stripped, m.index);
      add(violations, file, line, 'no-watch-react-imports',
        `@repo/watch may not import \`${spec}\` (constraints §3, §7.7). The CLI ships without the React peer surface.`);
    }
  }
}

function check_no_studio_core_import(file, source, violations) {
  const stripped = strip_comments(source);
  const re = /^[ \t]*(?:import|export)\b[^;]*?from\s+['"](@repo\/core(?:\/[^'"]*)?)['"]/gm;
  let m;
  while ((m = re.exec(stripped)) !== null) {
    const spec = m[1] ?? '';
    const { line } = locate(stripped, m.index);
    add(violations, file, line, 'no-studio-core-import',
      `@repo/studio must import the umbrella @repo/weft, not \`${spec}\` directly (constraints §3, §7.8).`);
  }
}

const RE_EXPORT_STATEMENT = /^\s*export\s+(?:type\s+)?(?:\*(?:\s+as\s+\w+)?|\{[^}]*\})\s+from\s+['"][^'"]+['"]\s*;?\s*$/;
const RE_REEXPORT_LINE_FRAGMENT = /^\s*[A-Za-z_$][\w$]*\s*(?:as\s+[A-Za-z_$][\w$]*\s*)?,?\s*$/;

function check_weft_reexport_only(file, source, violations) {
  const stripped = strip_comments(source);
  const lines = stripped.split('\n');
  let inside_reexport = false;
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i] ?? '';
    const line = raw.trim();
    if (line === '') continue;
    if (inside_reexport) {
      if (line.includes('}')) {
        inside_reexport = false;
        const after = line.slice(line.indexOf('}') + 1).trim();
        if (after !== '' && !/^from\s+['"][^'"]+['"]\s*;?\s*$/.test(after)) {
          add(violations, file, i + 1, 'weft-reexport-only',
            'unexpected token after re-export brace (constraints §7.5).');
        }
        continue;
      }
      if (!RE_REEXPORT_LINE_FRAGMENT.test(line)) {
        add(violations, file, i + 1, 'weft-reexport-only',
          'unexpected token inside re-export brace (constraints §7.5).');
      }
      continue;
    }
    if (RE_EXPORT_STATEMENT.test(line)) continue;
    if (/^\s*export\s+(?:type\s+)?\{[^}]*$/.test(line)) {
      inside_reexport = true;
      continue;
    }
    add(violations, file, i + 1, 'weft-reexport-only',
      '@repo/weft/src/ may contain only `export ... from \'...\'` re-exports (constraints §7.5).');
  }
}

const RE_EXPORTED_VALUE = /^\s*export\s+(?:async\s+)?(?:const|let|var|function|function\s*\*)\s+([A-Za-z_$][\w$]*)/gm;
const RE_EXPORTED_TYPE = /^\s*export\s+(?:type|interface)\s+([A-Za-z_$][\w$]*)/gm;
const SNAKE_CASE = /^[a-z][a-z0-9_]*$/;
const SCREAMING_SNAKE_CASE = /^[A-Z][A-Z0-9_]*$/;
const PASCAL_CASE = /^[A-Z][A-Za-z0-9]*$/;

function looks_like_react_component_file(file) {
  return file.endsWith('.tsx');
}

function check_naming(file, source, violations) {
  const stripped = strip_comments(source);

  RE_EXPORTED_VALUE.lastIndex = 0;
  let m;
  while ((m = RE_EXPORTED_VALUE.exec(stripped)) !== null) {
    const name = m[1] ?? '';
    if (SNAKE_CASE.test(name)) continue;
    if (SCREAMING_SNAKE_CASE.test(name)) continue;
    if (looks_like_react_component_file(file) && PASCAL_CASE.test(name)) continue;
    const { line } = locate(stripped, m.index);
    add(violations, file, line, 'naming',
      `exported value \`${name}\` must be snake_case (or SCREAMING_SNAKE_CASE for module-level constants; PascalCase only for React components in .tsx) — constraints §2, §7.4.`);
  }

  RE_EXPORTED_TYPE.lastIndex = 0;
  while ((m = RE_EXPORTED_TYPE.exec(stripped)) !== null) {
    const name = m[1] ?? '';
    if (PASCAL_CASE.test(name)) continue;
    const { line } = locate(stripped, m.index);
    add(violations, file, line, 'naming',
      `exported type \`${name}\` must be PascalCase (constraints §2, §7.4).`);
  }
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const violations = [];
  const summary = { checked_files: 0, packages: {} };

  for (const pkg of PACKAGE_NAMES) {
    const files = await package_source_files(pkg);
    summary.packages[pkg] = files.length;
    summary.checked_files += files.length;
    for (const file of files) {
      const source = await readFile(file, 'utf8');
      check_no_process_env(file, source, violations);
      check_no_unsafe_eval(file, source, violations);
      check_naming(file, source, violations);
      if (pkg === 'core') {
        check_no_fascicle_value_import(file, source, violations);
      }
      if (pkg === 'weft') {
        check_weft_reexport_only(file, source, violations);
      }
      if (pkg === 'watch') {
        check_no_watch_react_imports(file, source, violations);
      }
      if (pkg === 'studio') {
        check_no_studio_core_import(file, source, violations);
      }
    }
  }

  const ok = violations.length === 0;
  const report = {
    timestamp: new Date().toISOString(),
    ok,
    summary,
    violations,
  };
  await writeFile(
    join(OUTPUT_DIR, 'invariants.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );

  if (ok) {
    process.stderr.write(
      `invariants: ${summary.checked_files} file(s) clean across ${PACKAGE_NAMES.length} package(s).\n`,
    );
    process.exit(0);
  }

  process.stderr.write(`invariants: ${violations.length} violation(s):\n`);
  for (const v of violations) {
    process.stderr.write(`  ${v.file}:${v.line}  [${v.rule}]  ${v.message}\n`);
  }
  process.exit(1);
}

main().catch((err) => {
  process.stderr.write(`check-invariants: orchestrator error: ${err.message}\n`);
  process.exit(2);
});
