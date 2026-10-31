/**
 * Competitor video breakdown (#300 stage 2, step 6).
 *
 * Consumes the manifest produced by `capture-competitor-videos.mjs` and turns
 * each downloaded mp4 into one **schema v1** per-video JSON
 * (`docs/research/competitor-video-benchmarks-research.md` §6): meta / verdict /
 * story_level / beats / shots / learnings.
 *
 * Pipeline per video:
 *   1. Cuts — `detectCuts()` (ffmpeg scene, no audio) writes
 *              `<id>.cuts.json`: the independent measured time source used when
 *              a layer's ASR grid collapses (#749). Cheap; failure is non-fatal.
 *   2. ASR   — `transcribeVideo()` from lib/video-understand.mjs (whisper.cpp,
 *              ms timestamps). Reused as-is; no download leg (files are local).
 *   3. VLM   — lib/competitor-vlm-worker.py, a line-delimited worker that
 *              reuses vlm_analyzer.py's model plumbing with a
 *              competitor-specific prompt and returns raw text.
 *   4. Parse — the worker returns a JSON object as text; the runner strips
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
 *   <handle>/<id>.cuts.json measured shot cuts (#749 second time source)
 *   index.json              run summary
 *
 * Usage:
 *   node scripts/short-video/analyze-competitor-videos.mjs [--limit N]
 *        [--handles a,b] [--out <dir>] [--force] [--asr-only] [--vlm-only]
 *        [--no-cuts]
 *
 * @module analyze-competitor-videos
 */

import { spawn, execFileSync } from "child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir, homedir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { transcribeVideo } from "./lib/video-understand.mjs";
import { detectCuts } from "./lib/cut-detect.mjs";

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

