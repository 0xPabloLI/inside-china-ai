#!/usr/bin/env node
/**
 * Hook-retention cohort report (#1206).
 *
 * Joins the TikTok Studio video-detail export to the content packs that
 * produced those videos, so the hook features (footage vs card, printed claim,
 * clip offset) sit next to the retention numbers they are supposed to move.
 *
 * This is a REPORT, not a gate. With 5-10 published videos the cohorts are
 * small and the honest output is a table plus a median per group, not a
 * verdict. It exists so a hook experiment conclusion can be written down with
 * numbers instead of impressions, and so the next report is one command.
 *
 * WHAT TIKTOK DOES NOT GIVE US: 3-second retention. The export carries
 * `avgWatchTimeSec`, `watchedFullVideoPct` and a `retentionInsight` string
 * naming the second where most viewers left ("大多数观众在 0:02 停止了观看").
 * The report shows that second as `major drop` and labels the cohort medians as
 * proxies — it never prints a 3s retention column it cannot fill.
 *
 * Mapping a published video to its pack: the export's `title` is the caption's
 * opening, and packs are versioned, so an exact string match misses old posts.
 * Matching therefore uses token coverage of the pack's own words (metadata +
 * every voiceover + title) against that caption opening; `--map` overrides.
 *
 * Usage:
 *   node scripts/short-video/cohort-report.mjs [--limit 10] [--details <path>]
 *     [--content-root <dir>] [--map <videoId>=<packSlug>] [--out <path>] [--json]
 *
 * @module cohort-report
 */

import {
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildHookClaim, truncate } from "./lib/hook-payoff.mjs";
import { mapDetailsToObservations, parseJsonl } from "./lib/hashtag-tracker.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Matching floor: the correct pack scores 0.92-1.00 on the 2026-11-09 export,
 * the runner-up ≤0.69. 0.8 sits in that gap with room on both sides. */
const DEFAULT_MATCH_COVERAGE = 0.8;

// ─── Text matching ───

/**
 * Normalize text to lowercase word tokens. Digits and CJK are kept (the
 * caption opening and the pack copy are both English today, but a future
 * Chinese pack should not collapse to zero tokens).
 *
 * @param {string} text
 * @returns {Set<string>}
 */
export function tokenSet(text) {
  const words = String(text ?? "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  return new Set(words);
}

/**
 * Overlap of two token sets, normalized by the SMALLER set.
 *
 * The export title is a 120-character truncation of a much longer caption, so
 * dividing by the pack's full vocabulary would punish a correct match for
 * everything the caption did not have room to say.
 *
 * @param {Set<string>} a
 * @param {Set<string>} b
 * @returns {number} 0-1
 */
export function coverage(a, b) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared++;
  return shared / Math.min(a.size, b.size);
}

/**
 * All the words a pack can be recognized by: title, description, and every
 * scene's voiceover (the caption is built from these).
 *
 * @param {Array<object>} scenes
 * @param {object|null} metadata - scene-data's `metadata` export
 * @param {object|null} meta - meta.mjs's `meta` export
 * @returns {Set<string>}
 */
export function packTokens(scenes, metadata, meta) {
  const parts = [
    metadata?.title,
    metadata?.description,
    meta?.title,
    ...(Array.isArray(scenes) ? scenes.map((scene) => scene?.voiceover) : []),
  ];
  return tokenSet(parts.filter(Boolean).join(" "));
}

/**
 * Best pack for a published video, or null when nothing clears the floor.
 *
 * @param {string} title - the export's caption opening
 * @param {Array<{slug: string, tokens: Set<string>}>} packs
 * @param {{minCoverage?: number}} [opts]
 * @returns {{slug: string, coverage: number}|null}
 */
export function matchPack(title, packs, opts = {}) {
  const minCoverage = opts.minCoverage ?? DEFAULT_MATCH_COVERAGE;
  const tokens = tokenSet(title);
  let best = null;
  for (const pack of packs) {
    const score = coverage(tokens, pack.tokens);
    if (!best || score > best.coverage) best = { slug: pack.slug, coverage: score };
  }
  return best && best.coverage >= minCoverage ? best : null;
}

// ─── Row building ───

