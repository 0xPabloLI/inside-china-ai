/**
 * Competitor video breakdown (#300 stage 2, step 6).
 *
 * Consumes the manifest produced by `capture-competitor-videos.mjs` and turns
 * each downloaded mp4 into one **schema v1** per-video JSON
 * (`docs/research/competitor-video-benchmarks-research.md` §6): meta / verdict /
 * story_level / beats / shots / learnings.
 *
 * Pipeline per video:
 *   1. ASR   — `transcribeVideo()` from lib/video-understand.mjs (whisper.cpp,
 *              ms timestamps). Reused as-is; no download leg (files are local).
 *   2. VLM   — lib/competitor-vlm-worker.py, a line-delimited worker that
 *              reuses vlm_analyzer.py's model plumbing with a
 *              competitor-specific prompt and returns raw text.
 *   3. Parse — the worker returns a JSON object as text; the runner strips
 *              Markdown fences and parses it into the schema v1 layers.
 *
 * Why not `understandVideo()`: it produces the *asset-semantics* schema
 * (description/subjects/contentKind/relevance) built for "can I use this clip",
 * and it re-downloads. The competitor breakdown needs a different prompt and
 * already-local files.
 *
 * Output (all under `output/competitor-benchmarks/analysis/`, gitignored):
 *   <handle>/<id>.json      schema v1 breakdown
 *   <handle>/<id>.asr.json  transcript evidence
 *   index.json              run summary
 *
 * Usage:
 *   node scripts/short-video/analyze-competitor-videos.mjs [--limit N]
 *        [--handles a,b] [--out <dir>] [--force] [--asr-only] [--vlm-only]
 *
 * @module analyze-competitor-videos
 */

import { spawn, execFileSync } from "child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir, homedir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { transcribeVideo } from "./lib/video-understand.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKER_SCRIPT = join(__dirname, "lib/competitor-vlm-worker.py");
const PYTHON_BIN =
  process.env.VLM_ANALYZER_PYTHON_BIN || join(homedir(), ".venvs", "mlx-vlm", "bin", "python");
const FFPROBE = "/opt/homebrew/opt/ffmpeg-full/bin/ffprobe";
const DEFAULT_MANIFEST = join(__dirname, "output/competitor-benchmarks/manifest.json");
const DEFAULT_OUT = join(__dirname, "output/competitor-benchmarks/analysis");

/** A long video (300s+) takes minutes on the 30B model; the worker is
 *  sequential, so this bounds one video, not the batch. */
const VLM_TIMEOUT_MS = 20 * 60 * 1000;

/** Output budget for one breakdown. vlm_analyzer's asset default (1000) and the
 *  worker's first guess (2500) both truncate: on the 2026-10-17 validation run
 *  rileybrown.ai/7309572377577393451 (31 ASR segments) hit the ceiling mid-string,
 *  the JSON never closed, and the whole record was lost. Measured output for that
 *  video was >2500 tokens, hence 6000 — generous, since generation stops at the
 *  closing brace. */
const VLM_MAX_TOKENS = 6000;

// ─── Prompt (schema v1) ───

/**
 * The competitor breakdown prompt.
 *
 * The model is never asked for millisecond values. mlx_vlm samples the video
 * evenly across its whole length but hands the model no clock, so every
 * `startMs` a model volunteered was fabricated: on the first real run
 * (maverickgpt/7533665407173938462, 49.1s) it compressed the entire narrative
 * into 0-4800ms — 9% of the video — while its segmentation itself was sound.
 * Absolute time is therefore derived on our side from measured anchors, and the
 * model's only time job is to say *which* numbered transcript segment each item
 * begins at (see `anchorTimings`).
 *
 * `audienceQuestionIn/Out` are included: the ticket flagged them as the
 * biggest increment of the beats layer (§6 "待阶段 2 定夺").
 */