/** Strip the Markdown fences the model adds despite being told not to. */
function stripFences(text) {
  return text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
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
  const s = stripFences(text);
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
 * Best-effort structural repair of model JSON that `parseBreakdownJson`
 * rejected.
 *
 * The measured failure (#729, `sineadbovell/7599711388939980063`) is a
 * **delimiter-type mismatch**: the model closed the final array with a `}` —
 * `"antiPatterns": ["None"}}` — where `]` belonged, leaving one `[` open and the
 * root object one closer short. This is not the truncation signature (§3.5 ②):
 * truncation stops mid-token with a quote still open, whereas here the text ends
 * cleanly on structural characters.
 *
 * The repair walks the same brace/string state machine but, on a closing
 * delimiter, emits the type the open stack *expects* instead of the one the
 * model wrote (coercion), and — only when the text ends **outside a string** —
 * appends the closers still owed to the stack. Both guards keep truncation a
 * hard failure: a text ending mid-string returns null, so an output-budget cut
 * can never be dressed up as a complete record. Callers must surface that the
 * result was repaired (it is not the model's exact bytes).
 *
 * @param {string} text
 * @returns {object|null} parsed object, or null when the text cannot be repaired
 */
export function repairBreakdownJson(text) {
  if (typeof text !== "string") return null;
  const s = stripFences(text);
  const start = s.indexOf("{");
  if (start < 0) return null;
  const stack = [];
  let inString = false;
  let escaped = false;
  let out = "";
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
    } else if (ch === "{" || ch === "[") {
      stack.push(ch === "{" ? "}" : "]");
      out += ch;
    } else if (ch === "}" || ch === "]") {
      if (stack.length === 0) return null; // a stray closer: not repairable
      out += stack.pop(); // coerce the closer to the type the stack expects
      if (stack.length === 0) {
        try {
          return JSON.parse(out);
        } catch {
          return null;
        }
      }
    } else {
      out += ch;
    }
  }
  // Ended with the stack still open: only a clean end (quote closed) may be
  // treated as a missing closer rather than a truncated token.
  if (inString || stack.length === 0) return null;
  out += stack.reverse().join("");
  try {
    return JSON.parse(out);
  } catch {
    return null;
  }
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

  return {
    items: applyStarts(list, starts, span),
    anchored,
    total: list.length,
    distinctStarts: new Set(starts).size,
    span,
  };
}

/**
 * Attach `startMs`/`endMs` to items given an explicit ordered start list.
 *
 * An item's end is the next *distinct* start (an item anchored to the same
 * segment as its neighbour would otherwise get a zero-length range), and the
 * final item runs to `span`. Shared by the measured path and the interpolated
 * fallback so both stay monotonic and gap-free by construction.
 */
function applyStarts(items, starts, span) {
  return items.map((item, i) => {
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
}

/**
 * The collapse criterion: a timeline carries no usable per-item pacing when
 * fewer than half its items begin at a distinct measured start.
 *
 * It measures whether the **time resolution is trustworthy**, not whether the
 * record is usable — `verdict`/`beats` text stays valid on a collapsed timeline,
 * only the `startMs`/`endMs` layer is. The rule the 2026-10-17 batch demanded:
 * the previous `total > 1 && distinctStarts <= 1` fired on 0 of 34 records while
 * `shedoesai/7372434986558934305` (9 beats, 2 distinct starts, 2 ASR segments)
 * was substantively collapsed — the threshold sat exactly on the boundary the
 * model wobbles across, so the signal was vacuous at batch scale. Requiring
 * `total >= 3` keeps a single/two-item timeline (where any count is trivially
 * distinct) from being flagged.
 *
 * @param {number} total - beats or shots in the layer
 * @param {number} distinctStarts - distinct `startMs` on the **measured** (pre-fallback) timeline
 * @returns {boolean}
 */
export function isTimelineCollapsed(total, distinctStarts) {
  return total >= 3 && distinctStarts * 2 < total;
}

/**
 * Spread a collapsed group of items evenly across its own span.
 *
 * When the ASR anchor grid is too coarse (#730), the model can only point at the
 * few segment starts it was given, so many items share one start. The measured
 * segment boundaries are still real, so this keeps them as group edges and
 * subdivides **within** each run of equal starts — the faithful second time
 * source is the segment span itself, not a grid invented across the whole video.
 * Items sharing a start `s` run from `s` to the next different start (or `span`);
 * a run of one is left untouched.
 *
 * @param {Array<{startMs: number}>} items - items already carrying measured starts
 * @param {number} span
 * @returns {number[]} the interpolated start for each item
 */
export function interpolateStarts(items, span) {
  const n = items.length;
  const starts = items.map((it) => it.startMs);
  const out = new Array(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && starts[j + 1] === starts[i]) j++;
    const count = j - i + 1;
    const groupStart = starts[i];
    const groupEnd = j + 1 < n ? starts[j + 1] : span;
    const width = Math.max(groupEnd - groupStart, 0);
    for (let k = 0; k < count; k++) {
      out[i + k] = count === 1 ? groupStart : groupStart + Math.round((width * k) / count);
    }
    i = j + 1;
  }
  return out;
}

/**
 * Spread items over the measured cut grid, in order (#749).
 *
 * The second measured time source: when the ASR grid is too coarse, the video's
 * own shot cuts are independent measured time points. The first item starts at
 * the video start; the rest are assigned cut timestamps index-proportionally.
 * Consequences, all deliberate:
 *   - every returned start is a *measured* time (0 or a detected cut), never a
 *     point invented between cuts;
 *   - more cuts than items samples the grid evenly (first item at 0, last at
 *     the last cut);
 *   - fewer cuts than items lets adjacent items share a cut — the resolution
 *     the material actually offers, so `isTimelineCollapsed` re-judged on these
 *     starts stays honest.
 *
 * @param {number} total - items in the layer
 * @param {number[]|null} cutsMs - measured cut timestamps in ms
 * @param {number} span - video duration in ms
 * @returns {number[]|null} one start per item, or null when no usable cuts exist
 */
export function resolveCutStarts(total, cutsMs, span) {
  const duration = Math.round(Number(span) || 0);
  if (total <= 0 || duration <= 0) return null;
  const cuts = [
    ...new Set(
      (Array.isArray(cutsMs) ? cutsMs : [])
        .map((value) => Math.round(Number(value)))
        .filter((ms) => ms > 0 && ms < duration),
    ),
  ].sort((a, b) => a - b);
  // Just the video start is not a second source: no measured transition.
  if (cuts.length === 0) return null;
  if (total === 1) return [0];
  const boundaries = [0, ...cuts];
  const last = boundaries.length - 1;
  return Array.from({ length: total }, (_, i) => boundaries[Math.round((i * last) / (total - 1))]);
}

/**
 * Resolve one layer's timings, with the measured-source fallback.
 *
 * The measured path (`anchorTimings`) is used as-is while its resolution is
 * trustworthy. Once `isTimelineCollapsed` says it is not, the starts are
 * rebuilt from the independent measured source when one exists: the frame-level
 * shot cuts (#749, `resolveCutStarts`) and `anchorSource` flips to `"cuts"`.
 * Without cuts — a no-cut talking head yields none — the starts are
 * interpolated within the ASR segment spans exactly as before (`#730`), and
 * `anchorSource` stays `"interpolated"`: no silent downgrade, same fallback.
 * `rawDistinctStarts` preserves what the chosen measurement achieved (the ASR
 * anchored starts, or the distinct cut boundaries used), and the
 * `beatsCollapsed`/`shotsCollapsed` flags are computed from it — the health
 * signal stays honest even though the data was repaired.
 *
 * Precedence: a healthy ASR layer always wins (cuts are only a repair path —
 * speech-aligned beats are semantically anchored, cuts can fall mid-sentence);
 * a collapsed layer prefers cuts because its ASR resolution is below the
 * collapse threshold by definition and cuts are measured independently.
 *
 * @param {Array<object>} items
 * @param {Array<{start: number, end: number, text: string}>} segments
 * @param {number|null} durationMs
 * @param {number[]|null} [cutsMs] - measured shot cuts, from `detectCuts()`
 * @returns {{items: Array<object>, anchored: number, total: number,
 *   distinctStarts: number, rawDistinctStarts: number, anchorSource: string}}
 */
export function resolveTimings(items, segments, durationMs, cutsMs = null) {
  const raw = anchorTimings(items, segments, durationMs);
  if (!isTimelineCollapsed(raw.total, raw.distinctStarts)) {
    return {
      items: raw.items,
      anchored: raw.anchored,
      total: raw.total,
      distinctStarts: raw.distinctStarts,
      rawDistinctStarts: raw.distinctStarts,
      anchorSource: "asr",
    };
  }
  const cutStarts = resolveCutStarts(raw.total, cutsMs, raw.span);
  if (cutStarts) {
    const measured = new Set(cutStarts).size;
    return {
      items: applyStarts(raw.items, cutStarts, raw.span),
      anchored: raw.anchored,
      total: raw.total,
      distinctStarts: measured,
      rawDistinctStarts: measured,
      anchorSource: "cuts",
    };
  }
  const starts = interpolateStarts(raw.items, raw.span);
  return {
    items: applyStarts(raw.items, starts, raw.span),
    anchored: raw.anchored,
    total: raw.total,
    distinctStarts: new Set(starts).size,
    rawDistinctStarts: raw.distinctStarts,
    anchorSource: "interpolated",
  };
}

/**
 * Compose the schema v1 record from the four sources: manifest (account +
 * plays), ffprobe (duration), the model's breakdown JSON, and — for collapsed
 * layers — the measured shot cuts (#749).
 *
 * Fields we never captured (publish date, likes/comments/shares) stay null —
 * the ticket forbids inventing stats, and filling them needs a second
 * logged-in detail-page pass that is out of this step's scope.
 *
 * @param {{handle: string, followers: string|null, video: object}} entry
 * @param {number|null} durationSec
 * @param {object|null} breakdown
 * @param {object|null} transcript
 * @param {{times: number[], threshold: number, artifact?: string}|null} [cuts]
 * @returns {object}
 */
export function buildRecord(
  { handle, followers, video },
  durationSec,
  breakdown,
  transcript,
  cuts = null,
) {
  const durationMs = Number.isFinite(durationSec) ? Math.round(durationSec * 1000) : null;
  const cutTimes = cuts?.times ?? null;
  const beats = resolveTimings(breakdown?.beats, transcript?.segments, durationMs, cutTimes);
  const shots = resolveTimings(breakdown?.shots, transcript?.segments, durationMs, cutTimes);
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
      // The independent measured time source (#749). Present whenever cut
      // detection ran, whether or not a collapsed layer consumed it; a no-cut
      // talking head records `total: 0`, which is why its layer still says
      // `interpolated`. `threshold` and the `artifact` are the reproduction
      // recipe (`<id>.cuts.json` holds the timestamp array).
      ...(cuts
        ? {
            cuts: {
              total: cuts.times.length,
              threshold: cuts.threshold,
              ...(cuts.artifact ? { artifact: cuts.artifact } : {}),
            },
          }
        : {}),
      // Timing provenance. There are two independently-resolved layers, so
      // provenance is per-layer — reading one `anchorSource` would misreport the
      // other (beats can be fully measured while shots are reconstructed).
      //  - `beatsAnchorSource`/`shotsAnchorSource` — `"asr"` when starts are the
      //    measured segment starts; `"cuts"` when that layer's measured grid was
      //    too coarse and the independent shot-cut grid was used; `"interpolated"`
      //    when the grid was too coarse and no cut grid existed, so the starts
      //    were reconstructed within the segment spans (see `resolveTimings`).
      //    `evidence.asrSegments` / `evidence.cuts` beside this block are the
      //    grid sizes that caused it.
      //  - `beatsCollapsed`/`shotsCollapsed` — `isTimelineCollapsed` on that
      //    layer's **measured** distinct starts, so the health signal stays honest
      //    even when the data below it was reconstructed. It is a statement about
      //    time *resolution*, not about whether the record is usable: on a
      //    collapsed layer the item text is still valid, only `startMs`/`endMs`
      //    were untrustworthy.
      //  - `beatsMeasuredDistinctStarts`/`shotsMeasuredDistinctStarts` — the
      //    distinct starts the *measurement* achieved, before any fallback. For a
      //    cut-repaired layer this is the number of distinct cut boundaries used,
      //    i.e. the resolution the second source actually provided. Read these to
      //    judge collapse; the `*DistinctStarts` beside them are the resolved
      //    shape and are high after a fallback.
      //  - `beatsAnchored`/`shotsAnchored` — items whose anchor resolved to a real
      //    segment. A low count with a high total is the model naming segment
      //    numbers beyond the transcript (the 2026-10-17 batch: 71 shots over 22
      //    segments, so 49 had no measured anchor).
      timing: timingEvidence(beats, shots, durationMs),
    },
  };
}

