/**
 * Cross-run media sourcing reuse (#1362).
 *
 * The media track is deterministic given a package's scene claims and code
 * recipe. When the voice track fails after sourcing finished (the 2026-11-14
 * zhipu-valuation case: 30 min sourcing, then TTS rejected by Kaggle queue
 * timeout), the next run should not spend those 30 minutes again. This module
 * answers one question for asset-sourcer and the media track: which scene
 * verdicts in the previous `media-patch.json` still describe the current
 * scene-data?
 *
 * Identity is a per-scene claim signature: the claim fields that drive search
 * queries (`assetNeed` / `voiceover` / `searchHints` / `sourceRef`) plus the
 * scene fields that drive assignment (`visualType`, `layout`, `mediaStrategy`,
 * `chart`, ...). A field sourcing does not read (`text`, headings, timing) is
 * deliberately outside the signature, so a copy edit that leaves the visual
 * need alone reuses the previous verdict. The hook signature additionally
 * carries the pack's declared body fit because hook composition reads it
 * (#963 / #1305).
 *
 * What counts as a reusable verdict:
 *   - an `assigned` entry whose media file still exists;
 *   - an `unassigned` entry (a content verdict — the same search would most
 *     likely reject the same candidates again);
 *   - a searched scene with no entries at all (nothing matched).
 *
 * The whole patch is only trusted when the previous run assigned at least one
 * usable file (#1361): a patch where assignment never produced anything is
 * evidence the run was broken, not a set of verdicts worth replaying.
 *
 * `MEDIA_PATCH_RECIPE_VERSION` is the explicit answer to "should a code fix
 * revalidate old winners?": bump it whenever assignment/relevance/search
 * behavior changes in a way that could alter a verdict for unchanged claims.
 * A bump invalidates every previous verdict; a per-scene claim edit only
 * invalidates that scene.
 *
 * Leaf module: no I/O beyond `existsSync` on the patch's media paths, no
 * network, no CLI parsing, so the same decision serves the pipeline, the
 * standalone sourcer and the tests.
 *
 * @module media-reuse
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { extractSceneClaims } from "./claim-keywords.mjs";
import { normalizeMediaPatch } from "./media-patch-format.mjs";
import { DEFAULT_RELEVANCE_THRESHOLD } from "./relevance-verdict.mjs";

/** Envelope metadata layout written under `reuse` in media-patch.json. */
export const MEDIA_PATCH_REUSE_VERSION = 1;

/**
 * Bump when a change in sourcing/assignment could change a verdict for an
 * unchanged claim: relevance admission rules, scoring, composition defaults,
 * chart pinning, query derivation. Forgetting the bump preserves stale
 * winners, so treat it as part of the change review, not an optional extra.
 */
export const MEDIA_PATCH_RECIPE_VERSION = 1;

/** Default candidate cap per source; shared with the CLI's `--max-per-source`. */
export const DEFAULT_MAX_PER_SOURCE = 3;

/**
 * The settings a verdict was produced under. Changing either makes the
 * previous patch incomparable: threshold 60 and 80 admit different pictures,
 * and a different per-source cap sees a different candidate pool.
 */
export const DEFAULT_SOURCING_SETTINGS = Object.freeze({
  relevanceThreshold: DEFAULT_RELEVANCE_THRESHOLD,
  maxPerSource: DEFAULT_MAX_PER_SOURCE,
});

/**
 * Canonical JSON for hashing: object keys sorted recursively, arrays kept in
 * order. Two projections that differ only in key insertion order must hash the
 * same, or a refactor of the projection would invalidate every pack.
 *
 * @param {unknown} value
 * @returns {string}
 */
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

/**
 * The pack's declared body composition, as raw scene-id/fit pairs.
 *
 * `declaredBodyFit` (asset-sourcer) derives "cover" / "contain" / null from
 * this same data. Hashing the raw pairs instead of the derived value keeps
 * this module a leaf while still noticing every change that could move the
 * hook's fit: a body fit added, removed or switched.
 *
 * @param {Array<object>} [scenes]
 * @returns {string}
 */
function packFitFingerprint(scenes = []) {
  return (scenes ?? [])
    .filter((scene) => scene && scene.visualType !== "hook")
    .map((scene) => `${scene.id}:${scene.media?.fit ?? ""}`)
    .join("|");
}

