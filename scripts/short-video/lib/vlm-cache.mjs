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
 * Reclaim (#992): a version bump makes every older entry unreachable, so the
 * cache only grows. Entries are never deleted automatically — `pruneVlmCache`
 * is the explicit path (dry-run by default, only {@link scanVlmCache}'s
 * orphans are removed), and `warnStaleCacheEntries` reports the reclaimable
 * count when a run starts writing to a cache directory.
 *
 * @module vlm-cache
 */

import { createHash } from "crypto";
import {
  readFileSync,
  writeFileSync,
  renameSync,
  mkdirSync,
  existsSync,
  statSync,
  readdirSync,
  unlinkSync,
  realpathSync,
} from "fs";
import { join } from "path";
import { containedPath } from "./path-safety.mjs";

/**
 * Bump when vlm_analyzer.py prompts/parse semantics change so cached
 * results are no longer reproducible.
 *
 * v2-2026-10-10 (#542 L3): the semantics prompt gained the A1 transcript
 * block for video assets — the same file + window now produces a different
 * prompt when a transcript is supplied, so pre-A1 entries must not serve.
 *
 * v3-2026-10-27 (#334): image Fit is now a single-word edge rule and the
 * redundant `## Reason` section is gone; claim mode uses a compact prompt.
 * Same asset + claim now produces a different answer shape, so v2 entries
 * must not serve.
 *
 * v4-2026-10-27 (#294): the claim relevance criterion now judges the visible
 * subject instead of demanding the abstract claim be depicted, and the new
 * second-pass subject check is a distinct prompt (keyed by `relevanceCheck`).
 * Same asset + claim scores differently and can produce a different answer
 * shape, so v3 entries must not serve.
 *
 * v5-2026-10-27 (#294): the second-pass check now states that the desired
 * visual is the standard and the narration is context (a real run judged a
 * robot arm against the named entities in the narration instead). The first
 * pass is unchanged, but one version covers both prompts.
 *
 * v6-2026-10-27 (#294): the check's match rule is now same-kind
 * ("a robot arm for 'robot arm picking up a block'"); v5 still demanded the
 * action/setting and rejected topically correct stock.
 */
export const VLM_CACHE_PROMPT_VERSION = "v6-2026-10-27";

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
 *          windows?: {startMs: number, endMs: number, sampleFps: number}[],
 *          claim?: {voiceover: string, assetNeed: string},
 *          cropFocus?: {x: number, y: number} | null,
 *          transcript?: string | null,
 *          relevanceCheck?: boolean,
 *          hookCheck?: {promise: string} | null}} req
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
  // #360: multi-window plan changes temporal coverage — a different plan is a
  // different analysis (S5: no stale hits across window-plan changes).
  h.update(stableStringify({ windows: req.windows ?? null }));
  // Crop hint changes the pixels the VLM sees — it is key material (#198).
  h.update(stableStringify({ cropFocus: req.cropFocus ?? null }));
  // The A1 transcript is prompt content (#542 L3) — a different transcript is
  // a different analysis, and an absent one must not collide with a present
  // one. Hashed (not inlined) so the key stays fixed-width.
  h.update(
    stableStringify({
      transcript: req.transcript ? createHash("sha256").update(req.transcript).digest("hex") : null,
    }),
  );
  // #294: the second-pass subject check swaps the whole prompt, so it must
  // never hit a first-pass entry (or vice versa). Absent = first pass.
  h.update(stableStringify({ relevanceCheck: req.relevanceCheck === true ? true : null }));
  // #1206: the hook payoff prompt bakes the claim into the prompt — a
  // different promise is a different analysis, and hook mode must not hit a
  // first-pass entry. Absent leaves the key byte-identical to pre-#1206, so
  // existing caches stay valid.
  if (req.hookCheck?.promise) {
    h.update(stableStringify({ hookCheck: req.hookCheck.promise }));
  }
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

/**
 * Cache entries are content-addressed: `{64-hex sha256}.json` (the key comes
 * from computeCacheKey, which always returns a sha256 hex digest). Anything
 * else in the directory is not an entry this module wrote and is never a
 * deletion candidate.
 */
const CACHE_ENTRY_RE = /^[0-9a-f]{64}\.json$/;

