#!/usr/bin/env node
/**
 * tag-preflight.mjs — hashtag gate run BEFORE any tag is written.
 *
 * Reads the pool SSOT, the newest trending snapshot and the content pack's
 * meta/scene-data, derives the baseline via caption-utils.deriveHashtags
 * (limits from the platform profile — no hardcoded 3-5), then judges each
 * candidate against pool traffic data, freshness and the blacklist.
 *
 * This is a read-only gate: it never rewrites meta.mjs, scene-data.mjs,
 * generate-caption.mjs or the publish package. Existing publish behaviour is
 * unchanged in default mode (warnings only, pipeline continues).
 *
 * Usage:
 *   node scripts/short-video/tag-preflight.mjs --content <slug> [--platform tiktok]
 *     [--strict] [--json] [--pool <path>] [--snapshot <path>] [--out <path>]
 *
 * Exit codes:
 *   0  default mode, no blocking check failed (warnings allowed)
 *   1  --strict with a failing check, OR a blocking check (blacklist / count)
 *   2  hard error: pool missing/corrupt, content slug missing, scene-data
 *      unloadable, unknown platform
 *
 * Degradation: snapshot unavailable → pool-only, WARN, continue; pool missing
 * → hard stop with the refresh command. Missing data never passes silently.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { deriveHashtags } from "./lib/caption-utils.mjs";
import { getPlatformProfile, UnknownPlatformError } from "./lib/platforms/index.mjs";
import { matchTrendingTags } from "./snapshot-trending.mjs";
import { writeJsonAtomic } from "./lib/json-file.mjs";
import {
  DEFAULT_POOL_PATH,
  PoolLoadError,
  ageDays,
  evaluatePoolFreshness,
  evaluateTagFreshness,
  freshnessLevel,
  loadPool,
  lookupTag,
  normalizeTag,
  validatePool,
} from "./lib/hashtag-pool.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_DIR = join(SCRIPT_DIR, "output", "trending-snapshots");

/** Hard-error class: CLI exit 2. */
class PreflightHardError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PreflightHardError";
    this.code = code;
  }
}

function parseArgs(args) {
  const flags = {};
  const positionals = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next === undefined || next.startsWith("--")) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i += 1;
      }
    } else {
      positionals.push(arg);
    }
  }
  return { flags, positionals };
}

// ─── Snapshot discovery ───

/**
 * Find the newest trending snapshot (trending-YYYY-MM-DD.json), unless an
 * explicit --snapshot path is given. Returns { path, snapshot } or null.
 */