export const COMPETITOR_PROMPT = `You are analysing one competitor short video (TikTok, 9:16 vertical) from an AI-news / AI-tools account, so our own production team can learn how it is built.

The attached video is sampled evenly across its whole length, and you are given no clock — so you cannot read an absolute time off the picture. Do not try. Two things below ARE measured, and they are the only time facts you have:

VIDEO_DURATION_MS: {DURATION_MS}

## Transcript (numbered; start/end are measured milliseconds)
{TRANSCRIPT}

## Task
Return ONE JSON object and nothing else (no prose, no Markdown fences), with exactly these keys:

{
  "verdict": "<2-4 sentences: why this video works, or does not. Judge from what the video actually does, never from view counts.>",
  "story_level": {
    "hook": "<what the first 0-3s does; quote the spoken wording when there is one>",
    "develop": "<how the body builds its argument>",
    "turn": "<the twist / reveal / peak, or null if there is none>",
    "landing": "<how it closes: CTA, punchline, or loop>"
  },
  "beats": [
    {"anchorSegment": 1,
     "intent": "<what this beat is trying to accomplish>",
     "info": "<the information it delivers>",
     "audienceQuestionIn": "<the question the viewer holds when this beat starts>",
     "audienceQuestionOut": "<the question they hold when it ends>"}
  ],
  "shots": [
    {"anchorSegment": 1,
     "visual": "<what is on screen>",
     "onScreenText": "<literal on-screen text, or null>"}
  ],
  "learnings": {
    "reusable": ["<a transferable technique>"],
    "antiPatterns": ["<something worth avoiding>"]
  }
}

Rules:
- Every beat and shot carries "anchorSegment": the number of the transcript segment that this item starts at or just after. It is the measured start time of that segment that our pipeline uses for the item. Use null only when the item both starts and ends in silence with no segment involved.
- Never output startMs or endMs. Segments run in order, so each item's range is derived from its anchor and the following item's anchor; the last item runs to VIDEO_DURATION_MS.
- 3-8 beats, ordered by anchorSegment (or nulls last). A beat is a narrative unit (intent); a shot is an observable picture/voice segment and there may be several per beat — a shot's anchor may repeat a beat's anchor.
- At most 12 shots. Merge adjacent shots whose frame looks the same and whose on-screen text does not change; do not repeat the same visual description across consecutive shots.
- Keep every string under 200 characters, and prefer 120. This answer has a hard output budget, so a truncated reply is worthless — length is your enemy here.
- Describe only what you can see or hear. If a field cannot be determined use null (or [] for an array) — never invent numbers, names, or stats.`;

/**
 * The ASR segments that carry text, in order. Both the prompt's numbering and
 * `anchorTimings`'s lookup must see the same list, or `anchorSegment` would
 * point at the wrong segment — hence one shared accessor.
 *
 * @param {Array<{start: number, end: number, text: string}>} segments
 * @returns {Array<{start: number, end: number, text: string}>}
 */
export function measurableSegments(segments) {
  if (!Array.isArray(segments)) return [];
  return segments.filter((s) => s && s.text);
}

/**
 * Render the numbered, measured transcript the prompt refers to.
 *
 * @param {Array<{start: number, end: number, text: string}>} segments
 * @returns {string}
 */
export function formatTranscript(segments) {
  const kept = measurableSegments(segments);
  if (kept.length === 0) return "(no speech detected)";
  return kept
    .map((s, i) => {
      const start = Math.round(Number(s.start) || 0);
      const end = Math.round(Number(s.end) || start);
      return `[seg ${i + 1}] ${start}-${end}ms: ${s.text}`;
    })
    .join("\n");
}

/**
 * Extract the first JSON object from raw model output.
 *
 * The model sometimes wraps the object in Markdown fences despite the
 * instruction; strip those, then take the outermost balanced braces.
 *
 * @param {string} text
 * @returns {object|null}
 */
