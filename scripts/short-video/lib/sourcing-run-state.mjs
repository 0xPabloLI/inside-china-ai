/**
 * Sourcing run-level short circuit (#228, slice A).
 *
 * Evidence (2026-11-15, zhipu-valuation): a rerun spent 2,241 s of a 2,335 s
 * pipeline in `step-1.5-sourcing` — full re-search, re-download and re-scoring
 * of the same claims that had already been sourced the day before. The existing
 * caches are per-URL downloads and per-VLM-verdict; nothing decided "these
 * claims are unchanged, the previous sourcing result still stands".
 *
 * This module supplies that decision. The shortcut is keyed on the *search
 * plan* (`buildQueryGroups` — claims, search hints, zh pool, claim scene ids),
 * not on the whole scene array: fixing a voiceover line that does not change
 * what the scene needs to show must not invalidate thirty minutes of sourcing,
 * while any change to `assetNeed` / search hints does.
 *
 * Boundaries:
 * - It skips *sourcing only*. Evidence capture, the media patch, upscale,
 *   B-roll and the final media gate all still run; the gate remains the
 *   authority on whether the pack is renderable.
 * - It refuses to skip when the previous patch's assigned files are gone: a
 *   deleted asset must be re-sourced, not silently re-referenced.
 * - It is a cache, so it can be wrong about the outside world. A rerun that
 *   genuinely needs fresh candidates is forced with
 *   `SHORT_VIDEO_FORCE_SOURCING=1`, which bypasses the decision without
 *   touching the stored state.
 *
 * @module sourcing-run-state
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { buildQueryGroups } from "./asset-sourcer.mjs";
import { normalizeMediaPatch } from "./apply-media-patch.mjs";
import { containedPath } from "./path-safety.mjs";

export const SOURCING_STATE_SCHEMA_VERSION = 1;
export const SOURCING_STATE_FILE = "sourcing-state.json";

/** JSON with sorted keys, so the digest is stable across key order. */
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/**
 * Digest of the run's search plan. Stable when only delivery text changes;
 * changes when a claim, search hint or zh source keyword changes.
 */
export function sourcingDigest(scenes) {
  const plan = buildQueryGroups(scenes);
  const payload = {
    queryGroups: plan.queryGroups,
    zhQueryGroups: plan.zhQueryGroups,
  };
  return createHash("sha256").update(stableStringify(payload)).digest("hex").slice(0, 16);
}

/** Read the persisted state; unreadable or malformed state is "no state". */
export function readSourcingState(file) {
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/** Persist the state that lets the *next* identical run skip sourcing. */
export function writeSourcingState(file, { digest, scenes, pack }) {
  const plan = buildQueryGroups(scenes);
  const payload = {
    schemaVersion: SOURCING_STATE_SCHEMA_VERSION,
    digest,
    completedAt: new Date().toISOString(),
    pack,
    claimCount: plan.claimCount,
    queryCount: plan.queryGroups.length,
    zhQueryCount: plan.zhQueryGroups.length,
  };
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
  return payload;
}

/** Patch entries in either the envelope or the legacy top-level array form. */
function assignedPatches(patch) {
  if (!patch) return [];
  try {
    return normalizeMediaPatch(patch).filter(
      (entry) => entry.status === "assigned" && entry.media?.path,
    );
  } catch {
    return [];
  }
}

/**
 * Decide whether this run may skip sourcing.
 *
 * @param {object} params
 * @param {Array} params.scenes - current scenes
 * @param {object|null} params.state - persisted sourcing-state (readSourcingState)
 * @param {object|null} params.patch - media-patch.json contents
 * @param {string} params.contentDirAbs - absolute pack directory
 * @param {Function} [params.existsSyncFn] - test seam
 * @returns {{skip: boolean, digest: string, reason: string, assigned: number}}
 */
export function evaluateSourcingShortCircuit({
  scenes,
  state,
  patch,
  contentDirAbs,
  existsSyncFn = existsSync,
}) {
  const digest = sourcingDigest(scenes);

  if (!state || state.schemaVersion !== SOURCING_STATE_SCHEMA_VERSION) {
    return { skip: false, digest, reason: "no previous sourcing state", assigned: 0 };
  }
  if (state.digest !== digest) {
    return {
      skip: false,
      digest,
      reason: "search plan changed since the last sourcing run",
      assigned: 0,
    };
  }
  const assigned = assignedPatches(patch);
  if (!patch) {
    return {
      skip: false,
      digest,
      reason: "no media-patch.json from the previous sourcing run",
      assigned: 0,
    };
  }
  for (const entry of assigned) {
    let assetPath;
    try {
      assetPath = containedPath(contentDirAbs, entry.media.path);
    } catch {
      assetPath = null; // absolute or escaping patch path counts as missing
    }
    if (!assetPath || !existsSyncFn(assetPath)) {
      return {
        skip: false,
        digest,
        reason: `assigned media file is missing: ${entry.media.path}`,
        assigned: assigned.length,
      };
    }
  }
  return {
    skip: true,
    digest,
    reason: `same search plan as ${state.completedAt} (${assigned.length} assigned asset(s) still on disk)`,
    assigned: assigned.length,
  };
}
