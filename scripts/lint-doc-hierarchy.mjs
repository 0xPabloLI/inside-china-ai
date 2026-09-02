/**
 * Documentation Hierarchy Lint
 *
 * Checks four rules:
 * 1. DOCS-INDEX consistency — every docs/*.md and docs/research/*.md is listed in DOCS-INDEX.md
 * 2. L1 Design Decisions — L1 docs with L2 references must have ## Design Decisions heading
 * 3. L2 command-line heuristic — L2 docs with ≥5 command-line patterns get WARN
 * 4. Structural agent-doc changes remind the author to load writing-for-agents
 *
 * Exit codes: 0 = PASS/WARN, 1 = FAIL
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = dirname(__dirname);
const DOCS_DIR = join(PROJECT_ROOT, "docs");
const RESEARCH_DIR = join(DOCS_DIR, "research");
const INDEX_PATH = join(DOCS_DIR, "DOCS-INDEX.md");

// --- Constants ---

const CMD_LINE_PATTERNS = [/npm run\s/, /node scripts\//, /git\s+\w/];

const CMD_LINE_THRESHOLD = 5;
const WRITING_FOR_AGENTS_POINTER = "AGENTS.md → Workflow Router → Agent documents";

// Files excluded from checks (index itself, ephemeral specs)
const EXCLUDED_FILES = new Set([
  "DOCS-INDEX.md", // index file itself — not listed in itself
]);

// Files matching these patterns are ephemeral (specs, tickets) and excluded
const EXCLUDED_PATTERNS = [/^spec-/, /^tickets-/];

function isExcluded(filename) {
  if (EXCLUDED_FILES.has(filename)) return true;
  return EXCLUDED_PATTERNS.some((p) => p.test(filename));
}

// --- Pure check functions (exported for testing) ---

/**
 * Check 1: DOCS-INDEX consistency.
 * Every .md file in docs/ root and docs/research/ must have its filename appear in the index content.
 */
export function checkDocsIndexConsistency(docs, indexContent) {
  const findings = [];
  for (const { filename, content } of docs) {
    if (isExcluded(filename)) continue;
    if (!indexContent.includes(filename)) {
      findings.push({
        level: "FAIL",
        ruleId: "docs-index-missing",
        file: filename,
        message: `${filename} not listed in DOCS-INDEX.md`,
      });
    }
  }
  return { findings };
}

/**
 * Check 2: L1 Design Decisions.
 * L1 docs (docs/*.md) that reference docs/research/ or docs/tiktok/ must have ## Design Decisions heading.
 */
export function checkL1DesignDecisions(files) {
  const findings = [];
  for (const { filename, content } of files) {
    if (isExcluded(filename)) continue;
    const hasL2Ref = content.includes("docs/research/") || content.includes("docs/tiktok/");
    const hasDesignDecisions = /^##\s+Design Decisions/m.test(content);
    if (hasL2Ref && !hasDesignDecisions) {
      findings.push({
        level: "FAIL",
        ruleId: "l1-missing-design-decisions",
        file: filename,
        message: `${filename} references L2 but has no Design Decisions section`,
      });
    }
  }
  return { findings };
}

/**
 * Check 3: L2 command-line heuristic.
 * L2 docs (docs/research/*.md) with ≥5 command-line patterns get WARN.
 */
export function checkL2CommandLines(files) {
  const findings = [];
  for (const { filename, content } of files) {
    const lines = content.split("\n");
    let cmdCount = 0;
    for (const line of lines) {
      if (CMD_LINE_PATTERNS.some((p) => p.test(line))) {
        cmdCount++;
      }
    }
    if (cmdCount >= CMD_LINE_THRESHOLD) {
      findings.push({
        level: "WARN",
        ruleId: "l2-execution-instructions",
        file: filename,
        message: `${filename} has ${cmdCount} command-line references (≥${CMD_LINE_THRESHOLD} threshold)`,
      });
    }
  }
  return { findings };
}

/**
 * Check 4: writing-for-agents gate.
 * Detects structural changes in staged docs/ files and AGENTS.md.
 * Returns WARN for: new/deleted section headings, pointer line changes (→), AGENTS.md modifications.
 *
 * @param {Array<{filename: string, diffLines: Array<{type: 'add'|'del'|'ctx', content: string}>}>} stagedDiffs
 * @returns {{findings: Array<{level: string, ruleId: string, file: string, message: string}>}}
 */