/**
 * The `evidence.timing` block, single-sourced so a retime pass (#749) writes
 * exactly the fields the runner writes.
 *
 * @param {object} beats - resolved beats layer from `resolveTimings`
 * @param {object} shots - resolved shots layer from `resolveTimings`
 * @param {number|null} durationMs
 * @returns {object}
 */
export function timingEvidence(beats, shots, durationMs) {
  return {
    durationMs,
    beatsAnchorSource: beats.anchorSource,
    shotsAnchorSource: shots.anchorSource,
    beatsTotal: beats.total,
    beatsAnchored: beats.anchored,
    shotsTotal: shots.total,
    shotsAnchored: shots.anchored,
    beatsMeasuredDistinctStarts: beats.rawDistinctStarts,
    shotsMeasuredDistinctStarts: shots.rawDistinctStarts,
    beatsDistinctStarts: beats.distinctStarts,
    shotsDistinctStarts: shots.distinctStarts,
    beatsCollapsed: isTimelineCollapsed(beats.total, beats.rawDistinctStarts),
    shotsCollapsed: isTimelineCollapsed(shots.total, shots.rawDistinctStarts),
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
 * @param {boolean} [opts.noCuts] - skip shot-cut detection (collapsed layers keep
 *   the ASR-span interpolation; the pre-#749 behavior)
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
  noCuts = false,
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
    /** VLM replies that failed to parse and were structurally repaired (#729). */
    repaired: 0,
    /** Videos with a collapsed beats or shots timeline (see `isTimelineCollapsed`). */
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

      // 2. Cuts — the independent measured time source (#749). Cheap (one
      //    decode, no audio) and written beside the record so a collapsed
      //    timeline stays reproducible without re-running ASR or the VLM. A
      //    no-cut video records 0 events; detection failure is not fatal, it
      //    just leaves the ASR-span interpolation in charge.
      let cuts = null;
      if (!noCuts) {
        try {
          const detected = detectCuts(video.file);
          const artifact = `${safeId}.cuts.json`;
          writeFileSync(
            join(dir, artifact),
            JSON.stringify(
              {
                schemaVersion: "competitor-cuts-v1",
                videoId: video.id,
                source: "ffmpeg-scene",
                threshold: detected.threshold,
                cutsMs: detected.cutsMs,
              },
              null,
              2,
            ),
          );
          cuts = { times: detected.cutsMs, threshold: detected.threshold, artifact };
          process.stderr.write(
            `  cuts: ${detected.cutsMs.length} detected (scene>${detected.threshold})\n`,
          );
        } catch (err) {
          process.stderr.write(
            `  cuts: unavailable (${err.message}) — collapsed layers keep the ASR-span fallback\n`,
          );
        }
      }

      let breakdown = null;
      let vlmError = null;
      let repaired = false;
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
            // The raw text is the only provenance of a malformed reply; keep it
            // whether or not the repair succeeds, so the shape stays auditable.
            writeFileSync(join(dir, `${safeId}.raw.txt`), reply.text ?? "", "utf8");
            breakdown = repairBreakdownJson(reply.text);
            if (breakdown) {
              repaired = true;
              process.stderr.write(
                "  VLM: JSON needed structural repair (delimiter-type mismatch); record recovered\n",
              );
            } else {
              // Unrepairable (e.g. a truncated token): the failure must stay
              // visible downstream, not be masked as a success (see #729).
              vlmError = "unparseable-json";
              process.stderr.write("  VLM: response was not repairable JSON (raw kept)\n");
            }
          }
          if (breakdown) {
            process.stderr.write(
              `  VLM: ${breakdown.beats?.length ?? 0} beats, ${breakdown.shots?.length ?? 0} shots` +
                `${repaired ? " (repaired)" : ""}\n`,
            );
          }
        }
      }

      const record = buildRecord(target, durationSec, breakdown, transcript, cuts);
      record.error = vlmError;
      record.evidence.breakdownRepaired = repaired;
      record.processingMs = Date.now() - startedAt;
      writeFileSync(recordPath, JSON.stringify(record, null, 2));

      // A collapsed timeline is the one failure that still writes a complete,
      // plausible-looking record, so it must be loud rather than only in the JSON.
      const t = record.evidence.timing;
      for (const layer of ["beats", "shots"]) {
        if (!t[`${layer}Collapsed`]) continue;
        process.stderr.write(
          `  ⚠ ${layer} timeline collapsed: fewer than half begin at a distinct measured ` +
            `start (${t[`${layer}MeasuredDistinctStarts`]} measured distinct over ` +
            `${t[`${layer}Total`]} ${layer}, ${t[`${layer}Anchored`]} anchored, ` +
            `${record.evidence.asrSegments} ASR segments). Pacing was rebuilt ` +
            (t[`${layer}AnchorSource`] === "cuts"
              ? `onto ${t[`${layer}MeasuredDistinctStarts`]} distinct shot cuts (source=cuts)`
              : `within the ASR segment spans into ${t[`${layer}DistinctStarts`]} starts ` +
                `(source=${t[`${layer}AnchorSource`]})`) +
            "; content is usable, measured pacing is not.\n",
        );
      }

      summary.analyzed++;
      processed++;
      if (vlmError) summary.failed++;
      if (record.evidence.breakdownRepaired) summary.repaired++;
      const collapsedLayers = ["beats", "shots"].filter(
        (layer) => record.evidence.timing[`${layer}Collapsed`],
      );
      if (collapsedLayers.length > 0) summary.collapsedTimeline++;
      summary.results.push({
        handle,
        id: video.id,
        status: vlmError ? "failed" : "analyzed",
        collapsed: collapsedLayers.length > 0,
        collapsedLayers,
        repaired: record.evidence.breakdownRepaired,
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
    else if (a === "--no-cuts") opts.noCuts = true;
  }
  return opts;
}

const isMain =
  Boolean(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const summary = await analyzeCompetitorVideos(parseArgs(process.argv.slice(2)));
  process.stderr.write(
    `\nDone: ${summary.analyzed} processed (${summary.failed} failed, ` +
      `${summary.collapsedTimeline} collapsed timeline), ` +
      `${summary.skipped} skipped of ${summary.total}.\n` +
      `Index: ${join(summary.outDir, "index.json")}\n`,
  );
}