export function parseBreakdownJson(text) {
  if (typeof text !== "string") return null;
  let s = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  const start = s.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(s.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/**
 * Derive real millisecond ranges for beats/shots from the anchors the model
 * gave, replacing the prompt's request for self-reported timestamps.
 *
 * Each item's start is the measured start of its `anchorSegment`; items with a
 * null/invalid anchor inherit the previous item's start, so the result stays
 * monotonic by construction. An item's end is the next *distinct* start (an
 * item anchored to the same segment as its neighbour would otherwise get a
 * zero-length range), and the final item runs to the video duration.
 *
 * @param {Array<object>} items - beats or shots, each with `anchorSegment`
 * @param {Array<{start: number, end: number, text: string}>} segments - ASR segments
 * @param {number|null} durationMs
 * @returns {{items: Array<object>, anchored: number, total: number, distinctStarts: number}}
 */
export function anchorTimings(items, segments, durationMs) {
  const list = Array.isArray(items) ? items : [];
  const segStarts = measurableSegments(segments).map((s) => Math.round(Number(s.start) || 0));
  const segEnds = measurableSegments(segments).map((s) => Math.round(Number(s.end) || 0));
  // Fall back to the last measured voice end when ffprobe gave no duration, so
  // a missing probe degrades to a slightly short timeline, not to zero.
  const span =
    Number.isFinite(durationMs) && durationMs > 0
      ? Math.round(durationMs)
      : Math.max(segEnds[segEnds.length - 1] ?? 0, 0);

  let anchored = 0;
  let cursor = 0;
  const starts = list.map((item, index) => {
    const n = Number(item?.anchorSegment);
    let start;
    if (Number.isInteger(n) && n >= 1 && n <= segStarts.length) {
      start = segStarts[n - 1];
      anchored++;
    } else {
      start = index === 0 ? 0 : cursor;
    }
    if (start < cursor) start = cursor; // a non-monotonic anchor must not go backwards
    cursor = start;
    return start;
  });

  const out = list.map((item, i) => {
    let end = span;
    for (let j = i + 1; j < starts.length; j++) {
      if (starts[j] > starts[i]) {
        end = starts[j];
        break;
      }
    }
    if (end <= starts[i]) end = Math.max(span, starts[i]);
    return { ...item, startMs: starts[i], endMs: end };
  });

  return {
    items: out,
    anchored,
    total: list.length,
    distinctStarts: new Set(starts).size,
  };
}

/**
 * Compose the schema v1 record from the three sources: manifest (account +
 * plays), ffprobe (duration), and the model's breakdown JSON.
 *
 * Fields we never captured (publish date, likes/comments/shares) stay null —
 * the ticket forbids inventing stats, and filling them needs a second
 * logged-in detail-page pass that is out of this step's scope.
 *
 * @param {{handle: string, followers: string|null, video: object}} entry
 * @param {number|null} durationSec
 * @param {object|null} breakdown
 * @param {object|null} transcript
 * @returns {object}
 */
export function buildRecord({ handle, followers, video }, durationSec, breakdown, transcript) {
  const durationMs = Number.isFinite(durationSec) ? Math.round(durationSec * 1000) : null;
  const beats = anchorTimings(breakdown?.beats, transcript?.segments, durationMs);
  const shots = anchorTimings(breakdown?.shots, transcript?.segments, durationMs);
  return {
    schemaVersion: "competitor-breakdown-v1",
    meta: {
      handle,
      followers,
      language: "en",
      url: video.url,
      videoId: video.id,
      plays: video.plays ?? null,
      likes: null,
      comments: null,
      shares: null,
      publishedAt: null,
      durationSec,
      format: null,
    },
    verdict: breakdown?.verdict ?? null,
    story_level: breakdown?.story_level ?? null,
    beats: beats.items,
    shots: shots.items,
    learnings: breakdown?.learnings ?? { reusable: [], antiPatterns: [] },
    evidence: {
      asrSegments: transcript?.segments?.length ?? 0,
      asrGuardChanged: transcript?.guard?.changed ?? null,
      breakdownParsed: breakdown !== null,
      // Timing provenance. Read this before trusting `beats[].startMs`:
      //  - `anchored` counts items whose start came from a measured ASR segment;
      //    0 anchored means the timeline is fully reconstructed, not measured.
      //  - `collapsed` catches the worse case: every item anchored to the *same*
      //    segment. Music/visual-led videos (shedoesai/7372434986558934305, 15.8s,
      //    only 2 ASR segments) collapse to one start for all 9 beats, which looks
      //    like full coverage but carries no shot timing at all. Item content is
      //    still usable; item *pacing* is not.
      timing: {
        durationMs,
        beatsTotal: beats.total,
        beatsAnchored: beats.anchored,
        shotsTotal: shots.total,
        shotsAnchored: shots.anchored,
        beatsDistinctStarts: beats.distinctStarts,
        shotsDistinctStarts: shots.distinctStarts,
        beatsCollapsed: beats.total > 1 && beats.distinctStarts <= 1,
        shotsCollapsed: shots.total > 1 && shots.distinctStarts <= 1,
      },
    },
  };
}

// ─── Helpers ───

/** Probe a local file's duration in seconds; null when ffprobe can't read it. */
export function probeDurationSec(filePath) {
  try {
    const out = execFileSync(
      FFPROBE,
      ["-v", "quiet", "-print_format", "json", "-show_format", filePath],
      { encoding: "utf8", timeout: 20_000 },
    );
    const dur = Number.parseFloat(JSON.parse(out)?.format?.duration);
    return Number.isFinite(dur) ? Math.round(dur * 10) / 10 : null;
  } catch {
    return null;
  }
}

/**
 * Spawn the VLM worker and return a `run(videoPath, prompt)` function plus a
 * `close()`. One process for the whole batch: the 30B model load is the
 * dominant fixed cost, so it must not be paid per video.
 */
function startVlmWorker({ onStderr } = {}) {
  const proc = spawn(PYTHON_BIN, [WORKER_SCRIPT], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, HF_HUB_OFFLINE: process.env.HF_HUB_OFFLINE || "1" },
  });

  let stdoutBuffer = "";
  let stderrBuffer = "";
  /** @type {Map<string, {resolve: Function, timer: NodeJS.Timeout}>} */
  const pending = new Map();
  let ready = false;
  /** @type {Array<Function>} */
  const readyWaiters = [];

  proc.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk.toString();
    const lines = stdoutBuffer.split("\n");
    stdoutBuffer = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      const waiter = pending.get(msg.id);
      // The model-load failure line arrives with an empty id, before any
      // request: treat it as fatal rather than routing it to a pending entry.
      if (!waiter) {
        if (msg.error && !ready) {
          for (const w of readyWaiters.splice(0)) w.reject(new Error(msg.error));
        }
        continue;
      }
      clearTimeout(waiter.timer);
      pending.delete(msg.id);
      waiter.resolve(msg);
    }
  });

  proc.stderr.on("data", (chunk) => {
    stderrBuffer += chunk.toString();
    const lines = stderrBuffer.split("\n");
    stderrBuffer = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      if (line.includes("[competitor-vlm] ready")) {
        ready = true;
        for (const w of readyWaiters.splice(0)) w.resolve();
      }
      onStderr?.(line);
    }
  });

  proc.on("error", (err) => {
    for (const [, w] of pending) {
      clearTimeout(w.timer);
      w.resolve({ id: "", error: `worker error: ${err.message}` });
    }
    pending.clear();
    for (const w of readyWaiters.splice(0)) w.reject(err);
  });

  proc.on("exit", (code) => {
    for (const [, w] of pending) {
      clearTimeout(w.timer);
      w.resolve({ id: "", error: `worker exited (code ${code})` });
    }
    pending.clear();
    if (!ready) {
      for (const w of readyWaiters.splice(0)) {
        w.reject(new Error(`worker exited before ready (code ${code})`));
      }
    }
  });

  function whenReady() {
    if (ready) return Promise.resolve();
    return new Promise((resolve, reject) => readyWaiters.push({ resolve, reject }));
  }

  return {
    whenReady,
    run(id, videoPath, prompt) {
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          resolve({ id, error: `timeout after ${VLM_TIMEOUT_MS}ms` });
        }, VLM_TIMEOUT_MS);
        pending.set(id, { resolve, timer });
        proc.stdin.write(
          JSON.stringify({ id, videoPath, prompt, maxTokens: VLM_MAX_TOKENS }) + "\n",
        );
      });
    },
    close() {
      try {
        proc.stdin.write(JSON.stringify({ action: "exit" }) + "\n");
      } catch {
        /* already gone */
      }
      setTimeout(() => {
        try {
          proc.kill("SIGTERM");
        } catch {
          /* already gone */
        }
      }, 200);
    },
  };
}

