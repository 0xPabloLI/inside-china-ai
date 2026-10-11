#!/usr/bin/env node
/**
 * hashtag-effect-tracker CLI — upsert observations into the tracker.
 *
 * Usage:
 *   node scripts/short-video/hashtag-effect-tracker.mjs upsert \
 *     --from-details output/tiktok-video-details-2026-10-11.json \
 *     [--from-caption <publish package dir>] \
 *     [--tags "#a,#b,#c"] [--published-at 2026/9/30] \
 *     [--dry-run]
 *
 *   node scripts/short-video/hashtag-effect-tracker.mjs report
 *
 * Why a CLI instead of "append a line by hand": the tracker used to be appended
 * to by hand once per analytics cycle, with a FULL snapshot each time. The same
 * video then showed up under several caption truncations with drifting tag sets,
 * which silently corrupts per-tag attribution (2026-10-11: a "6 vs 6" read was
 * really 6 videos against 5). The CLI makes the correct shape the easy shape:
 * one record per videoId, merged, with provenance and tag history kept.
 *
 * `--from-details` consumes the file `tiktok-video-details.mjs --fetch` already
 * writes (views / avgWatchTime / completion / traffic split). Hashtags are NOT
 * in that file — the live caption is the only source — so pass them explicitly
 * via `--tags` (or `--from-caption` to read a publish package's metadata).
 *
 * @module hashtag-effect-tracker-cli
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseJsonl,
  serializeJsonl,
  normalizeObservation,
  upsertRecords,
  mapDetailsToObservations,
  summarizeTagStats,
} from "./lib/hashtag-tracker.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_TRACKER = join(__dirname, "output", "hashtag-effect-tracker.jsonl");

function argValue(args, name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}

function hasFlag(args, name) {
  return args.includes(`--${name}`);
}

function loadTracker(path) {
  if (!existsSync(path)) return [];
  return parseJsonl(readFileSync(path, "utf8"));
}

/** Hashtags from a publish package's tiktok-metadata.json (the authored set). */
function tagsFromCaption(dir) {
  const metaPath = join(dir, "tiktok-metadata.json");
  if (!existsSync(metaPath)) {
    throw new Error(`No tiktok-metadata.json in ${dir}`);
  }
  const meta = JSON.parse(readFileSync(metaPath, "utf8"));
  const tags = meta.hashtags;
  if (!Array.isArray(tags) || tags.length === 0) {
    throw new Error(`${metaPath} carries no hashtags array`);
  }
  return tags;
}

function parseTagsArg(value) {
  return String(value)
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (t.startsWith("#") ? t : `#${t}`));
}

function cmdUpsert(args) {
  const trackerPath = argValue(args, "tracker") || DEFAULT_TRACKER;
  const detailsPath = argValue(args, "from-details");
  const captionDir = argValue(args, "from-caption");
  const tagsArg = argValue(args, "tags");
  const publishedAt = argValue(args, "published-at");
  const dryRun = hasFlag(args, "dry-run");

  if (!detailsPath) {
    throw new Error("upsert needs --from-details <tiktok-video-details-*.json>");
  }
  if (!existsSync(detailsPath)) {
    throw new Error(`No such details file: ${detailsPath}`);
  }

  const details = JSON.parse(readFileSync(detailsPath, "utf8"));
  let observations = mapDetailsToObservations(details);
  if (observations.length === 0) {
    throw new Error(`${detailsPath} carries no videos — nothing to upsert`);
  }

  const tags = captionDir ? tagsFromCaption(captionDir) : tagsArg ? parseTagsArg(tagsArg) : null;
  if (tags) {
    observations = observations.map((o) => normalizeObservation({ ...o, hashtags: tags }));
  }
  if (publishedAt) {
    observations = observations.map((o) => normalizeObservation({ ...o, publishedAt }));
  }

  const existing = loadTracker(trackerPath);
  const { records, added, updated, unchanged, legacy } = upsertRecords(existing, observations);

  console.log(`tracker: ${trackerPath}`);
  console.log(
    `existing ${existing.length} → ${records.length} records (legacy w/o videoId: ${legacy})`,
  );
  console.log(`added ${added} · updated ${updated} · unchanged ${unchanged}`);
  for (const o of observations) {
    const rec = records.find((r) => r.videoId === o.videoId);
    const n = (v) => (v === null || v === undefined ? "n/a" : v);
    console.log(
      `  • ${o.videoId} — ${n(rec.views)} views, avg ${n(rec.avgWatchTimeSec)}s, full ${n(rec.watchedFullVideoPct)}%, FYP ${n(rec.fypPercent)}%` +
        (rec.hashtags?.length ? ` [${rec.hashtags.join(" ")}]` : " [no tags]"),
    );
  }

  if (dryRun) {
    console.log("\n(dry-run: file not written)");
    return;
  }
  // `output/` is gitignored, so a fresh clone has no directory to write into.
  mkdirSync(dirname(trackerPath), { recursive: true });
  writeFileSync(trackerPath, serializeJsonl(records), "utf8");
  console.log(`\n📁 wrote ${records.length} records`);
}

function cmdReport(args) {
  const trackerPath = argValue(args, "tracker") || DEFAULT_TRACKER;
  const records = loadTracker(trackerPath);
  const withId = records.filter((r) => typeof r.videoId === "string" && r.videoId);
  console.log(
    `\n📊 Hashtag tracker — ${records.length} records (${withId.length} keyed, ${records.length - withId.length} legacy)\n`,
  );
  const tagStats = summarizeTagStats(withId);
  const rows = [...tagStats.entries()].sort((a, b) => b[1].n - a[1].n);
  for (const [tag, s] of rows) {
    const avg = s.viewed ? `${Math.round(s.views / s.viewed)} views` : "views n/a";
    const counted = s.viewed === s.n ? "" : ` (${s.viewed} of ${s.n} with views)`;
    console.log(`  ${tag.padEnd(28)} ${String(s.n).padStart(2)} videos   avg ${avg}${counted}`);
  }
  console.log("\n(avg = correlation, not causation: tags correlate with topic and publish order.)");
}

const args = process.argv.slice(2);
const command = args[0];

try {
  if (command === "upsert") {
    cmdUpsert(args);
  } else if (command === "report") {
    cmdReport(args);
  } else {
    console.log("Usage:");
    console.log(
      '  hashtag-effect-tracker.mjs upsert --from-details <file> [--tags "#a,#b"] [--from-caption <dir>] [--published-at <date>] [--dry-run]',
    );
    console.log("  hashtag-effect-tracker.mjs report [--tracker <path>]");
    process.exit(command ? 1 : 0);
  }
} catch (err) {
  console.error(`❌ ${err.message}`);
  process.exit(1);
}