/**
 * One scene's claim signature.
 *
 * @param {object} scene - current scene-data row
 * @param {object} claim - `extractSceneClaims` output for that row
 * @param {string} packFit - pack-wide body-fit fingerprint (hook only)
 * @returns {string}
 */
function signatureFor(scene, claim, packFit) {
  const projection = {
    claim: {
      assetNeed: claim.assetNeed ?? "",
      voiceover: claim.voiceover ?? "",
      searchHints: claim.searchHints ?? [],
      sourceRef: claim.sourceRef ?? null,
    },
    scene: {
      type: scene.type ?? null,
      visualType: scene.visualType ?? null,
      layout: scene.layout ?? null,
      mediaStrategy: scene.mediaStrategy ?? null,
      // `mediaPresent` catches an empty hand-bound object (`media: {}`): the
      // allocator treats any truthy `media` as occupied, even without a path.
      mediaPresent: scene.media != null,
      mediaFit: scene.media?.fit ?? null,
      mediaMode: scene.media?.mode ?? null,
      mediaReject: scene.mediaReject ?? null,
      chart: scene.chart ?? null,
      ...(scene.visualType === "hook" ? { packFit } : {}),
    },
  };
  return createHash("sha1").update(canonicalJson(projection)).digest("hex").slice(0, 16);
}

/**
 * Current signature for every scene that owns a stock claim.
 *
 * Scenes that carry bound media, opt out (`media: null`) or plan generation
 * only are absent: they do not enter sourcing, so they have no verdict to
 * reuse. Returning a Map preserves scene order, which callers use for stable
 * metadata and logging.
 *
 * @param {Array<object>} scenes
 * @returns {Map<number, string>} sceneId → signature
 */
export function sceneClaimSignatures(scenes = []) {
  const signatures = new Map();
  const claims = extractSceneClaims(scenes);
  const claimByScene = new Map(claims.map((claim) => [claim.sceneId, claim]));
  const packFit = packFitFingerprint(scenes);

  for (const scene of scenes ?? []) {
    const claim = claimByScene.get(scene?.id);
    if (!claim) continue;
    signatures.set(scene.id, signatureFor(scene, claim, packFit));
  }
  return signatures;
}

/**
 * Read a media-patch.json payload, or null when it is absent or unreadable.
 *
 * A malformed patch is treated as "no previous patch" (full re-source), never
 * as a reason to abort: the artifact is a cache of verdicts, not the source of
 * truth. The caller still overwrites it at the end of the run.
 *
 * @param {string} filePath
 * @returns {object|Array|null}
 */
