#!/usr/bin/env node
/**
 * #1566 — query the TTS lane ledger.
 *
 * Reads the run-level files (`output/<pipelineId>/tts-ledger.jsonl`) and the
 * session-level file (`output/tts-sessions.jsonl`), then answers the questions
 * the ticket was opened for:
 *
 *   - which provider / kernel / batch produced this run;
 *   - how long the queue, model load and synthesis each took (or `unknown`);
 *   - how many packs shared one warm session.
 *
 * Usage:
 *   node scripts/short-video/tts-ledger.mjs
 *   node scripts/short-video/tts-ledger.mjs --content deepseek --since 2026-11-01
 *   node scripts/short-video/tts-ledger.mjs --run r-20261128T012345-abcdef
 *   node scripts/short-video/tts-ledger.mjs --json
 *
 * Read-only: `tts-verify` / `render-only` never call this file.
 */
import { readdirSync, realpathSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import {
  filterTtsLedger,
  readTtsLedger,
  SESSIONS_FILENAME,
  summarizeTtsLedger,
} from "./lib/tts/ledger.mjs";

const short = (id) =>
  typeof id === "string" && id.length > 18 ? `${id.slice(0, 16)}…` : (id ?? "-");
const num = (value, digits = 1) =>
  Number.isFinite(value) ? `${value.toFixed(digits)}s` : String(value ?? "unknown");

function parseFilters(argv) {
  const valueAfter = (flag) => {
    const index = argv.indexOf(flag);
    return index >= 0 ? (argv[index + 1] ?? null) : null;
  };
  return {
    content: valueAfter("--content"),
    runId: valueAfter("--run"),
    sessionId: valueAfter("--session"),
    provider: valueAfter("--provider"),
    since: valueAfter("--since"),
    until: valueAfter("--until"),
    json: argv.includes("--json"),
  };
}

/** Every ledger file this workspace has. */
function ledgerFiles(rootDir) {
  let entries = [];
  try {
    entries = readdirSync(rootDir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ content: entry.name, path: join(rootDir, entry.name, "tts-ledger.jsonl") }));
}

function main() {
  const filters = parseFilters(process.argv.slice(2));
  const shortVideoRoot = dirname(fileURLToPath(import.meta.url));
  const outputRoot = join(shortVideoRoot, "output");

  const files = ledgerFiles(outputRoot);
  const tagged = [];
  let skipped = 0;
  let missing = 0;
  for (const file of files) {
    const result = readTtsLedger(file.path);
    skipped += result.skipped;
    if (result.missing) continue;
    for (const record of result.records) tagged.push({ record, fileContent: file.content });
  }
  // Session records live outside any pack directory; they are never filtered
  // by `--content` (a session spans packs by design).
  const sessionFile = readTtsLedger(join(outputRoot, SESSIONS_FILENAME));
  for (const record of sessionFile.records) tagged.push({ record, fileContent: null });
  skipped += sessionFile.skipped;

  const candidates = tagged.filter(({ record, fileContent }) => {
    if (!filters.content) return true;
    return (
      record.contentDir === filters.content ||
      record.pipelineId === filters.content ||
      fileContent === filters.content
    );
  });
  const records = candidates.map(({ record }) => record);
  const usedContentDirs = new Set(
    candidates.map(({ fileContent }) => fileContent).filter((content) => content !== null),
  );

  const filtered = filterTtsLedger(records, {
    runId: filters.runId ?? undefined,
    sessionId: filters.sessionId ?? undefined,
    provider: filters.provider ?? undefined,
    since: filters.since ?? undefined,
    until: filters.until ?? undefined,
  });
  const summary = summarizeTtsLedger(filtered);

  if (filters.json) {
    console.log(
      JSON.stringify(
        {
          filters,
          files: [...usedContentDirs],
          sessions: summary.sessions,
          runs: summary.runs,
          providers: summary.providers,
          skippedLines: skipped,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🧾 TTS lane ledger");
  console.log(
    `   ${summary.runs.length} run(s) · ${summary.sessions.length} session(s) · ` +
      `${usedContentDirs.size} pack file(s)` +
      `${skipped > 0 ? ` · ${skipped} corrupt line(s) skipped` : ""}`,
  );

  if (summary.sessions.length > 0) {
    console.log("\nSessions");
    console.log(
      "  session                          provider               packs  runs  seconds  status",
    );
    for (const session of summary.sessions) {
      console.log(
        `  ${String(short(session.sessionId)).padEnd(32)} ${String(session.provider).padEnd(22)} ` +
          `${String(session.packs).padStart(5)} ${String(session.runIds.length).padStart(5)} ` +
          `${num(session.seconds).padStart(8)}  ${session.status}`,
      );
      if (session.runIds.length > 0) {
        console.log(`    runs: ${session.runIds.join(", ")}`);
      }
    }
  }

  console.log("\nRuns");
  console.log(
    "  runId                            provider               session          batch reuse  queued  load  synth  kernel  total  status",
  );
  for (const run of summary.runs) {
    const kernel = run.kernel && typeof run.kernel === "object" ? run.kernel : {};
    // A reused batch did not pay the model load — its own load is unknown; the
    // session's cold batch did. Show that number, marked, instead of hiding it.
    const load = Number.isFinite(kernel.loadSec)
      ? num(kernel.loadSec)
      : Number.isFinite(kernel.sessionLoadSec)
        ? `${num(kernel.sessionLoadSec)}*`
        : num(kernel.loadSec);
    console.log(
      `  ${String(short(run.runId)).padEnd(32)} ${String(run.provider).padEnd(22)} ` +
        `${String(short(run.sessionId)).padEnd(16)} ` +
        `${String(run.batchIndex ?? "unknown").padStart(5)} ` +
        `${String(run.sessionReused ?? "unknown").padStart(5)}  ` +
        `${num(kernel.queuedSec).padStart(7)} ${load.padStart(6)} ` +
        `${num(kernel.synthSec).padStart(6)} ${num(kernel.runningSec).padStart(6)} ` +
        `${num(run.seconds).padStart(6)}  ${run.status}` +
        `${run.failedError ? ` — ${String(run.failedError).split("\n")[0]}` : ""}`,
    );
  }
  console.log("  load 带 * = 该 run 复用了会话，模型加载由同一会话的冷批支付；自身未付。");

  if (summary.providers.length > 0) {
    console.log("\nBy provider");
    for (const provider of summary.providers) {
      console.log(
        `  ${String(provider.provider).padEnd(24)} runs ${provider.runs} ` +
          `(ok ${provider.ok}, failed ${provider.failed}) · ` +
          `total ${num(provider.seconds)} · synth ${num(provider.synthSec)}` +
          ` · queued ${num(provider.queuedSec)} · running ${num(provider.runningSec)}` +
          `${provider.unknownQueueRuns > 0 ? ` · ${provider.unknownQueueRuns} run(s) queue unknown` : ""}` +
          `${provider.unknownSynthRuns > 0 ? ` · ${provider.unknownSynthRuns} run(s) synth unknown` : ""}`,
      );
    }
  }

  console.log(
    "\n每条 run 的完整记录（含 phases / sceneGen）在对应 `output/<pack>/tts-ledger.jsonl`；本命令只读。",
  );
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
