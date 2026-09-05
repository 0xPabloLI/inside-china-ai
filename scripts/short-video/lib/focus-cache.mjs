/**
 * Focus-detection result cache (#100 P7) — persists focus_detector.py
 * outputs keyed by source content + analyzer version, so pipeline reruns
 * skip the ~0.5s/asset OpenCV analysis instead of rerunning it every pass.
 *
 * Uses the unified analysis envelope from #100 (same shape as vlm-cache):
 *   { ok: true, data: <focus result>, error: null,
 *     meta: { analyzerVersion, durationMs, generatedAt } }
 *
 * Failure policy: "degraded" results are refused at this layer —
 * degraded means a transient dependency/read failure, and a rerun must
 * retry detection rather than pin the failure. Deterministic outcomes
 * (ok / partial / low_information / unsupported) are safe to persist:
 * "unsupported" is a property of the source file (e.g. video passed to
 * an image-focused analyzer), not a transient failure, and the cache key
 * changes if the file changes.
 *
 * Layout and invalidation mirror vlm-cache.mjs: one JSON file per entry,
 * atomic tmp+rename writes, corrupted/missing/legacy entries are misses.
 *
 * @module focus-cache
 */

import { createHash } from "crypto";
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { fileFingerprint } from "./vlm-cache.mjs";

/**
 * Bump when focus_detector.py analysis semantics change in a way that
 * alters results (detector model, thresholds, output shape).
 */
export const FOCUS_ANALYZER_VERSION = "v1-2026-09-05";

/**
 * Compute the cache key for one focus analysis request.
 *
 * @param {{filePath: string}} req
 * @returns {Promise<string>} 64-char hex sha256
 */
export async function computeFocusCacheKey(req) {
  const h = createHash("sha256");
  h.update(FOCUS_ANALYZER_VERSION + "\n");
  h.update(fileFingerprint(req.filePath) + "\n");
  return h.digest("hex");
}

/**
 * Read a cached focus result. Returns `{ data, meta }` with
 * `meta.cacheHit = true` on hit, or null on miss/corruption/legacy entry.
 *
 * @param {string|null} cacheDir
 * @param {string|null} key
 */
export function getCachedFocusResult(cacheDir, key) {
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
 * Write a focus result atomically. Failures warn but never throw —
 * a broken cache must not degrade the pipeline.
 *
 * @param {string|null} cacheDir
 * @param {string|null} key
 * @param {{data: object, meta?: object}} opts
 */
export function writeCachedFocusResult(cacheDir, key, opts) {
  if (!cacheDir || !key) return;
  if (opts?.data?.status === "degraded") {
    console.warn("  ⚠️  Focus cache: not persisting degraded result — rerun will retry");
    return;
  }
  try {
    const meta = {
      ...(opts?.meta || {}),
      analyzerVersion: FOCUS_ANALYZER_VERSION,
      generatedAt: new Date().toISOString(),
    };
    const entry = { ok: true, data: opts?.data, error: null, meta };
    mkdirSync(cacheDir, { recursive: true });
    const file = join(cacheDir, `${key}.json`);
    const tmp = join(cacheDir, `.${key}.${process.pid}.tmp`);
    writeFileSync(tmp, JSON.stringify(entry), "utf-8");
    renameSync(tmp, file);
  } catch (err) {
    console.warn(`  ⚠️  Focus cache write failed: ${err.message}`);
  }
}
