/**
 * used-topics.mjs — "what has already been produced" registry for trend selection.
 *
 * Trend research (`search-sources.mjs --trend`) scrapes the outside world only;
 * it has no idea which topics already exist as content packages. That gap made
 * the 2026-11-17 selection re-recommend `minimax-h3-image` and `qwen4-gamefeel`,
 * both already built and published.
 *
 * This module walks `scripts/short-video/content/`, reads each package's
 * `meta.mjs` (topics + keyEntities) or falls back to the slug, and returns the
 * exclusion material the selection agent needs. Read-only: never writes into
 * `content/` and never downloads anything.
 *
 * Publish state is best-effort: `output/pending-analysis.json` only carries the
 * most recent published video, so `published` here means "matched that record",
 * not "provably published".
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const META_FILE = "meta.mjs";
const SCENE_FILE = "scene-data.mjs";

const readJsonSafe = (path) => {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
};

const tokenize = (value) =>
  String(value ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((part) => part.length >= 2);

/**
 * Read the published record. The file may hold one object, an array, or
 * `{ videos: [...] }`; whatever the shape, we only need slugs / video paths.
 */
const loadPublishedSlugs = (publishedRecordPath) => {
  const record = readJsonSafe(publishedRecordPath);
  if (!record) return { slugs: new Set(), publishedAt: new Map() };

  const entries = Array.isArray(record)
    ? record
    : Array.isArray(record.videos)
      ? record.videos
      : [record];

  const slugs = new Set();
  const publishedAt = new Map();
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const date = entry.publishedAt ?? null;
    if (typeof entry.slug === "string" && entry.slug) {
      slugs.add(entry.slug);
      if (date) publishedAt.set(entry.slug, date);
    }
    if (typeof entry.videoPath === "string") {
      // A published video lives under output/<slug>/, a package under content/<slug>/;
      // accept both so the record shape never silently disables the flag.
      const match = entry.videoPath.match(/\/(?:content|output)\/([^/]+)\//);
      if (match) {
        slugs.add(match[1]);
        if (date) publishedAt.set(match[1], date);
      }
    }
  }
  return { slugs, publishedAt };
};

const loadMeta = async (metaPath) => {
  try {
    const module = await import(pathToFileURL(metaPath).href);
    const meta = module?.meta;
    return meta && typeof meta === "object" ? meta : {};
  } catch {
    // A broken package must not stop the registry: the slug still counts.
    return {};
  }
};

const entityValues = (meta) => {
  const entities = meta?.keyEntities;
  if (!entities || typeof entities !== "object") {
    return { companies: [], people: [], models: [] };
  }
  const take = (key) =>
    Array.isArray(entities[key]) ? entities[key].map((v) => String(v)).filter(Boolean) : [];
  return { companies: take("companies"), people: take("people"), models: take("models") };
};

const isPackageDir = (dir) => existsSync(join(dir, META_FILE)) || existsSync(join(dir, SCENE_FILE));

/**
 * Collect every built content package.
 *
 * @param {{ contentDir: string, publishedRecordPath?: string }} options
 * @returns {Promise<{ contentDir: string, count: number, packages: object[] }>}
 */