export function findSnapshot(snapshotOverride) {
  if (snapshotOverride) {
    if (!existsSync(snapshotOverride)) return null;
    try {
      return {
        path: resolve(snapshotOverride),
        snapshot: JSON.parse(readFileSync(snapshotOverride, "utf8")),
      };
    } catch {
      return null;
    }
  }
  if (!existsSync(SNAPSHOT_DIR)) return null;
  const files = readdirSync(SNAPSHOT_DIR)
    .filter((name) => /^trending-\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .sort()
    .reverse();
  for (const name of files) {
    const filePath = join(SNAPSHOT_DIR, name);
    try {
      return { path: filePath, snapshot: JSON.parse(readFileSync(filePath, "utf8")) };
    } catch {
      // Corrupt snapshot: keep looking for an older parseable one.
    }
  }
  return null;
}

// ─── Content loading ───

async function loadContentPack(slug) {
  const contentDir = join(SCRIPT_DIR, "content", slug);
  const scenePath = join(contentDir, "scene-data.mjs");
  const metaPath = join(contentDir, "meta.mjs");

  if (!existsSync(scenePath)) {
    throw new PreflightHardError(
      "CONTENT_MISSING",
      `Content pack not found: ${scenePath} (slug "${slug}")`,
    );
  }

  let scenes;
  let metadata;
  try {
    const mod = await import(`file://${scenePath}`);
    scenes = mod.scenes || mod.default?.scenes;
    metadata = mod.metadata || mod.default?.metadata;
  } catch (error) {
    throw new PreflightHardError(
      "SCENE_DATA_UNLOADABLE",
      `scene-data.mjs unloadable for "${slug}": ${error.message}`,
    );
  }
  if (!Array.isArray(scenes)) {
    throw new PreflightHardError(
      "SCENE_DATA_UNLOADABLE",
      `scene-data.mjs for "${slug}" exports no scenes array`,
    );
  }

  let meta = null;
  if (existsSync(metaPath)) {
    try {
      const metaMod = await import(`file://${metaPath}`);
      meta = metaMod.meta || metaMod.default?.meta;
    } catch {
      meta = null; // mirror generate-caption.mjs: meta failure is a warning, not a hard stop
    }
  }

  return { scenes, metadata, meta, contentDir };
}

/** Mirror buildPublishPackage's metadata enrichment (read-only). */
function enrichMetadata(metadata, meta) {
  const primaryEntity = meta?.keyEntities?.companies?.[0] ?? null;
  const keyEntitiesCompanies = meta?.keyEntities?.companies || [];
  const keyEntitiesModels = meta?.keyEntities?.models || [];
  const enriched = { ...(metadata || {}), primaryEntity, keyEntitiesCompanies, keyEntitiesModels };
  if (Array.isArray(meta?.hashtags) && meta.hashtags.length > 0) {
    enriched.hashtags = meta.hashtags;
  }
  return enriched;
}

function collectKeywords(meta, metadata) {
  const raw = [
    ...(meta?.topics || []),
    meta?.subject,
    metadata?.title,
    ...(meta?.keyEntities?.companies || []),
    ...(meta?.keyEntities?.models || []),
  ];
  const keywords = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    for (const token of item
      .toLowerCase()
      .replace(/^#/, "")
      .split(/[^a-z0-9]+/)) {
      if (token.length >= 2 && !keywords.includes(token)) keywords.push(token);
    }
  }
  return keywords;
}

// ─── Candidate ranking ───

const KIND_RANK = { traffic: 0, brand: 1, entity: 2, niche: 3, trending: 4, meta: 5 };

function rankScore(entry) {
  return KIND_RANK[entry?.kind] ?? 9;
}

function metricString(entry) {
  if (!entry) return "—";
  const views = entry.viewsText ?? entry.views ?? "—";
  const posts = entry.postsText ?? entry.posts ?? "—";
  const avg = entry.avgViewsPerPost ?? "—";
  return `${views} / ${posts} / ${avg}`;
}

// ─── Main evaluation ───

/**
 * Pure report builder: judges an already-derived baseline against the pool.
 * Split from evaluatePreflight so tests can drive synthetic baselines
 * (e.g. out-of-range counts) without going through deriveHashtags.
 *
 * @param {object} p
 * @param {string} p.slug
 * @param {string} p.platform
 * @param {boolean} p.strict
 * @param {object} p.pool
 * @param {object|null} p.snapshot ({path, snapshot})
 * @param {string[]} p.baseline
 * @param {{min: number, max: number}} p.limits
 * @param {object} p.content ({scenes, metadata, meta})
 * @param {number} [p.now]
 */
export function buildReport({
  slug,
  platform,
  strict,
  pool,
  snapshot,
  baseline,
  limits,
  content,
  now = Date.now(),
}) {
  const thresholds = pool.thresholds || {};

  const findings = [];
  const addFinding = (finding) => findings.push(finding);

  // ─── Pool freshness ───
  const poolFreshness = evaluatePoolFreshness(pool, now);
  if (poolFreshness.level === "fail") {
    addFinding({
      id: "pool-age-fail",
      scope: "pool",
      tag: null,
      defaultLevel: "warn",
      strictLevel: "fail",
      message: `Pool is ${poolFreshness.ageDays}d old (> ${poolFreshness.failDays}d fail threshold) — refresh before publishing`,
    });
  } else if (poolFreshness.level === "warn") {
    addFinding({
      id: "pool-age-warn",
      scope: "pool",
      tag: null,
      defaultLevel: "warn",
      strictLevel: "warn",
      message: `Pool is ${poolFreshness.ageDays}d old (> ${poolFreshness.warnDays}d warn threshold)`,
    });
  }

  // ─── Snapshot freshness ───
  let snapshotReport = {
    present: false,
    path: null,
    snapshotDate: null,
    ageDays: null,
    level: "unknown",
    matched: [],
  };
  if (!snapshot) {
    addFinding({
      id: "snapshot-missing",
      scope: "snapshot",
      tag: null,
      defaultLevel: "warn",
      strictLevel: "warn",
      message:
        "No trending snapshot found — pool-only mode; run snapshot-trending.mjs before the next publish",
    });
  } else {
    const snap = snapshot.snapshot;
    const snapAge = ageDays(snap.snapshotDate, now);
    const snapLevel = freshnessLevel(
      snapAge,
      thresholds.snapshotWarnDays,
      thresholds.snapshotFailDays,
    );
    snapshotReport = {
      present: true,
      path: snapshot.path,
      snapshotDate: snap.snapshotDate ?? null,
      ageDays: snapAge,
      level: snapLevel,
      matched: [],
    };
    if (snapLevel === "fail") {
      addFinding({
        id: "snapshot-age-fail",
        scope: "snapshot",
        tag: null,
        defaultLevel: "warn",
        strictLevel: "fail",
        message: `Trending snapshot is ${snapAge}d old (> ${thresholds.snapshotFailDays}d fail threshold) — re-run snapshot-trending.mjs`,
      });
    } else if (snapLevel === "warn") {
      addFinding({
        id: "snapshot-age-warn",
        scope: "snapshot",
        tag: null,
        defaultLevel: "warn",
        strictLevel: "warn",
        message: `Trending snapshot is ${snapAge}d old (> ${thresholds.snapshotWarnDays}d warn threshold)`,
      });
    }

    const keywords = collectKeywords(content.meta, content.metadata);
    const matched = matchTrendingTags(snap.trendingTags || [], keywords);
    snapshotReport.matched = matched.map((tag) => tag.name);
    for (const tag of matched) {
      const normalized = normalizeTag(tag.name);
      if (normalized && !baseline.includes(normalized)) {
        addFinding({
          id: "trending-unmatched",
          scope: "trending",
          tag: normalized,
          defaultLevel: "warn",
          strictLevel: "warn",
          message: `Trending tag ${normalized} (${tag.views || "?"} views) is not in the baseline — consider metadata.trendingHashtags`,
        });
      }
    }
  }

  // ─── Blocking checks (fail even without --strict) ───
  const blacklist = (pool.blacklist || []).map((t) => normalizeTag(t));
  const blacklistedHit = baseline.filter((tag) => blacklist.includes(tag));
  for (const tag of blacklistedHit) {
    addFinding({
      id: "blacklisted",
      scope: "blacklist",
      tag,
      defaultLevel: "fail",
      strictLevel: "fail",
      message: `${tag} is blacklisted — remove it from metadata.hashtags`,
    });
  }

  if (baseline.length < limits.min || baseline.length > limits.max) {
    addFinding({
      id: "count-out-of-range",
      scope: "count",
      tag: null,
      defaultLevel: "fail",
      strictLevel: "fail",
      message: `Tag count ${baseline.length} is outside platform profile range ${limits.min}-${limits.max}`,
    });
  }

  // ─── Per-tag checks ───
  const baselineCandidates = baseline.map((tag) => {
    const entry = lookupTag(pool, tag);
    const reasons = [];
    const tagFindings = [];

    if (!entry) {
      tagFindings.push({
        id: "tag-absent",
        scope: "pool",
        tag,
        defaultLevel: "warn",
        strictLevel: "fail",
        message: `${tag} is not in the pool — unverified. Research: node scripts/short-video/research-hashtags.mjs --tags ${tag.slice(1)}; then node scripts/short-video/tag-pool.mjs ingest --from <research.json>`,
      });
      reasons.push("unverified, not in pool");
    } else {
      const freshness = evaluateTagFreshness(entry, thresholds, now);
      if (freshness.level === "fail") {
        tagFindings.push({
          id: "tag-age-fail",
          scope: "tag",
          tag,
          defaultLevel: "warn",
          strictLevel: "fail",
          message: `${tag} data is ${freshness.ageDays}d old (> ${thresholds.tagFailDays}d fail threshold)`,
        });
        reasons.push(`data aged ${freshness.ageDays}d`);
      } else if (freshness.level === "warn") {
        tagFindings.push({
          id: "tag-age-warn",
          scope: "tag",
          tag,
          defaultLevel: "warn",
          strictLevel: "warn",
          message: `${tag} data is ${freshness.ageDays}d old (> ${thresholds.tagWarnDays}d warn threshold)`,
        });
        reasons.push(`data aged ${freshness.ageDays}d`);
      }

      const isTrafficLike = entry.kind === "traffic" || entry.kind === "niche";
      if (entry.grade === "C" && isTrafficLike) {
        tagFindings.push({
          id: "grade-c-traffic",
          scope: "tag",
          tag,
          defaultLevel: "warn",
          strictLevel: "fail",
          message: `${tag} is a ${entry.kind} tag with grade C (no numeric data) — verify traffic before use`,
        });
        reasons.push("grade C: no numeric data");
      } else if (entry.grade === "C") {
        tagFindings.push({
          id: "grade-c-entity",
          scope: "tag",
          tag,
          defaultLevel: "warn",
          strictLevel: "warn",
          message: `${tag} is ${entry.kind} grade C (existence-only) — allowed for entity/brand tags`,
        });
        reasons.push("existence-only entity/brand");
      }

      if (entry.status === "deprecated") reasons.push("status: deprecated");
      if (entry.status === "blacklisted") reasons.push("status: blacklisted");
    }

    for (const finding of tagFindings) addFinding(finding);

    const verdict = blacklist.includes(tag) ? "drop" : "keep";
    return {
      tag,
      inPool: Boolean(entry),
      kind: entry?.kind ?? "unknown",
      views: entry?.views ?? null,
      posts: entry?.posts ?? null,
      avgViewsPerPost: entry?.avgViewsPerPost ?? null,
      viewsText: entry?.viewsText ?? null,
      postsText: entry?.postsText ?? null,
      grade: entry?.grade ?? "C",
      status: entry?.status ?? "unverified",
      ageDays: entry ? ageDays(entry.sampledAt, now) : null,
      verdict,
      reason: reasons.length > 0 ? reasons.join("; ") : "in pool, metrics acceptable",
    };
  });

  // ─── Suggested adds: pool tags not in baseline, ranked ───
  const baselineSet = new Set(baseline);
  const suggestions = pool.tags
    .filter((entry) => !baselineSet.has(entry.tag))
    .map((entry) => ({ entry, score: rankScore(entry), views: entry.views ?? -1 }))
    .sort((a, b) => a.score - b.score || b.views - a.views)
    .map(({ entry }) => ({
      tag: entry.tag,
      inPool: true,
      kind: entry.kind,
      views: entry.views,
      posts: entry.posts,
      avgViewsPerPost: entry.avgViewsPerPost,
      viewsText: entry.viewsText,
      postsText: entry.postsText,
      grade: entry.grade,
      status: entry.status,
      ageDays: ageDays(entry.sampledAt, now),
      verdict: "add",
      reason: `pool suggestion (${entry.kind}, grade ${entry.grade})`,
    }));

  // Candidate list: baseline first, top up to profile max; never below min
  // where suggestions exist.
  const candidates = [...baselineCandidates];
  for (const suggestion of suggestions) {
    if (candidates.length >= limits.max) break;
    candidates.push(suggestion);
  }

  // ─── Resolve severity per mode ───
  const resolvedFindings = findings.map((finding) => ({
    ...finding,
    level: strict ? finding.strictLevel : finding.defaultLevel,
  }));
  const blocking = resolvedFindings.filter((f) => f.level === "fail");
  const warnings = resolvedFindings.filter((f) => f.level === "warn");

  let verdict;
  if (blocking.length > 0) {
    verdict = `FAIL(${blocking[0].message})`;
  } else if (warnings.length > 0) {
    verdict = "PASS(warn)";
  } else {
    verdict = "PASS";
  }

  const exitCode = blocking.length > 0 ? 1 : 0;

  return {
    slug,
    platform,
    strict,
    limits,
    pool: {
      path: pool.__poolPath ?? null,
      updatedAt: pool.updatedAt ?? null,
      ageDays: poolFreshness.ageDays,
      level: poolFreshness.level,
    },
    snapshot: snapshotReport,
    baseline,
    candidates,
    findings: resolvedFindings,
    verdict,
    exitCode,
  };
}

/**
 * Loads the platform profile, derives the baseline via deriveHashtags
 * (limits from the profile), then delegates to buildReport.
 */
export function evaluatePreflight({
  slug,
  platform,
  strict,
  pool,
  snapshot,
  content,
  now = Date.now(),
}) {
  const profile = getPlatformProfile(platform);
  const limits = { min: profile.hashtags.min, max: profile.hashtags.max };
  const enriched = enrichMetadata(content.metadata, content.meta);
  const baseline = deriveHashtags(content.scenes, enriched, limits);
  return buildReport({ slug, platform, strict, pool, snapshot, baseline, limits, content, now });
}

// ─── Reporting ───

function renderHuman(report) {
  const lines = [];
  lines.push(
    `🏷️  Hashtag preflight — ${report.slug} (${report.platform}${report.strict ? ", strict" : ""})`,
  );
  lines.push(
    `Pool: ${report.pool.path ?? "(default)"} | updatedAt ${report.pool.updatedAt ?? "—"} | age ${report.pool.ageDays === null ? "?" : `${report.pool.ageDays}d`} (${report.pool.level})`,
  );
  if (report.snapshot.present) {
    lines.push(
      `Snapshot: ${report.snapshot.path} | ${report.snapshot.snapshotDate ?? "—"} | age ${report.snapshot.ageDays === null ? "?" : `${report.snapshot.ageDays}d`} (${report.snapshot.level})`,
    );
  } else {
    lines.push("Snapshot: none — pool-only mode");
  }
  lines.push(
    `Baseline (${report.baseline.length}/${report.limits.min}-${report.limits.max}): ${report.baseline.join(" ")}`,
  );
  lines.push("");
  lines.push("Candidates:");
  for (const candidate of report.candidates) {
    const metrics = metricString(candidate);
    lines.push(
      `  ${candidate.tag} | ${candidate.kind} | ${metrics} | grade ${candidate.grade} | ${candidate.verdict} | ${candidate.reason}`,
    );
  }
  lines.push("");
  for (const finding of report.findings) {
    const icon = finding.level === "fail" ? "✖" : "⚠️";
    lines.push(`  ${icon} [${finding.id}] ${finding.message}`);
  }
  lines.push("");
  lines.push(report.verdict);
  return lines.join("\n");
}

// ─── CLI entry ───

export async function runCli(args, opts = {}) {
  const { flags } = parseArgs(args);

  if (!flags.content) {
    console.error(
      "usage: node scripts/short-video/tag-preflight.mjs --content <slug> [--platform tiktok] [--strict] [--json] [--pool <path>] [--snapshot <path>] [--out <path>]",
    );
    return 2;
  }

  const slug = String(flags.content);
  const platform = String(flags.platform || "tiktok");
  const strict = Boolean(flags.strict);
  const asJson = Boolean(flags.json);
  const poolPath = opts.poolPath || (flags.pool ? resolve(flags.pool) : DEFAULT_POOL_PATH);

  let pool;
  try {
    pool = loadPool(poolPath);
  } catch (error) {
    const message = `Pool ${error.code === "POOL_MISSING" ? "missing" : "corrupt"}: ${error.message}`;
    if (asJson) {
      console.log(
        JSON.stringify({
          exitCode: 2,
          verdict: "FAIL",
          errors: [message],
          nextCommands: ["node scripts/short-video/tag-pool.mjs validate"],
        }),
      );
    } else {
      console.error(`✖ ${message}`);
      console.error("  Refresh: node scripts/short-video/tag-pool.mjs validate");
    }
    return 2;
  }
  pool.__poolPath = poolPath;

  const poolValidation = validatePool(pool);
  if (!poolValidation.valid) {
    const message = `Pool schema invalid: ${poolValidation.errors.map((e) => e.message).join("; ")}`;
    if (asJson) {
      console.log(JSON.stringify({ exitCode: 2, verdict: "FAIL", errors: [message] }));
    } else {
      console.error(`✖ ${message}`);
    }
    return 2;
  }

  let content;
  try {
    content = await loadContentPack(slug);
  } catch (error) {
    if (error instanceof PreflightHardError) {
      if (asJson) {
        console.log(JSON.stringify({ exitCode: 2, verdict: "FAIL", errors: [error.message] }));
      } else {
        console.error(`✖ ${error.message}`);
      }
      return 2;
    }
    throw error;
  }

  let snapshot;
  try {
    snapshot = findSnapshot(flags.snapshot ? resolve(flags.snapshot) : null);
  } catch (error) {
    snapshot = null;
    if (!asJson) console.warn(`⚠️  Snapshot lookup failed: ${error.message}`);
  }

  let report;
  try {
    report = evaluatePreflight({ slug, platform, strict, pool, snapshot, content, now: opts.now });
  } catch (error) {
    if (error instanceof UnknownPlatformError) {
      if (asJson) {
        console.log(JSON.stringify({ exitCode: 2, verdict: "FAIL", errors: [error.message] }));
      } else {
        console.error(`✖ ${error.message}`);
      }
      return 2;
    }
    throw error;
  }

  if (flags.out) {
    const outPath = resolve(flags.out);
    mkdirSync(dirname(outPath), { recursive: true });
    writeJsonAtomic(outPath, report);
  }

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(renderHuman(report));
  }
  return report.exitCode;
}

const isMainModule =
  Boolean(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  runCli(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(`✖ ${error.message}`);
      process.exitCode = 2;
    });
}