/**
 * Account for a cache directory without deleting anything (#992).
 *
 * Classification policy:
 *   - `{64-hex}.json` that parses and whose `meta.promptVersion` equals the
 *     current version → `current` (a future run can still hit it).
 *   - `{64-hex}.json` that parses but has a different or missing
 *     `meta.promptVersion` → `orphan` (its key was built from old prompt
 *     material, so the current version can never hit it). A missing version
 *     counts as orphan: the key cannot prove which prompt produced it.
 *   - `{64-hex}.json` that fails to parse/read → `unparsable` (kept: a file
 *     this module cannot read has not been proved stale).
 *   - `*.tmp` → in-flight atomic writes of a concurrent run (kept).
 *   - anything else → `other` (kept; not written by this module).
 *
 * `pipelineVersion` and `model` are reported for diagnosis but never decide
 * deletion — only `promptVersion` does (open question 2 in #992).
 *
 * @param {string|null} cacheDir
 */
export function scanVlmCache(cacheDir) {
  const scan = {
    cacheDir,
    exists: false,
    entries: { total: 0, current: 0, orphan: 0, unparsable: 0 },
    files: { tmp: 0, other: 0 },
    bytes: { total: 0, current: 0, orphan: 0, unparsable: 0 },
    // Null-prototype: version strings come from arbitrary on-disk JSON, so a
    // `"__proto__"` value must be an own key, not an inherited lookup.
    promptVersions: Object.create(null),
    pipelineVersions: Object.create(null),
    models: Object.create(null),
    orphans: [],
  };
  if (!cacheDir || !existsSync(cacheDir)) return scan;

  let dirents;
  let root;
  try {
    // A file at this path (a mistyped `--dir`) is not an empty cache.
    if (!statSync(cacheDir).isDirectory()) return scan;
    // realpathSync, not resolve: it canonicalizes the directory the entries
    // actually live in and gives containedPath the absolute root it needs.
    root = realpathSync(cacheDir);
    dirents = readdirSync(root, { withFileTypes: true });
  } catch {
    return scan;
  }
  scan.exists = true;

  for (const dirent of dirents) {
    if (!dirent.isFile()) continue;
    const name = dirent.name;
    if (name.endsWith(".tmp")) {
      scan.files.tmp += 1;
      continue;
    }
    if (!CACHE_ENTRY_RE.test(name)) {
      scan.files.other += 1;
      continue;
    }

    const file = containedPath(root, name);
    let bytes = 0;
    try {
      bytes = statSync(file).size;
    } catch {
      // Vanished between readdir and stat: fall through to the read, which
      // will classify it as unparsable.
    }
    scan.entries.total += 1;
    scan.bytes.total += bytes;

    let parsed;
    try {
      parsed = JSON.parse(readFileSync(file, "utf-8"));
    } catch {
      scan.entries.unparsable += 1;
      scan.bytes.unparsable += bytes;
      continue;
    }

    const meta =
      parsed && typeof parsed === "object" && !Array.isArray(parsed) && parsed.meta
        ? parsed.meta
        : {};
    const entryPrompt = typeof meta.promptVersion === "string" ? meta.promptVersion : null;
    const entryPipeline = typeof meta.pipelineVersion === "string" ? meta.pipelineVersion : null;
    const entryModel = typeof meta.model === "string" ? meta.model : null;

    const promptLabel = entryPrompt ?? "(missing)";
    scan.promptVersions[promptLabel] = (scan.promptVersions[promptLabel] ?? 0) + 1;
    if (entryPipeline) {
      scan.pipelineVersions[entryPipeline] = (scan.pipelineVersions[entryPipeline] ?? 0) + 1;
    }
    if (entryModel) {
      scan.models[entryModel] = (scan.models[entryModel] ?? 0) + 1;
    }

    if (entryPrompt === VLM_CACHE_PROMPT_VERSION) {
      scan.entries.current += 1;
      scan.bytes.current += bytes;
    } else {
      scan.entries.orphan += 1;
      scan.bytes.orphan += bytes;
      scan.orphans.push({
        file: name,
        promptVersion: entryPrompt,
        pipelineVersion: entryPipeline,
        model: entryModel,
        generatedAt: typeof meta.generatedAt === "string" ? meta.generatedAt : null,
        bytes,
      });
    }
  }

  return scan;
}

/**
 * Reclaim orphaned entries (#992). A dry run unless `apply` is true — the
 * caller decides when it is safe (no concurrent run writing the directory).
 * Only {@link scanVlmCache} orphans are unlinked; current, unparsable, `.tmp`
 * and unknown files always survive. A file that disappears between the scan
 * and the unlink (a concurrent prune) counts as reclaimed.
 *
 * @param {string|null} cacheDir
 * @param {{apply?: boolean, unlink?: (path: string) => void}} [opts] -
 *   `unlink` is a test seam for the failure path; production uses fs.unlinkSync.
 * @returns {{applied: boolean, before: object, after: object,
 *            deleted: number, deletedBytes: number,
 *            failures: {file: string, error: string}[]}}
 */