export function readMediaPatchFile(filePath) {
  if (!filePath || !existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Stable id for one patch entry's scene. Assigned entries carry `sceneId`;
 * rejected candidate entries carry `claimSceneId` (#293 keeps the binding for
 * the gap ledger).
 *
 * @param {object} entry
 * @returns {number|null}
 */
function entrySceneId(entry) {
  const raw = entry?.sceneId ?? entry?.claimSceneId;
  return Number.isInteger(raw) ? raw : null;
}

/**
 * Whether an assigned entry still points at a file on disk.
 *
 * @param {object} entry
 * @param {string} contentDirAbs
 * @returns {boolean}
 */
function assignedFileExists(entry, contentDirAbs) {
  const path = entry?.media?.path;
  if (typeof path !== "string" || path.length === 0) return false;
  if (typeof contentDirAbs !== "string" || contentDirAbs.length === 0) return false;
  return existsSync(join(contentDirAbs, path));
}

/**
 * Whether two settings objects describe the same run conditions.
 *
 * @param {object|null|undefined} left
 * @param {object} right
 * @returns {boolean}
 */
function sameSettings(left, right) {
  return (
    left?.relevanceThreshold === right?.relevanceThreshold &&
    left?.maxPerSource === right?.maxPerSource
  );
}

/**
 * Decide which previous verdicts still apply.
 *
 * @param {object} input
 * @param {Array<object>} input.scenes - current scene-data rows
 * @param {object|Array|null} [input.rawPatch] - parsed media-patch.json (envelope or legacy array)
 * @param {string} input.contentDirAbs - content dir for assigned-file checks
 * @param {{relevanceThreshold:number,maxPerSource:number}} [input.settings]
 * @param {boolean} [input.force] - `--no-reuse`: re-source every claim
 * @returns {{
 *   signatures: Map<number,string>,
 *   previousPatches: Array<object>,
 *   searchedBefore: Set<number>,
 *   reusable: Array<{sceneId:number, signature:string, entries:Array<object>}>,
 *   stale: Array<{sceneId:number, signature:string, reason:string}>,
 *   previousRunUsable: boolean,
 *   metadataUsable: boolean,
 * }}
 */
export function planPatchReuse({
  scenes = [],
  rawPatch = null,
  contentDirAbs = "",
  settings = DEFAULT_SOURCING_SETTINGS,
  force = false,
} = {}) {
  const signatures = sceneClaimSignatures(scenes);
  const previousPatches = normalizeMediaPatch(rawPatch);
  const reuse =
    rawPatch && !Array.isArray(rawPatch) && typeof rawPatch.reuse === "object"
      ? rawPatch.reuse
      : null;
  const metadataUsable = Boolean(
    reuse?.version === MEDIA_PATCH_REUSE_VERSION &&
    reuse?.signatures &&
    typeof reuse.signatures === "object" &&
    Array.isArray(reuse?.searched),
  );

  const searchedBefore = new Set(
    (metadataUsable ? reuse.searched : []).filter((id) => Number.isInteger(id)),
  );
  const previousRunUsable = previousPatches.some(
    (entry) => entry?.status === "assigned" && assignedFileExists(entry, contentDirAbs),
  );

  const entriesByScene = new Map();
  for (const entry of previousPatches) {
    const sceneId = entrySceneId(entry);
    if (sceneId == null) continue;
    const list = entriesByScene.get(sceneId) ?? [];
    list.push(entry);
    entriesByScene.set(sceneId, list);
  }

  /**
   * Reject every current claim for one global reason (`--no-reuse`, recipe
   * change, unusable previous patch). Keeping the reason on every scene makes
   * the log and the artifact self-explanatory instead of "reused 0".
   *
   * @param {string} reason
   */
  const rejectAll = (reason) => {
    const stale = [...signatures.entries()].map(([sceneId, signature]) => ({
      sceneId,
      signature,
      reason,
    }));
    return {
      signatures,
      previousPatches,
      searchedBefore,
      reusable: [],
      stale,
      previousRunUsable,
      metadataUsable,
    };
  };

  if (force) return rejectAll("forced");
  if (!rawPatch) return rejectAll("no previous patch");
  if (!metadataUsable) return rejectAll("no reuse metadata");
  if (reuse.recipe !== MEDIA_PATCH_RECIPE_VERSION) return rejectAll("recipe changed");
  if (!sameSettings(reuse.settings, settings)) return rejectAll("settings changed");
  if (!previousRunUsable) return rejectAll("previous run had no usable assignment");

  const reusable = [];
  const stale = [];
  for (const [sceneId, signature] of signatures) {
    const previousSignature = reuse.signatures[String(sceneId)];
    if (!previousSignature) {
      stale.push({ sceneId, signature, reason: "new claim scene" });
      continue;
    }
    if (previousSignature !== signature) {
      stale.push({ sceneId, signature, reason: "claim changed" });
      continue;
    }

    const entries = entriesByScene.get(sceneId) ?? [];
    const assigned = entries.filter((entry) => entry?.status === "assigned");
    if (assigned.length > 0) {
      if (assigned.some((entry) => assignedFileExists(entry, contentDirAbs))) {
        reusable.push({ sceneId, signature, entries });
      } else {
        stale.push({ sceneId, signature, reason: "media file missing" });
      }
      continue;
    }

    // No assignment: unassigned entries are a content verdict; zero entries
    // means the search ran and found nothing. Both are reusable only when the
    // previous metadata says this scene was actually searched.
    if (searchedBefore.has(sceneId) || entries.length > 0) {
      reusable.push({ sceneId, signature, entries });
    } else {
      stale.push({ sceneId, signature, reason: "not searched last run" });
    }
  }

  return {
    signatures,
    previousPatches,
    searchedBefore,
    reusable,
    stale,
    previousRunUsable,
    metadataUsable,
  };
}

/**
 * Merge fresh assignment output with the previous patch.
 *
 * Reused scenes keep every previous entry (an assigned winner or a set of
 * rejection reasons); re-sourced scenes keep only this run's entries. Entries
 * for scenes that are no longer claim scenes disappear — a removed scene must
 * not keep pointing at an asset. Output follows current scene order so the
 * file diff is stable between runs.
 *
 * @param {object} input
 * @param {Array<object>} input.scenes - current scene-data rows (order authority)
 * @param {Array<object>} [input.previousPatches]
 * @param {Array<object>} [input.freshPatches]
 * @param {Iterable<number>} [input.reusableSceneIds]
 * @returns {Array<object>}
 */
export function mergePatchEntries({
  scenes = [],
  previousPatches = [],
  freshPatches = [],
  reusableSceneIds = [],
}) {
  const reusable = new Set(reusableSceneIds);
  const group = (patches) => {
    const grouped = new Map();
    const loose = [];
    for (const entry of patches ?? []) {
      const sceneId = entrySceneId(entry);
      if (sceneId == null) {
        loose.push(entry);
        continue;
      }
      const list = grouped.get(sceneId) ?? [];
      list.push(entry);
      grouped.set(sceneId, list);
    }
    return { grouped, loose };
  };

  const previous = group(previousPatches);
  const fresh = group(freshPatches);
  const merged = [];
  const seen = new Set();

  for (const scene of scenes ?? []) {
    const sceneId = scene?.id;
    if (!Number.isInteger(sceneId) || seen.has(sceneId)) continue;
    seen.add(sceneId);
    const source = reusable.has(sceneId) ? previous.grouped : fresh.grouped;
    merged.push(...(source.get(sceneId) ?? []));
  }

  // Fresh entries for ids outside the current scene list should not happen for
  // claim-bound assets; keep them rather than silently dropping this run's
  // evidence.
  for (const [sceneId, entries] of fresh.grouped) {
    if (!seen.has(sceneId)) merged.push(...entries);
  }
  // Entries without a scene id describe unbound candidates (audit trail), not
  // a reusable per-scene verdict.
  merged.push(...fresh.loose);

  return merged;
}

/**
 * Build the `reuse` block written into the media-patch envelope.
 *
 * @param {object} input
 * @param {Map<number,string>} input.signatures - current claim signatures
 * @param {Iterable<number>} [input.searchedSceneIds] - scenes searched now or in an earlier run
 * @param {{relevanceThreshold:number,maxPerSource:number}} [input.settings]
 * @param {number} [input.recipeVersion] - test seam; production uses the constant
 * @returns {object}
 */
export function buildReuseMetadata({
  signatures = new Map(),
  searchedSceneIds = [],
  settings = DEFAULT_SOURCING_SETTINGS,
  recipeVersion = MEDIA_PATCH_RECIPE_VERSION,
}) {
  const signatureObject = {};
  for (const [sceneId, signature] of signatures) {
    signatureObject[String(sceneId)] = signature;
  }
  return {
    version: MEDIA_PATCH_REUSE_VERSION,
    recipe: recipeVersion,
    settings: {
      relevanceThreshold: settings.relevanceThreshold,
      maxPerSource: settings.maxPerSource,
    },
    searched: [...new Set(searchedSceneIds)]
      .filter((sceneId) => Number.isInteger(sceneId))
      .sort((a, b) => a - b),
    signatures: signatureObject,
  };
}

/**
 * The searched-scene set to persist for the next run: every current claim
 * scene that was searched now or in an earlier run. Ids that no longer carry a
 * claim are dropped so the metadata tracks the current pack.
 *
 * @param {ReturnType<typeof planPatchReuse>} plan
 * @returns {Set<number>}
 */
export function nextSearchedSceneIds(plan) {
  const current = new Set(plan?.signatures?.keys?.() ?? []);
  const searched = new Set();
  for (const sceneId of plan?.searchedBefore ?? []) {
    if (current.has(sceneId)) searched.add(sceneId);
  }
  for (const scene of plan?.stale ?? []) {
    if (current.has(scene.sceneId)) searched.add(scene.sceneId);
  }
  return searched;
}

/**
 * One-line reason summary for logs and the asset report.
 *
 * @param {ReturnType<typeof planPatchReuse>} plan
 * @returns {string}
 */
export function summarizeReusePlan(plan) {
  if (!plan) return "no reuse plan";
  if (plan.stale.length === 0) return `${plan.reusable.length} scene claim(s) unchanged`;
  const counts = new Map();
  for (const scene of plan.stale) {
    counts.set(scene.reason, (counts.get(scene.reason) ?? 0) + 1);
  }
  const detail = [...counts.entries()].map(([reason, count]) => `${reason} ×${count}`).join(", ");
  return `${plan.reusable.length} unchanged, ${plan.stale.length} to source (${detail})`;
}