export async function collectUsedPackages({ contentDir, publishedRecordPath } = {}) {
  if (!contentDir || !existsSync(contentDir)) {
    const error = new Error(`content 目录不存在：${contentDir}`);
    error.code = "ENOENT_CONTENT_DIR";
    throw error;
  }

  const { slugs: publishedSlugs, publishedAt } = publishedRecordPath
    ? loadPublishedSlugs(publishedRecordPath)
    : { slugs: new Set(), publishedAt: new Map() };

  const entries = readdirSync(contentDir, { withFileTypes: true });
  const packages = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith("_")) continue; // gate smoke / scratch dirs
    const dir = join(contentDir, entry.name);
    if (!isPackageDir(dir)) continue;

    const metaPath = join(dir, META_FILE);
    const meta = existsSync(metaPath) ? await loadMeta(metaPath) : {};
    const published = publishedSlugs.has(entry.name);

    packages.push({
      slug: entry.name,
      pipelineId: typeof meta.pipelineId === "string" ? meta.pipelineId : entry.name,
      title: typeof meta.title === "string" ? meta.title : "",
      createdAt: typeof meta.createdAt === "string" ? meta.createdAt : "",
      topics: Array.isArray(meta.topics) ? meta.topics.map(String) : [],
      entities: entityValues(meta),
      hasSceneData: existsSync(join(dir, SCENE_FILE)),
      published,
      publishedAt: publishedAt.get(entry.name) ?? null,
      dir,
      mtime: statSync(dir).mtime.toISOString(),
    });
  }

  packages.sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.slug.localeCompare(b.slug),
  );

  return { contentDir, count: packages.length, packages };
}

/**
 * Exclusion tokens for one package: the slug, its parts, its topics and its
 * entity names. The agent compares these against candidate topic titles; it
 * is deliberately not a fuzzy matcher, because a silent false positive here
 * would drop a genuinely new topic off the list.
 */
export function extractTokens(pkg) {
  const raw = [
    pkg?.slug,
    ...(pkg?.topics ?? []),
    ...(pkg?.entities?.companies ?? []),
    ...(pkg?.entities?.models ?? []),
    ...(pkg?.entities?.people ?? []),
  ];
  const tokens = new Set();
  for (const value of raw) {
    const full = String(value ?? "")
      .toLowerCase()
      .trim();
    if (full) tokens.add(full);
    for (const part of tokenize(value)) tokens.add(part);
  }
  return [...tokens];
}

export function formatUsedLine(pkg) {
  const state = pkg.published
    ? `published${pkg.publishedAt ? `@${pkg.publishedAt.slice(0, 10)}` : ""}`
    : "已建包未发布";
  const topics = (pkg.topics ?? []).join(", ") || "-";
  return `- ${pkg.slug}｜${pkg.title || "（无标题）"}｜${pkg.createdAt || "-"}｜${state}｜topics: ${topics}`;
}

/** Machine shape consumed by the selection step (and by --out). */
export async function buildUsedTopicsReport({ contentDir, publishedRecordPath } = {}) {
  const result = await collectUsedPackages({ contentDir, publishedRecordPath });
  const packages = result.packages.map((pkg) => ({ ...pkg, tokens: extractTokens(pkg) }));
  return {
    generatedAt: new Date().toISOString(),
    contentDir: result.contentDir,
    count: packages.length,
    publishedCount: packages.filter((p) => p.published).length,
    exclusionSlugs: packages.map((p) => p.slug),
    exclusionTokens: [...new Set(packages.flatMap((p) => p.tokens))],
    packages,
  };
}

/**
 * Write the exclusion report next to the trend artifact, so the selection step
 * reads it from the same directory as `trending-topics.json`.
 *
 * Fail-open by contract: trend discovery must not die because one package's
 * `meta.mjs` throws or the content directory is absent. The caller gets
 * `{ ok: false, reason }` and decides what to print; nothing is thrown.
 *
 * @param {{ contentDir?: string, publishedRecordPath?: string, outPath: string }} options
 */
export async function writeUsedTopicsArtifact({ contentDir, publishedRecordPath, outPath }) {
  if (!outPath) throw new TypeError("writeUsedTopicsArtifact: outPath is required");
  try {
    const report = await buildUsedTopicsReport({ contentDir, publishedRecordPath });
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n", "utf8");
    return {
      ok: true,
      outPath,
      count: report.count,
      publishedCount: report.publishedCount,
      exclusionSlugs: report.exclusionSlugs,
    };
  } catch (error) {
    return { ok: false, outPath, reason: error?.message ?? String(error) };
  }
}