export function pruneVlmCache(cacheDir, { apply = false, unlink = unlinkSync } = {}) {
  const before = scanVlmCache(cacheDir);
  let deleted = 0;
  let deletedBytes = 0;
  const failures = [];

  if (apply && cacheDir && before.exists) {
    let root = null;
    try {
      root = realpathSync(cacheDir);
    } catch {
      // The directory vanished between the scan and the unlink pass.
    }
    if (root) {
      for (const orphan of before.orphans) {
        try {
          unlink(containedPath(root, orphan.file));
          deleted += 1;
          deletedBytes += orphan.bytes;
        } catch (err) {
          if (err?.code === "ENOENT") {
            // Another prune got there first; the entry is gone, but this
            // process freed no bytes.
            deleted += 1;
          } else {
            failures.push({ file: orphan.file, error: err.message });
          }
        }
      }
    }
  }

  const after = scanVlmCache(cacheDir);
  return { applied: apply, before, after, deleted, deletedBytes, failures };
}

/**
 * Report reclaimable entries at run start (#992) — a warning, never an
 * automatic deletion, because a concurrent run may still be writing.
 * Silent when the directory is absent or has no orphan.
 *
 * @param {string|null} cacheDir
 * @param {{log?: (line: string) => void}} [opts]
 */
export function warnStaleCacheEntries(cacheDir, { log = console.warn } = {}) {
  const scan = scanVlmCache(cacheDir);
  if (scan.entries.orphan === 0) return scan;
  const noun = scan.entries.orphan === 1 ? "entry" : "entries";
  log(
    `  ⚠️  VLM cache: ${scan.entries.orphan} stale ${noun} ` +
      `(promptVersion != ${VLM_CACHE_PROMPT_VERSION}) — kept, never auto-deleted.`,
  );
  log(`      Reclaim: node scripts/short-video/prune-vlm-cache.mjs --dir "${cacheDir}" --apply`);
  return scan;
}

/**
 * Wrap an analyzeAssetSemantics-style analyzer with the vlm-cache read/write
 * path (#198 Item 4). Lets callers outside asset-sourcer (b-roll gate) reuse
 * the same cache semantics: key = file fingerprint + model + window + claim +
 * cropFocus; successful results (non-empty description) are cached, degraded
 * or failing analyses are never pinned so a rerun retries.
 *
 * @param {(filePath: string, opts?: object) => Promise<object>} analyzeFn
 * @param {object} opts
 * @param {string|null} opts.cacheDir - null disables caching
 * @param {string} opts.model - cache-key material (the VLM model id)
 * @param {boolean} [opts.disabled] - env-level kill switch, bypasses cache
 * @returns {(filePath: string, opts?: object) => Promise<object>}
 */
export function wrapAnalyzerWithCache(analyzeFn, { cacheDir, model, disabled = false }) {
  return async (filePath, opts = {}) => {
    if (!cacheDir || disabled) return analyzeFn(filePath, opts);
    // analyzeAssetSemantics accepts both a nested window object and flattened
    // startMs/endMs/sampleFps — normalize so every spelling lands in the key.
    const window =
      opts?.window ??
      (opts?.startMs != null || opts?.endMs != null || opts?.sampleFps != null
        ? { startMs: opts.startMs, endMs: opts.endMs, sampleFps: opts.sampleFps }
        : undefined);
    const key = await computeCacheKey({
      filePath,
      model,
      window,
      windows: opts?.windows,
      claim: opts?.claim,
      cropFocus: opts?.cropFocus ?? null,
      transcript: opts?.transcript ?? null,
      hookCheck: opts?.hookCheck ?? null,
    });
    const cached = getCachedResult(cacheDir, key);
    if (cached) return cached.data;
    const result = await analyzeFn(filePath, opts);
    // Enum-only prompts (#1206 hook check) carry no description; their verdict
    // is the result, so `payoff` also makes a result cacheable.
    const hasBody =
      (result?.description && result.description.length > 0) || result?.payoff != null;
    if (hasBody) {
      writeCachedResult(cacheDir, key, { data: result });
    }
    return result;
  };
}
