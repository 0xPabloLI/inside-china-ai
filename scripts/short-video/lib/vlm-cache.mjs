/**
 * VLM result cache (#189) — persists analyzeAssetSemantics outputs keyed by
 * prompt version + model + file content hash + window/claim, so pipeline
 * reruns skip the 30-120s VLM inference entirely.
 *
 * Layout: one JSON file per entry at {cacheDir}/{key}.json, written
 * atomically (tmp + rename). A corrupted or missing entry is a cache miss.
 *
 * Invalidation: bump VLM_CACHE_PROMPT_VERSION whenever the Python prompt,
 * parser, or response semantics change in a way that alters results.
 * The model ID is part of the key, so switching 2B/9B models never
 * serves stale entries.
 *
 * @module vlm-cache
 */

import { createHash } from "crypto";
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, statSync } from "fs";
import { join } from "path";

/**
 * Bump when vlm_analyzer.py prompts/parse semantics change so cached
 * results are no longer reproducible.
 */
export const VLM_CACHE_PROMPT_VERSION = "v1-2026-09-04";

/**
 * Files larger than this use a size+mtime fingerprint instead of a full
 * content hash (#189). Video assets can be hundreds of MB; reading them
 * whole for a cache key would dwarf the VLM inference we are trying to
 * skip. The cache is a performance optimization only, so the rare
 * content change with identical size+mtime (false hit) is acceptable —
 * it is overwritten on the next miss path.
 */
const LARGE_FILE_FULL_HASH_THRESHOLD = 16 * 1024 * 1024;

/**
 * Deterministic JSON stringify (sorted keys, drops undefined) so identical
 * window/claim objects always hash to the same cache key.
 */
function stableStringify(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value)
    .filter((k) => value[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
}

function fileFingerprint(filePath) {
  const st = statSync(filePath);
  if (st.size > LARGE_FILE_FULL_HASH_THRESHOLD) {
    return `size:${st.size}:mtime:${Math.floor(st.mtimeMs)}`;
  }
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

/**
 * Compute the cache key for one VLM analysis request.
 *
 * @param {{filePath: string, model: string, window?: {startMs: number, endMs: number, sampleFps: number}, claim?: {voiceover: string, assetNeed: string}}} req
 * @returns {Promise<string>} 64-char hex sha256
 */
export async function computeCacheKey(req) {
  const h = createHash("sha256");
  h.update(VLM_CACHE_PROMPT_VERSION + "\n");
  h.update(String(req.model || "") + "\n");
  h.update(fileFingerprint(req.filePath) + "\n");
  h.update(stableStringify({ window: req.window || null, claim: req.claim || null }));
  return h.digest("hex");
}

/**
 * Read a cached semantics result. Returns null on miss or corruption.
 *
 * @param {string|null} cacheDir
 * @param {string|null} key
 */
export function getCachedSemantics(cacheDir, key) {
  if (!cacheDir || !key) return null;
  const file = join(cacheDir, `${key}.json`);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Write a semantics result atomically. Failures warn but never throw —
 * a broken cache must not degrade the pipeline.
 *
 * @param {string|null} cacheDir
 * @param {string|null} key
 * @param {object} value
 */
export function writeCachedSemantics(cacheDir, key, value) {
  if (!cacheDir || !key) return;
  try {
    mkdirSync(cacheDir, { recursive: true });
    const file = join(cacheDir, `${key}.json`);
    const tmp = join(cacheDir, `.${key}.${process.pid}.tmp`);
    writeFileSync(tmp, JSON.stringify(value), "utf-8");
    renameSync(tmp, file);
  } catch (err) {
    console.warn(`  ⚠️  VLM cache write failed: ${err.message}`);
  }
}
