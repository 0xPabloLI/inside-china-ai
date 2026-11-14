#!/usr/bin/env node
/**
 * Roadmap ledger — the checkable bound behind `implementation-workflow.md` §9
 * step 3 and the "Roadmap state" row of `issue-tracker.md`.
 *
 * §12 records why this is a script and not another sentence: the product-view
 * rule was written down three times and still got skipped until a gate could
 * tell done from not-done. The roadmap had the same shape — a "Done when" that
 * no one could evaluate, and deliveries that reached main without ever being
 * re-inventoried. Construction PRs do not touch `docs/issue-roadmap.md`; a
 * rotation PR later backfills them. That gap is deliberate (a single hot file
 * plus parallel sessions), so this ledger makes the gap *visible* rather than
 * demanding that every PR write the file.
 *
 * The unit of accounting is a merged PR, never a ticket number: `#541` can sit
 * in the tracker for years while three more half-deliveries land under it. A
 * delivery counts as recorded when its PR number appears in a `PR …` phrase,
 * or when its squash sha appears in backticks / after `squash`, in either the
 * tracker or the current inventory archive.
 *
 * Contract (JSON in, report out — same shape as `issue-tracker-ledger.mjs`):
 *
 *   node scripts/roadmap-ledger.mjs --fetch
 *   node scripts/roadmap-ledger.mjs --prs merged.json --json
 *   gh pr list --state merged --limit 40 --json number,title,body,mergedAt,mergeCommit,author \
 *     | node scripts/roadmap-ledger.mjs
 *
 * Default exit 0 = report only. `--gate` exits 1 on a non-empty ledger, for a
 * rotation PR that has backfilled everything. `--help` exits 0 before any I/O.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/** Durable carriers of recorded deliveries. The archive is where old rounds live. */
export const TRACKER_FILES = [
  join(PROJECT_ROOT, "docs", "issue-roadmap.md"),
  join(PROJECT_ROOT, "docs", "archive", "roadmap-inventory-history-2026-10-22.md"),
];

/** Bots and rotation/release PRs are ledger mechanics, not deliveries to record. */
export const BOT_AUTHOR = /(?:\[bot\]$|bot$|release-please|dependabot|github-actions)/i;
export const MECHANICAL_TITLE = /^(?:chore\([^)]*\):\s*release|docs\(roadmap\)|chore\(main\):)/i;

export const DEFAULT_WINDOW_DAYS = 14;
export const DEFAULT_LIMIT = 40;

const GH_PR_FIELDS = "number,title,body,mergedAt,mergeCommit,author";

/**
 * Numbers and shas the tracker already accounts for.
 *
 * Only numbers inside a `PR …` phrase count: a bare `#541` is a ticket, and
 * treating ticket numbers as PR numbers would hide a real delivery behind an
 * unrelated row. The word boundaries also keep dates, two-digit metrics and
 * the numeric tail of a sha (`dbfdd058` → `058`) out of the set.
 *
 * @param {string} text
 * @returns {{prNumbers: Set<number>, shas: Set<string>}}
 */
