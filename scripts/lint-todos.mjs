#!/usr/bin/env node
/**
 * lint-todos.mjs — Tech-debt marker gate.
 *
 * Convention: every TODO/FIXME marker must reference the tracking issue on the
 * same line (e.g. `TODO(#123): ...`). Unlinked markers are exactly the debt
 * that silently accumulates — the scanner fails CI when one appears without
 * an owner ticket. See docs/agents/triage-labels.md for label conventions.
 *
 * Usage:
 *   node scripts/lint-todos.mjs            # scan src/ and scripts/
 *   node scripts/lint-todos.mjs <paths...> # scan specific paths instead
 *
 * Exit codes: 0 = clean (or only linked markers), 1 = unlinked markers found.
 */

import { readdirSync, readFileSync, realpathSync, statSync } from "fs";
import { fileURLToPath } from "url";
import { join, extname } from "path";

const SCAN_ROOTS = process.argv.length > 2 ? process.argv.slice(2) : ["src", "scripts"];

const SCAN_EXTENSIONS = new Set([".ts", ".tsx", ".mjs", ".js", ".py"]);

// Same exclusion intent as eslint.config.js ignores: vendored / retired /
// generated / experimental trees are not ours to keep clean.
const EXCLUDED_DIR_NAMES = new Set([
  "node_modules",
  "__pycache__",
  "experiments",
  "retired-html-path",
  ".venv",
  "test-results",
  ".scratch",
  ".git",
]);

// Any directory whose name contains "output" is pipeline output (output/,
// output_v22/, v33-output/, ...) holding vendored third-party source —
// gitignored and never ours to lint.
const OUTPUT_DIR_PATTERN = /output/i;

// The scanner and its tests mention TODO/FIXME as words they operate on —
// they are the rule's implementation, not debt. Skip them entirely.
const SELF_PATHS = ["scripts/lint-todos.mjs", "scripts/__tests__/lint-todos.test.mjs"];

const MARKER_PATTERN = /\b(TODO|FIXME)\b/;
// A marker is "linked" when the same line references an issue: TODO(#123),
// TODO: #123, FIXME (#123) etc.
const ISSUE_REF_PATTERN = /#\d+/;

function isExcludedDir(name) {
  return EXCLUDED_DIR_NAMES.has(name) || OUTPUT_DIR_PATTERN.test(name);
}

function isSelfPath(full) {
  return SELF_PATHS.some((p) => full === p || full.endsWith(`/${p}`));
}

/** Recursively collect scannable files under `dir`, pruning excluded trees. */
export function collectFiles(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out; // missing path: nothing to scan
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (isExcludedDir(entry.name)) continue;
      out.push(...collectFiles(full));
    } else if (entry.isFile() && SCAN_EXTENSIONS.has(extname(entry.name))) {
      if (isSelfPath(full)) continue;
      out.push(full);
    }
  }
  return out;
}

/**
 * Return unlinked debt markers in `content` (one {file, line, text} per hit).
 * Lines are 1-based; the file label is attached by the caller's `file` arg.
 */
export function findUnlinkedMarkers(content, file) {
  const violations = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (MARKER_PATTERN.test(line) && !ISSUE_REF_PATTERN.test(line)) {
      violations.push({ file, line: i + 1, text: line.trim().slice(0, 120) });
    }
  }
  return violations;
}

function main() {
  const roots = SCAN_ROOTS.flatMap((root) => {
    const st = statSync(root, { throwIfNoEntry: false });
    if (!st) {
      console.error(`[lint-todos] skipping missing path: ${root}`);
      return [];
    }
    return st.isDirectory() ? collectFiles(root) : [root];
  });
  const violations = roots.flatMap((file) =>
    findUnlinkedMarkers(readFileSync(file, "utf-8"), file),
  );

  if (violations.length > 0) {
    console.error(
      `[lint-todos] FAIL: ${violations.length} unlinked TODO/FIXME marker(s). ` +
        `Reference the tracking issue on the same line, e.g. TODO(#123):`,
    );
    for (const v of violations) {
      console.error(`  ${v.file}:${v.line}: ${v.text}`);
    }
    process.exit(1);
  }
  console.log(`[lint-todos] clean (${roots.length} files scanned)`);
}

// Run main() only on direct execution, not when imported by tests.
const thisFile = fileURLToPath(import.meta.url);
const isDirectRun = process.argv[1] && realpathSync(process.argv[1]) === thisFile;
if (isDirectRun) {
  main();
}