/**
 * A handle and a video id each become a path segment under outDir. The manifest
 * is machine-written — capture-competitor-videos.mjs runs the handle through
 * `sanitizeHandle()` before it lands there — so a segment outside
 * `[A-Za-z0-9._-]` means the manifest was hand-edited or corrupted. Fail loud
 * rather than guess a name, since a mangled segment silently scatters output.
 *
 * @param {unknown} value
 * @param {string} what - which manifest field, for the error message
 * @returns {string} the value, unchanged, once it is known to be safe
 */
export function safeSegment(value, what) {
  const s = String(value ?? "");
  if (!s || s === "." || s === ".." || !/^[A-Za-z0-9._-]+$/.test(s)) {
    throw new Error(`manifest ${what} is not a safe path segment: ${JSON.stringify(value)}`);
  }
  return s;
}

// ─── Main ───

/**
 * Run the breakdown batch.
 *
 * @param {object} [opts]
 * @param {string} [opts.manifestPath]
 * @param {string} [opts.outDir]
 * @param {number} [opts.limit] - max videos to analyse this run (0/undefined =
 *   all). Only videos actually processed count; a resume that skips existing
 *   records does not spend the budget.
 * @param {string[]} [opts.handles] - restrict to these handles
 * @param {boolean} [opts.force] - re-analyse videos that already have output
 * @param {boolean} [opts.asrOnly] - skip the VLM leg
 * @param {boolean} [opts.vlmOnly] - skip the ASR leg (prompt then has no transcript)
 * @returns {Promise<object>} run summary
 */