/**
 * The hook features that a cohort can group by.
 *
 * `promise` comes from buildHookClaim so the report and the payoff gate name
 * the same words (claim-led: hookText/revealText; number-led: the number and
 * its label).
 *
 * @param {object|null} scene - the pack's hook scene (scenes[0])
 * @returns {{kind: "footage"|"image"|"card", promise: string, hookText: string,
 *   revealText: string, fit: string|null, offsetMs: number, voiceoverWords: number}}
 */
export function hookFeatures(scene) {
  const media = scene?.media || null;
  const kind = media?.type === "video" ? "footage" : media?.type === "image" ? "image" : "card";
  const claim = buildHookClaim(scene);
  return {
    kind,
    promise: claim.promise,
    hookText: claim.hookText,
    revealText: claim.revealText,
    fit: media?.fit ?? null,
    offsetMs: media?.videoStartOffsetMs ?? 0,
    voiceoverWords: countWords(scene?.voiceover),
  };
}

function countWords(text) {
  return String(text ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

/**
 * Parse the "most viewers stopped at 0:02" sentence into seconds.
 * Handles both the Chinese string the export returns today and an English one.
 *
 * @param {string|null|undefined} insight
 * @returns {number|null}
 */
export function parseMajorDropSec(insight) {
  const match = String(insight ?? "").match(/(\d+):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** "2026/11/9" → Date (UTC midnight); ascending sort helper. */
function postedDate(postedOn) {
  const match = String(postedOn ?? "").match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (!match) return 0;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/**
 * Build one row per published video, newest first.
 *
 * @param {object} input
 * @param {Array<object>} input.videos - `details.videos`
 * @param {Array<{slug: string, scenes: Array<object>, metadata: object|null,
 *   meta: object|null, tokens: Set<string>}>} input.packs
 * @param {Record<string, string>} [input.overrides] - videoId → pack slug
 * @param {Array<object>} [input.tracker] - hashtag-effect-tracker rows
 * @param {number} [input.limit]
 * @returns {Array<object>}
 */
export function buildRows({ videos = [], packs = [], overrides = {}, tracker = [], limit = 10 }) {
  const trackerById = new Map(
    tracker.filter((entry) => entry?.videoId).map((entry) => [String(entry.videoId), entry]),
  );
  const packBySlug = new Map(packs.map((pack) => [pack.slug, pack]));
  // The export field mapping belongs to lib/hashtag-tracker.mjs; reuse it so a
  // shape change is fixed in one place.
  const observations = mapDetailsToObservations({ videos });
  const rawById = new Map(videos.map((video) => [String(video.videoId ?? ""), video]));

  const rows = observations.map((observation) => {
    const videoId = observation.videoId;
    const raw = rawById.get(videoId) || {};
    const override = overrides[videoId];
    const match = override
      ? packBySlug.has(override)
        ? { slug: override, coverage: 1 }
        : null
      : matchPack(observation.videoTitle, packs);
    const pack = match ? packBySlug.get(match.slug) : null;
    const tracked = trackerById.get(videoId);
    return {
      postedOn: observation.publishedAt || null,
      postedAt: postedDate(observation.publishedAt),
      videoId,
      views: observation.views,
      avgWatchTimeSec: observation.avgWatchTimeSec,
      fullWatchPct: observation.watchedFullVideoPct,
      fypPct: observation.fypPercent,
      searchPct: observation.searchPercent,
      majorDropSec: parseMajorDropSec(raw.retentionInsight),
      pack: pack?.slug ?? null,
      matchCoverage: match ? Number(match.coverage.toFixed(2)) : null,
      hook: hookFeatures(pack?.scenes?.[0] ?? null),
      hashtags: tracked?.hashtags ?? pack?.meta?.hashtags ?? [],
      title: observation.videoTitle,
    };
  });

  return rows.sort((a, b) => b.postedAt - a.postedAt).slice(0, Math.max(0, limit));
}

/** Median of the numeric values, or null when there is none. */
export function median(values) {
  const nums = values.filter((value) => typeof value === "number" && Number.isFinite(value));
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function cohortStats(rows) {
  return {
    n: rows.length,
    medianViews: median(rows.map((row) => row.views)),
    medianAvgWatchTime: median(rows.map((row) => row.avgWatchTimeSec)),
    medianFullWatchPct: median(rows.map((row) => row.fullWatchPct)),
    medianMajorDropSec: median(rows.map((row) => row.majorDropSec)),
  };
}

/**
 * Group rows by hook kind. `unmapped` rows are kept out of the cohorts but
 * counted, so the totals never silently disagree with the table.
 *
 * @param {Array<object>} rows
 * @returns {{overall: object, byHookKind: Array<object>, unmapped: number}}
 */
export function summarizeCohorts(rows) {
  const groups = new Map();
  let unmapped = 0;
  for (const row of rows) {
    if (!row.pack) {
      unmapped++;
      continue;
    }
    const kind = row.hook.kind;
    if (!groups.has(kind)) groups.set(kind, []);
    groups.get(kind).push(row);
  }
  const byHookKind = [...groups.entries()]
    .map(([kind, groupRows]) => ({ kind, ...cohortStats(groupRows) }))
    .sort((a, b) => b.n - a.n);
  return { overall: cohortStats(rows), byHookKind, unmapped };
}

// ─── Formatting ───

const dash = (value) => (value === null || value === undefined || value === "" ? "–" : value);

function fixed(value, digits = 1, suffix = "") {
  return typeof value === "number" ? `${value.toFixed(digits)}${suffix}` : "–";
}

/**
 * Render the markdown report.
 *
 * @param {object} input
 * @param {Array<object>} input.rows
 * @param {ReturnType<typeof summarizeCohorts>} input.summary
 * @param {string} input.source - details file the rows came from
 * @param {string|null} [input.fetchedAt]
 * @returns {string}
 */
export function formatCohortMarkdown({ rows, summary, source, fetchedAt = null }) {
  const lines = [
    "# Hook retention cohorts",
    "",
    `Source: \`${source}\`${fetchedAt ? ` (fetched ${fetchedAt})` : ""}`,
    `Videos: ${rows.length} · mapped: ${rows.length - summary.unmapped} · unmapped: ${summary.unmapped}`,
    "",
    "| posted | views | avg watch | full-watch | major drop | FYP/search | hook | hook promise | pack |",
    "| --- | ---: | ---: | ---: | ---: | --- | --- | --- | --- |",
  ];

  for (const row of rows) {
    const promise = row.hook.promise;
    lines.push(
      `| ${dash(row.postedOn)} | ${dash(row.views)} | ${fixed(row.avgWatchTimeSec, 1, "s")} | ` +
        `${fixed(row.fullWatchPct, 1, "%")} | ${fixed(row.majorDropSec, 0, "s")} | ` +
        `${dash(row.fypPct)}/${dash(row.searchPct)} | ${row.pack ? row.hook.kind : "–"} | ` +
        `${truncate(promise, 44) || "–"} | ${row.pack ?? `unmapped (${row.matchCoverage ?? "–"})`} |`,
    );
  }

  lines.push(
    "",
    "## Cohorts",
    "",
    "| hook kind | n | median views | median avg watch | median full-watch | median major drop |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
  );
  for (const cohort of summary.byHookKind) {
    lines.push(
      `| ${cohort.kind} | ${cohort.n} | ${fixed(cohort.medianViews, 0)} | ` +
        `${fixed(cohort.medianAvgWatchTime, 1, "s")} | ${fixed(cohort.medianFullWatchPct, 1, "%")} | ` +
        `${fixed(cohort.medianMajorDropSec, 0, "s")} |`,
    );
  }
  lines.push(
    `| all | ${summary.overall.n} | ${fixed(summary.overall.medianViews, 0)} | ` +
      `${fixed(summary.overall.medianAvgWatchTime, 1, "s")} | ` +
      `${fixed(summary.overall.medianFullWatchPct, 1, "%")} | ` +
      `${fixed(summary.overall.medianMajorDropSec, 0, "s")} |`,
    "",
    "## How to read this",
    "",
    "- **3-second retention is not in the export.** TikTok Studio exposes average watch time,",
    "  full-watch rate and the second where most viewers left. `major drop` is that second,",
    "  parsed from `retentionInsight`, and it is the closest available proxy.",
    "- **Cohorts are small (n as published).** A median over 1-3 videos is an anecdote with a",
    "  number attached; treat it as a note for the next experiment, not evidence.",
    "- **Packs are matched by caption token coverage** (floor 0.8). A changed caption on an old",
    "  post can fall below it — pass `--map <videoId>=<pack>` to pin it.",
    "- **Hook kind** is `footage` (video under the claim), `image`, or `card` (CSS-only hook).",
  );
  return lines.join("\n");
}

// ─── CLI ───

function parseArgs(argv) {
  const options = {
    details: null,
    limit: 10,
    contentRoot: join(__dirname, "content"),
    out: null,
    json: false,
    overrides: {},
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--details") options.details = argv[++i];
    else if (arg === "--limit") {
      // Clamp: a negative value would turn slice(0, -n) into "drop the last n".
      options.limit = Math.max(1, Number(argv[++i]) || options.limit);
    } else if (arg === "--content-root") options.contentRoot = resolve(argv[++i]);
    else if (arg === "--out") options.out = argv[++i];
    else if (arg === "--json") options.json = true;
    else if (arg === "--map") {
      const [videoId, slug] = String(argv[++i] ?? "").split("=");
      if (videoId && slug) options.overrides[videoId] = slug;
    }
  }
  return options;
}

/** Newest `tiktok-video-details-*.json` under output/, by modification time
 * (the -b/-c filename suffixes are not dates and do not sort). */
function latestDetailsFile(outputDir) {
  const files = readdirSync(outputDir)
    .filter((name) => /^tiktok-video-details-.*\.json$/.test(name))
    .map((name) => join(outputDir, name));
  return (
    files
      .map((file) => ({ file, mtime: statSync(file).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)[0]?.file ?? null
  );
}

async function loadPacks(contentRoot) {
  const packs = [];
  for (const slug of readdirSync(contentRoot)) {
    const scenePath = join(contentRoot, slug, "scene-data.mjs");
    if (!existsSync(scenePath)) continue;
    try {
      const mod = await import(`file://${scenePath}`);
      const scenes = mod.scenes || mod.default?.scenes || [];
      const metadata = mod.metadata || mod.default?.metadata || null;
      const metaPath = join(contentRoot, slug, "meta.mjs");
      let meta = null;
      if (existsSync(metaPath)) {
        try {
          meta = (await import(`file://${metaPath}`)).meta || null;
        } catch {
          /* an unreadable meta.mjs still leaves scenes + metadata usable */
        }
      }
      packs.push({ slug, scenes, metadata, meta, tokens: packTokens(scenes, metadata, meta) });
    } catch {
      /* a pack that fails to import is skipped, not fatal to the report */
    }
  }
  return packs;
}

function loadTracker(outputDir) {
  const file = join(outputDir, "hashtag-effect-tracker.jsonl");
  if (!existsSync(file)) return [];
  // lib/hashtag-tracker.mjs owns this store's format and fails loud (with a
  // line number) on a malformed row; a damaged optional input becomes an empty
  // enrichment instead of killing the report.
  try {
    return parseJsonl(readFileSync(file, "utf8"));
  } catch {
    return [];
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const outputDir = join(__dirname, "output");
  const detailsPath =
    options.details || (existsSync(outputDir) ? latestDetailsFile(outputDir) : null);
  if (!detailsPath || !existsSync(detailsPath)) {
    console.error("❌ No tiktok-video-details-*.json found. Pass --details <path>.");
    process.exit(1);
  }

  // A hand-exported TikTok file and a typo'd --content-root / --out are the
  // realistic failure modes; report them as a one-line error, not a raw stack.
  let details;
  try {
    details = JSON.parse(readFileSync(detailsPath, "utf8"));
  } catch (error) {
    console.error(`❌ Could not read the details export ${detailsPath}: ${error.message}`);
    process.exit(1);
  }
  const videos = Array.isArray(details.videos) ? details.videos : [];
  const packs = await loadPacks(options.contentRoot);
  const rows = buildRows({
    videos,
    packs,
    overrides: options.overrides,
    tracker: loadTracker(outputDir),
    limit: options.limit,
  });
  const summary = summarizeCohorts(rows);

  if (options.json) {
    const payload = { source: detailsPath, fetchedAt: details.fetchedAt ?? null, rows, summary };
    const text = JSON.stringify(payload, null, 2);
    if (options.out) writeFileSync(options.out, `${text}\n`);
    console.log(text);
    return;
  }

  const markdown = formatCohortMarkdown({
    rows,
    summary,
    source: detailsPath,
    fetchedAt: details.fetchedAt ?? null,
  });
  if (options.out) writeFileSync(options.out, `${markdown}\n`);
  console.log(markdown);
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  });
}
