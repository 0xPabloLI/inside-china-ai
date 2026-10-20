/**
 * Apply Media Patch — media-patch.json tooling.
 *
 * Two concerns:
 *   1. Formatting media-patch.json for human review (#spec §4.7): review
 *      summary + copyable media blocks (applyAssignedMedia below is the
 *      runtime counterpart — main.mjs Step 1.5c).
 *      Single source of truth for formatting lives in media-patch-format.mjs (#649).
 *   2. #192: applyAssignedMedia applies assigned entries to in-memory
 *      scenes with the mediaReject lifecycle (clear on success, report
 *      exhausted rejections).
 *
 * Spec §4.7: Output review summary as comments, NOT as copyable fields.
 * The media object keeps existing MediaField shape — no analysis or focusAnalysis.
 *
 * Usage: node apply-media-patch.mjs [--content <slug>] [--input media-patch.json] [--output formatted.txt] [--analysis asset-analysis.json]
 *
 * @module apply-media-patch
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  formatFocusSummary,
  loadAssetAnalysis,
  formatPatchEntry,
  formatMediaPatch,
  normalizeMediaPatch,
} from "./media-patch-format.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Re-export formatting functions and normalizer for unified contract (#649)
export { formatFocusSummary, formatPatchEntry, formatMediaPatch, normalizeMediaPatch };

// ─── Main ───

/**
 * Main entry point.
 *
 * @param {string[]} args - CLI arguments
 */
function main(args = process.argv.slice(2)) {
  const getArg = (name) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
  };

  const contentSlug = getArg("content");
  const slugDir = contentSlug
    ? join(__dirname, "..", "output", contentSlug)
    : join(__dirname, "..", "output");
  const inputPath = getArg("input") || join(slugDir, "media-patch.json");
  const analysisPath = getArg("analysis") || join(slugDir, "asset-analysis.json");
  const outputPath = getArg("output") || null;

  if (!existsSync(inputPath)) {
    console.error(`❌ Input file not found: ${inputPath}`);
    process.exit(1);
  }

  const patches = normalizeMediaPatch(JSON.parse(readFileSync(inputPath, "utf8")));
  const analysisMap = loadAssetAnalysis(analysisPath);
  const formatted = formatMediaPatch(patches, analysisMap);

  if (outputPath) {
    writeFileSync(outputPath, formatted, "utf8");
    console.log(`✅ Written to: ${outputPath}`);
  } else {
    console.log(formatted);
  }
}

// ─── Patch application (#192) ───

/**
 * Apply assigned media-patch entries to in-memory scenes (main.mjs Step 1.5c).
 *
 * Semantics preserved from the original inline loop:
 *   - never overwrites a scene that already has media.path
 *   - entries whose media file is missing on disk are skipped with a reason
 *
 * #192 mediaReject lifecycle:
 *   - a successful assignment to a scene carrying `mediaReject` clears the
 *     flag (the rejection is satisfied)
 *   - a mediaReject scene that still has no media afterwards is reported in
 *     `exhausted` — its candidates were all rejected (or none matched);
 *     the scene falls back to CSS-only until the search widens or the
 *     flag is cleared. Note the VLM cache is deliberately NOT bypassed by
 *     rejections: same-bytes-different-URL collisions are rare and the
 *     rejection is a human judgment, not a VLM verdict correction.
 *
 * Memory-only: callers decide whether/how to persist (scene-data is
 * authored content, the pipeline never writes it).
 *
 * @param {Array} scenes
 * @param {Array} assignedEntries - media-patch entries with status "assigned"
 * @param {string} contentDirAbs - absolute content dir for file existence
 * @returns {{applied: number, appliedSceneIds: number[], skipped: Array,
 *            clearedRejects: number[], exhausted: number[], scenes: Array}}
 */
export function applyAssignedMedia(scenes, assignedEntries, contentDirAbs) {
  const appliedSceneIds = [];
  const skipped = [];
  const clearedRejects = [];
  let applied = 0;

  for (const entry of assignedEntries || []) {
    const scene = scenes.find((s) => s.id === entry.sceneId);
    if (!scene) continue;
    // #299: an explicit media:null is a waiver, not an empty slot — a stale
    // patch entry must not overwrite it (media?.path is falsy for null).
    if ("media" in scene && scene.media === null) {
      skipped.push({ sceneId: entry.sceneId, reason: "explicit no-media waiver" });
      continue;
    }
    if (scene.media?.path) {
      skipped.push({ sceneId: entry.sceneId, reason: "existing media" });
      continue;
    }
    if (!existsSync(join(contentDirAbs, entry.media.path))) {
      skipped.push({
        sceneId: entry.sceneId,
        reason: "patched media not found",
        path: entry.media.path,
      });
      continue;
    }
    scene.media = { ...scene.media, ...entry.media };
    applied++;
    appliedSceneIds.push(entry.sceneId);
    if (scene.mediaReject) {
      delete scene.mediaReject;
      clearedRejects.push(entry.sceneId);
    }
  }

  const exhausted = scenes.filter((s) => s.mediaReject && !s.media?.path).map((s) => s.id);

  return { applied, appliedSceneIds, skipped, clearedRejects, exhausted };
}

// Auto-run if called directly
const isMainModule = process.argv[1] && process.argv[1].endsWith("apply-media-patch.mjs");
if (isMainModule) {
  main();
}