export async function analyzeCompetitorVideos({
  manifestPath = DEFAULT_MANIFEST,
  outDir = DEFAULT_OUT,
  limit = 0,
  handles = null,
  force = false,
  asrOnly = false,
  vlmOnly = false,
} = {}) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const targets = [];
  for (const account of manifest.accounts || []) {
    if (handles && !handles.includes(account.handle)) continue;
    for (const video of account.videos || []) {
      if (video.status !== "downloaded" || !video.file || !existsSync(video.file)) continue;
      targets.push({ handle: account.handle, followers: account.followers ?? null, video });
    }
  }

  const summary = {
    startedAt: new Date().toISOString(),
    manifestPath,
    outDir,
    total: targets.length,
    analyzed: 0,
    skipped: 0,
    failed: 0,
    /** Videos whose beats all anchored to one ASR segment (see buildRecord). */
    collapsedTimeline: 0,
    results: [],
  };

  let worker = null;
  if (!asrOnly) {
    worker = startVlmWorker({
      onStderr: (line) => process.stderr.write(`  [worker] ${line}\n`),
    });
    process.stderr.write("Starting VLM worker (30B model load ~30-60s)…\n");
    await worker.whenReady();
    process.stderr.write("VLM worker ready.\n");
  }

  /** Videos this run actually processed (analyzed or failed). `--limit` is
   *  documented as "max videos to analyse this run", so a resume that skips
   *  existing records must not spend the budget: counting every entry of
   *  summary.results turned "N already analysed + --limit N" into zero
   *  analyses. */
  let processed = 0;

  try {
    for (const target of targets) {
      if (limit > 0 && processed >= limit) break;
      const { handle, video } = target;
      const safeHandle = safeSegment(handle, "handle");
      const safeId = safeSegment(video.id, "video id");
      const dir = join(outDir, safeHandle);
      mkdirSync(dir, { recursive: true });
      const recordPath = join(dir, `${safeId}.json`);
      const asrPath = join(dir, `${safeId}.asr.json`);

      if (!force && existsSync(recordPath)) {
        summary.skipped++;
        summary.results.push({ handle, id: video.id, status: "skipped-existing" });
        continue;
      }

      process.stderr.write(`\n── ${handle}/${video.id} (${video.views} plays) ──\n`);
      const startedAt = Date.now();

      // 1. ASR — reuse video-understand's whisper.cpp leg. It writes a fixed
      //    `audio.wav` + `transcript.json` into outputDir, so give it a
      //    throwaway dir and keep only the parsed segments.
      let transcript = null;
      if (!vlmOnly) {
        const scratch = mkdtempSync(join(tmpdir(), "competitor-asr-"));
        try {
          transcript = await transcribeVideo(video.file, { outputDir: scratch, language: "auto" });
        } catch (err) {
          process.stderr.write(`  ASR failed: ${err.message}\n`);
        } finally {
          rmSync(scratch, { recursive: true, force: true });
        }
        if (transcript) {
          writeFileSync(asrPath, JSON.stringify(transcript, null, 2));
          process.stderr.write(`  ASR: ${transcript.segments?.length ?? 0} segments\n`);
        } else {
          process.stderr.write("  ASR: unavailable (degraded)\n");
        }
      } else if (existsSync(asrPath)) {
        transcript = JSON.parse(readFileSync(asrPath, "utf8"));
      }

      // Probed before the VLM call: the prompt needs the duration (it is the
      // only clock the model gets) and buildRecord needs it for beat ranges.
      const durationSec = probeDurationSec(video.file);

      let breakdown = null;
      let vlmError = null;
      if (!asrOnly && worker) {
        const prompt = COMPETITOR_PROMPT.replace(
          "{TRANSCRIPT}",
          formatTranscript(transcript?.segments || []),
        ).replace("{DURATION_MS}", String(Math.round((durationSec ?? 0) * 1000)));
        const reply = await worker.run(video.id, video.file, prompt);
        if (reply.error) {
          vlmError = reply.error;
          process.stderr.write(`  VLM failed: ${reply.error}\n`);
        } else {
          breakdown = parseBreakdownJson(reply.text);
          if (!breakdown) {
            vlmError = "unparseable-json";
            writeFileSync(join(dir, `${safeId}.raw.txt`), reply.text ?? "", "utf8");
            process.stderr.write("  VLM: response was not parseable JSON (raw kept)\n");
          } else {
            process.stderr.write(
              `  VLM: ${breakdown.beats?.length ?? 0} beats, ${breakdown.shots?.length ?? 0} shots\n`,
            );
          }
        }
      }

      const record = buildRecord(target, durationSec, breakdown, transcript);
      record.error = vlmError;
      record.processingMs = Date.now() - startedAt;
      writeFileSync(recordPath, JSON.stringify(record, null, 2));

      // A collapsed timeline is the one failure that still writes a complete,
      // plausible-looking record, so it must be loud rather than only in the JSON.
      if (record.evidence.timing.beatsCollapsed) {
        process.stderr.write(
          "  ⚠ timeline collapsed: every beat anchored to one ASR segment " +
            `(${record.evidence.timing.beatsDistinctStarts} distinct start). ` +
            "Content is usable, pacing is not.\n",
        );
      }

      summary.analyzed++;
      processed++;
      if (vlmError) summary.failed++;
      if (record.evidence.timing.beatsCollapsed) summary.collapsedTimeline++;
      summary.results.push({
        handle,
        id: video.id,
        status: vlmError ? "failed" : "analyzed",
        collapsed: record.evidence.timing.beatsCollapsed,
        error: vlmError,
      });
    }
  } finally {
    worker?.close();
  }

  summary.finishedAt = new Date().toISOString();
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "index.json"), JSON.stringify(summary, null, 2));
  return summary;
}

// ─── CLI ───

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--limit") opts.limit = Number(argv[++i]) || 0;
    else if (a === "--handles")
      opts.handles = String(argv[++i] || "")
        .split(",")
        .filter(Boolean);
    else if (a === "--out") opts.outDir = argv[++i];
    else if (a === "--manifest") opts.manifestPath = argv[++i];
    else if (a === "--force") opts.force = true;
    else if (a === "--asr-only") opts.asrOnly = true;
    else if (a === "--vlm-only") opts.vlmOnly = true;
  }
  return opts;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const summary = await analyzeCompetitorVideos(parseArgs(process.argv.slice(2)));
  process.stderr.write(
    `\nDone: ${summary.analyzed} processed (${summary.failed} failed, ` +
      `${summary.collapsedTimeline} collapsed timeline), ` +
      `${summary.skipped} skipped of ${summary.total}.\n` +
      `Index: ${join(summary.outDir, "index.json")}\n`,
  );
}
