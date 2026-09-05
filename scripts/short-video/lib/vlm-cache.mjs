/**
 * VLM result cache (#189, envelope v2 #100) — persists analyzeAssetSemantics
 * outputs keyed by prompt version + pipeline version + model + file content
 * hash + window/claim, so pipeline reruns skip the 30-120s VLM inference
 * entirely.
 *
 * Entries use the unified analysis envelope from #100:
 *   { ok: true, data: <semantics>, error: null,
 *     meta: { model, durationMs, ..., promptVersion, pipelineVersion, generatedAt } }
 * Failures are never persisted (writeCachedResult refuses non-ok results),
 * so a cached hit is always a previously-successful analysis.
 *
 * Layout: one JSON file per entry at {cacheDir}/{key}.json, written
 * atomically (tmp + rename). A corrupted, missing, or legacy (pre-envelope)
 * entry is a cache miss.
 *
 * Invalidation: bump VLM_CACHE_PROMPT_VERSION whenever the Python prompt,
 * parser, or response semantics change in a way that alters results, and
 * VLM_CACHE_PIPELINE_VERSION when the key/composition or pipeline-side
 * semantics change. The model ID is part of the key, so switching 2B/9B
 * models never serves stale entries.
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
 * Bump when the pipeline-side analysis semantics change (envelope format,
 * downstream consumption contract) in ways the prompt version does not
 * capture. Part of the cache key (#100: source bytes + profile + model +
 * promptVersion + pipelineVersion).
 */
export const VLM_CACHE_PIPELINE_VERSION = "v2-2026-09-05";

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
 * Content fingerprint for cache keys: full SHA-256 of source bytes for
 * files up to LARGE_FILE_FULL_HASH_THRESHOLD, size+mtime fingerprint above.
 * Shared with the focus cache (#100) so both layers agree on the
 * "source bytes" material of the key.
 */
export function fileFingerprint(filePath) {
  const st = statSync(filePath);
  if (st.size > LARGE_FILE_FULL_HASH_THRESHOLD) {
    return `size:${st.size}:mtime:${Math.floor(st.mtimeMs)}`;
  }
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

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

/**
 * Compute the cache key for one VLM analysis request.
 *
 * @param {{filePath: string, model: string, pipelineVersion?: string,
 *          window?: {startMs: number, endMs: number, sampleFps: number},
 *          claim?: {voiceover: string, assetNeed: string}}} req
 * @returns {Promise<string>} 64-char hex sha256
 */
export async function computeCacheKey(req) {
  const pipelineVersion = req.pipelineVersion ?? VLM_CACHE_PIPELINE_VERSION;
  const h = createHash("sha256");
  h.update(VLM_CACHE_PROMPT_VERSION + "\n");
  h.update(pipelineVersion + "\n");
  h.update(String(req.model || "") + "\n");
  h.update(fileFingerprint(req.filePath) + "\n");
  h.update(stableStringify({ window: req.window || null, claim: req.claim || null }));
  return h.digest("hex");
}

/**
 * Read a cached analysis result. Returns `{ data, meta }` with
 * `meta.cacheHit = true` on hit, or null on miss, corruption, or a legacy
 * pre-envelope entry (#189-era raw semantics objects are treated as misses
 * and get overwritten on the next write path).
 *
 * @param {string|null} cacheDir
 * @param {string|null} key
 */
export function getCachedResult(cacheDir, key) {
  if (!cacheDir || !key) return null;
  const file = join(cacheDir, `${key}.json`);
  if (!existsSync(file)) return null;
  try {
    const entry = JSON.parse(readFileSync(file, "utf-8"));
    if (!entry || entry.ok !== true) return null;
    return { data: entry.data, meta: { ...(entry.meta || {}), cacheHit: true } };
  } catch {
    return null;
  }
}

/**
 * Write a successful analysis result atomically in the unified envelope.
 * Failures warn but never throw (except refusing to persist an error —
 * a failed result must never become a success hit). Callers only invoke
 * this after a successful analysis; the guard is defense in depth.
 *
 * @param {string|null} cacheDir
 * @param {string|null} key
 * @param {{data: object, meta?: object,
 *          ok?: boolean, error?: unknown}} opts
 */
export function writeCachedResult(cacheDir, key, opts) {
  if (!cacheDir || !key) return;
  if (opts?.ok === false || opts?.error) {
    throw new Error("refusing to cache a failed analysis result (#100 failure policy)");
  }
  try {
    const meta = {
      ...(opts?.meta || {}),
      promptVersion: VLM_CACHE_PROMPT_VERSION,
      pipelineVersion: VLM_CACHE_PIPELINE_VERSION,
      generatedAt: new Date().toISOString(),
    };
    const entry = { ok: true, data: opts?.data, error: null, meta };
    mkdirSync(cacheDir, { recursive: true });
    const file = join(cacheDir, `${key}.json`);
    const tmp = join(cacheDir, `.${key}.${process.pid}.tmp`);
    writeFileSync(tmp, JSON.stringify(entry), "utf-8");
    renameSync(tmp, file);
  } catch (err) {
    console.warn(`  ⚠️  VLM cache write failed: ${err.message}`);
  }
}