export function checkWritingForAgentsGate(stagedDiffs) {
  const findings = [];
  const headingPattern = /^#{1,4}\s/;
  const pointerPattern = /→/;
  const agentsMd = "AGENTS.md";

  for (const { filename, diffLines } of stagedDiffs) {
    const isDocs = filename.startsWith("docs/");
    const isAgentsMd = filename === agentsMd;
    if (!isDocs && !isAgentsMd) continue;

    const changes = diffLines.filter(
      (l) => (l.type === "add" || l.type === "del") && l.content.trim().length > 0,
    );

    if (changes.length === 0) continue;

    if (isAgentsMd) {
      findings.push({
        level: "WARN",
        ruleId: "writing-for-agents-gate",
        file: filename,
        message: `${filename} modified — confirm: did you load writing-for-agents skill before making these changes? (${WRITING_FOR_AGENTS_POINTER})`,
      });
      continue;
    }

    for (const line of changes) {
      if (headingPattern.test(line.content)) {
        findings.push({
          level: "WARN",
          ruleId: "writing-for-agents-gate",
          file: filename,
          message: `${filename} has heading ${line.type === "add" ? "added" : "deleted"}: "${line.content.trim()}" — confirm: did you load writing-for-agents skill? (${WRITING_FOR_AGENTS_POINTER})`,
        });
        break;
      }
      if (pointerPattern.test(line.content)) {
        findings.push({
          level: "WARN",
          ruleId: "writing-for-agents-gate",
          file: filename,
          message: `${filename} has pointer line ${line.type === "add" ? "added" : "deleted"}: "${line.content.trim()}" — confirm: did you load writing-for-agents skill? (${WRITING_FOR_AGENTS_POINTER})`,
        });
        break;
      }
    }
  }
  return { findings };
}

// --- File system helpers ---

function readMdFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((filename) => ({
      filename,
      content: readFileSync(join(dir, filename), "utf-8"),
    }));
}

// --- Git diff helpers ---

/**
 * Parse unified diff output into structured diff lines.
 * Only parses content lines (starting with +, -, or space), skips headers.
 */
export function parseDiffLines(diffOutput) {
  const lines = diffOutput.split("\n");
  const result = [];
  for (const line of lines) {
    if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("diff ") || line.startsWith("index ") || line.startsWith("@@") || line.startsWith("\\ No newline")) continue;
    if (line.startsWith("+")) {
      result.push({ type: "add", content: line.slice(1) });
    } else if (line.startsWith("-")) {
      result.push({ type: "del", content: line.slice(1) });
    } else if (line.startsWith(" ")) {
      result.push({ type: "ctx", content: line.slice(1) });
    }
  }
  return result;
}

/**
 * Get staged diffs for docs/ files and AGENTS.md.
 * Returns array of { filename, diffLines }.
 */
export function getStagedDiffs() {
  let stagedFiles;
  try {
    stagedFiles = execSync("git diff --cached --name-only --diff-filter=ACM", {
      encoding: "utf-8",
      cwd: PROJECT_ROOT,
    }).trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }

  const docsOrAgents = stagedFiles.filter(
    (f) => f.startsWith("docs/") || f === "AGENTS.md",
  );

  return docsOrAgents.map((file) => {
    const diff = execSync(`git diff --cached -- "${file}"`, {
      encoding: "utf-8",
      cwd: PROJECT_ROOT,
    });
    const diffLines = parseDiffLines(diff);
    return { filename: file, diffLines };
  });
}

// --- Main ---

export function main() {
  const indexContent = existsSync(INDEX_PATH) ? readFileSync(INDEX_PATH, "utf-8") : "";

  // Gather L1 files (docs/*.md root only) and L2 files (docs/research/*.md)
  const l1Files = readMdFiles(DOCS_DIR);
  const l2Files = readMdFiles(RESEARCH_DIR);
  const allFiles = [...l1Files, ...l2Files];

  // Run all checks
  const indexFindings = checkDocsIndexConsistency(allFiles, indexContent).findings;
  const l1Findings = checkL1DesignDecisions(l1Files).findings;
  const l2Findings = checkL2CommandLines(l2Files).findings;
  const gateFindings = checkWritingForAgentsGate(getStagedDiffs()).findings;

  const allFindings = [...indexFindings, ...l1Findings, ...l2Findings, ...gateFindings];

  // Print findings
  for (const f of allFindings) {
    const level = f.level === "FAIL" ? "FAIL" : "WARN";
    process.stderr.write(`${level} ${f.ruleId}: ${f.message}\n`);
  }

  // Summary
  const fails = allFindings.filter((f) => f.level === "FAIL");
  const warns = allFindings.filter((f) => f.level === "WARN");

  if (allFindings.length === 0) {
    process.stderr.write("[doc-hierarchy] PASS\n");
  } else if (fails.length > 0) {
    process.stderr.write(`[doc-hierarchy] FAIL (${fails.length})`);
    if (warns.length > 0) process.stderr.write(` + WARN (${warns.length})`);
    process.stderr.write("\n");
  } else {
    process.stderr.write(`[doc-hierarchy] WARN (${warns.length})\n`);
  }

  // Exit code: 1 if any FAIL, 0 otherwise
  process.exit(fails.length > 0 ? 1 : 0);
}

// Run if called directly (not imported)
if (process.argv[1] && process.argv[1].endsWith("lint-doc-hierarchy.mjs")) {
  main();
}