export function extractRecorded(text) {
  const prNumbers = new Set();
  const shas = new Set();
  for (const phrase of text.matchAll(/\bPR\b([^\n]{0,80})/gi)) {
    for (const n of phrase[0].matchAll(/(?<![\w-])#?(\d{3,5})(?![\w-])/g)) {
      prNumbers.add(Number(n[1]));
    }
  }
  for (const m of text.matchAll(/`([0-9a-f]{7,40})`/gi)) shas.add(m[1].toLowerCase());
  for (const m of text.matchAll(/squash\s+([0-9a-f]{7,40})\b/gi)) shas.add(m[1].toLowerCase());
  return { prNumbers, shas };
}

/**
 * @param {string[]} files
 * @returns {{prNumbers: Set<number>, shas: Set<string>}}
 */
export function readRecorded(files = TRACKER_FILES) {
  const prNumbers = new Set();
  const shas = new Set();
  for (const file of files) {
    const found = extractRecorded(readFileSync(file, "utf8"));
    for (const n of found.prNumbers) prNumbers.add(n);
    for (const sha of found.shas) shas.add(sha);
  }
  return { prNumbers, shas };
}

/**
 * @param {Array<object>} pullRequests raw `gh pr list --json …` output
 * @param {{prNumbers: Set<number>, shas: Set<string>}} recorded
 * @param {{windowDays?: number, now?: number}} [options]
 * @returns {{candidates: Array<object>, examined: number, skipped: Record<string, number>}}
 */
export function collectCandidates(pullRequests, recorded, options = {}) {
  const windowDays = options.windowDays ?? DEFAULT_WINDOW_DAYS;
  const now = options.now ?? Date.now();
  const cutoff = now - windowDays * 24 * 60 * 60 * 1000;
  const candidates = [];
  const skipped = {};

  const skip = (reason) => {
    skipped[reason] = (skipped[reason] ?? 0) + 1;
  };

  for (const pr of pullRequests) {
    const mergedAt = Date.parse(pr?.mergedAt ?? "");
    if (!Number.isFinite(mergedAt) || mergedAt < cutoff) {
      skip("outside-window");
      continue;
    }
    const login = pr?.author?.login ?? "";
    if (BOT_AUTHOR.test(login)) {
      skip("bot");
      continue;
    }
    const title = pr?.title ?? "";
    if (MECHANICAL_TITLE.test(title)) {
      skip("mechanical");
      continue;
    }
    const body = pr?.body ?? "";
    const sha = String(pr?.mergeCommit?.oid ?? "").toLowerCase();
    const shaRecorded = [...recorded.shas].some((prefix) => sha.startsWith(prefix));
    if (recorded.prNumbers.has(Number(pr.number)) || (sha && shaRecorded)) {
      skip("recorded");
      continue;
    }
    const tickets = [
      ...new Set([...`${title}\n${body}`.matchAll(/#(\d{3,4})\b/g)].map((m) => `#${m[1]}`)),
    ];
    candidates.push({
      number: pr.number,
      title,
      tickets,
      mergedAt: pr.mergedAt,
      sha: sha.slice(0, 8),
    });
  }

  return { candidates, examined: pullRequests.length, skipped };
}

/** @param {number} limit */
export function fetchMergedPulls(limit = DEFAULT_LIMIT) {
  const ghBin = process.env.GH_BIN || "gh";
  const raw = execFileSync(
    ghBin,
    ["pr", "list", "--state", "merged", "--limit", String(limit), "--json", GH_PR_FIELDS],
    { encoding: "utf8", cwd: PROJECT_ROOT },
  );
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("gh pr list did not return a JSON array");
  return parsed;
}

const USAGE = `Roadmap ledger — merged PRs not yet recorded in the tracker.

Usage:
  node scripts/roadmap-ledger.mjs --fetch [options]
  node scripts/roadmap-ledger.mjs --prs <path|-|> [options]
  gh pr list --state merged --limit 40 --json number,title,body,mergedAt,mergeCommit,author \\
    | node scripts/roadmap-ledger.mjs [options]

Options:
  --fetch            read merged PRs from gh (override the binary with GH_BIN)
  --prs <path|->     read merged PRs from a JSON file, or stdin with "-"
  --days <n>         look back n days (default ${DEFAULT_WINDOW_DAYS})
  --limit <n>        PRs requested from gh (default ${DEFAULT_LIMIT})
  --json             print the result as JSON
  --gate             exit 1 when the ledger is non-empty
  --help             print this help

Empty output = done. A non-empty ledger is a disposition list, not a failure:
put it in this round's PR body. A rotation PR writes each item into the tracker
or the inventory archive as a 'PR #N ...' line — a backfill, or an explicit
"no tracker row" note — and re-runs with --gate until the ledger is empty.
`;

function parseArgs(argv) {
  const opts = { windowDays: DEFAULT_WINDOW_DAYS, limit: DEFAULT_LIMIT };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help") opts.help = true;
    else if (arg === "--fetch") opts.fetch = true;
    else if (arg === "--json") opts.json = true;
    else if (arg === "--gate") opts.gate = true;
    else if (arg === "--prs") {
      opts.prs = argv[++i];
      if (!opts.prs) throw new Error("--prs needs a path or '-'");
    } else if (arg === "--days" || arg === "--limit") {
      const value = Number(argv[++i]);
      if (!Number.isInteger(value) || value < 1) throw new Error(`${arg} needs a positive integer`);
      if (arg === "--days") opts.windowDays = value;
      else opts.limit = value;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (!opts.help && !opts.fetch && !opts.prs && process.stdin.isTTY) {
    throw new Error("no PR data: use --fetch, --prs, or pipe gh pr list output");
  }
  return opts;
}

/** A synchronous readFileSync(0) hits EAGAIN on a non-blocking pipe. */
async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function loadPullRequests(opts) {
  if (opts.fetch) return fetchMergedPulls(opts.limit);
  const source = opts.prs ?? "-";
  const raw = source === "-" ? await readStdin() : readFileSync(source, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("PR data must be a JSON array");
  return parsed;
}

/** @param {object} result */
function formatReport(result, windowDays) {
  const { candidates, examined } = result;
  if (candidates.length === 0) {
    return `Roadmap ledger — clean (0 candidates; ${examined} merged PRs examined, last ${windowDays} days)`;
  }
  const lines = [
    `Roadmap ledger — ${candidates.length} candidate(s); ${examined} merged PRs examined, last ${windowDays} days`,
  ];
  for (const pr of candidates) {
    const date = String(pr.mergedAt).slice(0, 10);
    const tickets = pr.tickets.length ? pr.tickets.join(" ") : "-";
    lines.push(`  PR #${pr.number}  ${date}  ${tickets}  ${pr.sha || "-"}  ${pr.title}`);
  }
  lines.push(
    "Put this list in the PR body; a rotation PR records each `PR #N` in the tracker/archive and re-runs with --gate.",
  );
  return lines.join("\n");
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${USAGE}`);
    process.exitCode = 2;
    return;
  }
  if (opts.help) {
    process.stdout.write(USAGE);
    return;
  }
  try {
    const pullRequests = await loadPullRequests(opts);
    const recorded = readRecorded();
    const result = collectCandidates(pullRequests, recorded, { windowDays: opts.windowDays });
    const payload = { ...result, windowDays: opts.windowDays };
    process.stdout.write(
      `${opts.json ? JSON.stringify(payload, null, 2) : formatReport(payload, opts.windowDays)}\n`,
    );
    if (opts.gate && result.candidates.length > 0) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`[roadmap-ledger] ${error.message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(`[roadmap-ledger] ${error.message}\n`);
    process.exitCode = 1;
  });
}
