/**
 * Used-Asset Index — cross-content deduplication for asset-sourcer.
 *
 * Builds an index of media assets already used by previous content packages:
 *   - sha256 (truncated) of every file under content/<slug>/assets/
 *   - canonicalized image/video URLs from content/<slug>/research/media-cache.json
 *
 * asset-sourcer uses the index to cap cross-content reuse (≤40% of what gets
 * assigned in one run — see spec D7) so videos don't keep showing the same
 * stock imagery.
 *
 * All filesystem access degrades gracefully: missing directories, broken
 * JSON, and unreadable files contribute nothing instead of throwing.
 *
 * @module used-asset-index
 */

import { createHash } from "crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { canonicalizeUrl } from "./url-normalizer.mjs";

/** Truncated hash length (hex chars) — 64 bits, collision-negligible here. */
const HASH_CHARS = 16;

/**
 * Compute the truncated sha256 of a file's bytes.
 *
 * @param {string} filePath
 * @returns {string} Hex digest prefix
 * @throws {Error} If the file cannot be read
 */
function fileHash(filePath) {
  const bytes = readFileSync(filePath);
  return createHash("sha256").update(bytes).digest("hex").slice(0, HASH_CHARS);
}

/**
 * Build the used-asset index by scanning sibling content directories.
 *
 * @param {Object} opts
 * @param {string} opts.contentRoot - Path to the content/ directory
 * @param {string|null} opts.currentSlug - Slug to exclude (its own assets are
 *   not "reuse" from its own perspective)
 * @returns {{hashes: Set<string>, urls: Set<string>, fileCount: number}}
 */
export function buildUsedAssetIndex({ contentRoot, currentSlug } = {}) {
  const index = { hashes: new Set(), urls: new Set(), fileCount: 0 };
  if (!contentRoot || !existsSync(contentRoot)) return index;

  let slugs;
  try {
    slugs = readdirSync(contentRoot);
  } catch {
    return index;
  }

  for (const slug of slugs) {
    if (slug === currentSlug) continue;
    const dir = join(contentRoot, slug);

    let isDir = false;
    try {
      isDir = statSync(dir).isDirectory();
    } catch {
      continue;
    }
    if (!isDir) continue;

    // ── assets/ file hashes ──
    const assetsDir = join(dir, "assets");
    if (existsSync(assetsDir)) {
      let files = [];
      try {
        files = readdirSync(assetsDir);
      } catch {
        files = [];
      }
      for (const name of files) {
        const filePath = join(assetsDir, name);
        try {
          if (!statSync(filePath).isFile()) continue;
          index.hashes.add(fileHash(filePath));
          index.fileCount++;
        } catch {
          continue; // unreadable entry — skip, keep scanning
        }
      }
    }

    // ── media-cache.json URLs ──
    const cachePath = join(dir, "research", "media-cache.json");
    if (existsSync(cachePath)) {
      try {
        const data = JSON.parse(readFileSync(cachePath, "utf8"));
        const entries = Array.isArray(data?.entries) ? data.entries : [];
        for (const entry of entries) {
          const images = Array.isArray(entry?.images) ? entry.images : [];
          for (const img of images) {
            const canonical = canonicalizeUrl(img?.url);
            if (canonical) index.urls.add(canonical);
          }
          const videos = Array.isArray(entry?.videos) ? entry.videos : [];
          for (const vid of videos) {
            const canonical = canonicalizeUrl(vid?.url);
            if (canonical) index.urls.add(canonical);
          }
        }
      } catch {
        // broken cache — contributes nothing, keep going
      }
    }
  }

  return index;
}

/**
 * Check whether a candidate asset was already used by previous content.
 *
 * Matches by canonicalized URL against the URL set, and by file content
 * hash against the hash set. `hash` (precomputed) takes precedence over
 * reading `filePath` from disk.
 *
 * @param {Object} candidate - { url?, filePath?, hash? }
 * @param {{hashes: Set<string>, urls: Set<string>}|null} index
 * @returns {boolean} true if the asset matches the used-asset index
 */
export function isReusedAsset(candidate, index) {
  if (!candidate || !index) return false;

  if (candidate.url) {
    const canonical = canonicalizeUrl(candidate.url);
    if (canonical && index.urls.has(canonical)) return true;
  }

  let hash = candidate.hash || null;
  if (!hash && candidate.filePath && existsSync(candidate.filePath)) {
    try {
      hash = fileHash(candidate.filePath);
    } catch {
      hash = null;
    }
  }
  return !!(hash && index.hashes.has(hash));
}
