/**
 * Apply Media Patch — media-patch.json tooling.
 *
 * Two concerns:
 *   1. Formatting media-patch.json for human review (#spec §4.7): review
 *      summary + copyable media blocks (applyAssignedMedia below is the
 *      runtime counterpart — main.mjs Step 1.5c).
 *   2. #192: applyAssignedMedia applies assigned entries to in-memory
 *      scenes with the mediaReject lifecycle (clear on success, report
 *      exhausted rejections).
 *
 * Spec §4.7: Output review summary as comments, NOT as copyable fields.
 * The media object keeps existing MediaField shape — no analysis or focusAnalysis.
 *
 * Usage: node apply-media-patch.mjs [--input media-patch.json] [--output formatted.txt]
 *
 * @module apply-media-patch
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Pure functions ───

/**
 * Format a focus analysis result as a human-readable comment block.
 *
 * Spec §4.7:
 *   - status=ok/partial: output readable summary (status, protectedRegions rect list, saliency available/unavailable)
 *   - status=degraded/unsupported: output warning line
 *   - status=low_information: output note that no protected regions found
 *
 * @param {Object} focusAnalysis - The focusAnalysis object from media-patch.json
 * @returns {string} Multi-line comment block (without /* wrappers, just // lines)
 */
export function formatFocusSummary(focusAnalysis) {
  if (!focusAnalysis || typeof focusAnalysis !== "object") {
    return "";
  }

  const status = focusAnalysis.status || "unknown";
  const errorCode = focusAnalysis.errorCode;
  const lines = [];

  switch (status) {
    case "ok":
    case "partial": {
      lines.push(`  // Focus Analysis: ${status}`);
      const regions = focusAnalysis.protectedRegions || [];
      if (regions.length > 0) {
        lines.push(`  // Protected Regions (${regions.length}):`);
        for (const r of regions) {
          const rect = r.rect || [];
          lines.push(
            `  //   ${r.kind || "unknown"}: [${rect.map((n) => n.toFixed(3)).join(", ")}]` +
              (r.confidence ? ` (conf: ${r.confidence})` : ""),
          );
        }
      } else {
        lines.push(`  // No protected regions detected.`);
      }
      const sal = focusAnalysis.saliency;
      if (sal) {
        lines.push(
          `  // Saliency: ${sal.available ? "available" : "unavailable"}` +
            (sal.available
              ? `, dispersion: ${sal.dispersion?.toFixed(3)}, centroid: [${(sal.centroid || []).map((n) => n.toFixed(3)).join(", ")}]`
              : ""),
        );
      }
      break;
    }

    case "low_information": {
      lines.push(
        `  // Focus Analysis: low_information — no protected regions, place text normally.`,
      );
      break;
    }

    case "degraded": {
      lines.push(
        `  // ⚠️ Focus Analysis: degraded (${errorCode || "unknown"}) — ignore focusAnalysis, use default text placement.`,
      );
      break;
    }

    case "unsupported": {
      lines.push(
        `  // Focus Analysis: unsupported (${errorCode || "unknown"}) — video asset, not applicable.`,
      );
      break;
    }

    default: {
      lines.push(`  // Focus Analysis: unknown status "${status}".`);
      break;
    }
  }

  return lines.join("\n");
}

/**
 * Format a single media-patch entry as a copyable code block with review comments.
 *
 * Output format:
 *   // Focus Analysis: ...
 *   // Protected Regions: ...
 *   media: {
 *     type: "image",
 *     path: "...",
 *     ...
 *   }
 *
 * The media object does NOT contain analysis or focusAnalysis fields.
 *
 * @param {Object} entry - A single entry from media-patch.json
 * @returns {string} Formatted block
 */
export function formatPatchEntry(entry) {
  if (!entry || entry.status !== "assigned") {
    return "";
  }

  const lines = [];

  // Review summary comments (spec §4.7 v6 P1-3)
  if (entry.analysis?.focusAnalysis) {
    lines.push(formatFocusSummary(entry.analysis.focusAnalysis));
  }

  // Copyable media object
  const media = entry.media || {};
  lines.push(`  media: {`);
  if (media.type) lines.push(`    type: "${media.type}",`);
  if (media.path) lines.push(`    path: "${media.path}",`);
  if (media.source) lines.push(`    source: "${media.source}",`);
  if (media.animation) lines.push(`    animation: "${media.animation}",`);
  if (media.overlay !== undefined) lines.push(`    overlay: ${media.overlay},`);
  if (media.fit) lines.push(`    fit: "${media.fit}",`);
  if (media.volume !== undefined) lines.push(`    volume: ${media.volume},`);
  // Note: focus is NOT included in new output (deprecated, spec §4.8)
  lines.push(`  },`);

  return lines.join("\n");
}

/**
 * Format the entire media-patch.json as a human-readable output.
 *
 * @param {Array} patches - Array of patch entries from media-patch.json
 * @returns {string} Complete formatted output
 */
export function formatMediaPatch(patches) {
  if (!Array.isArray(patches)) {
    return "No patches to display.\n";
  }

  const sections = [];
  sections.push("=".repeat(60));
  sections.push("📋 Media Patch — Human Review");
  sections.push("=".repeat(60));
  sections.push("");

  const assigned = patches.filter((p) => p.status === "assigned");
  const unassigned = patches.filter((p) => p.status === "unassigned");

  if (assigned.length > 0) {
    sections.push(`── Assigned (${assigned.length}) ──`);
    sections.push("");

    for (const entry of assigned) {
      const header = `Scene ${entry.sceneId}: ${entry.sceneName || "(unnamed)"} (${entry.visualType || "?"})`;
      sections.push(header);
      sections.push(`  Score: ${entry.assetScore || 0}, Source: ${entry.source || "?"}`);

      const formatted = formatPatchEntry(entry);
      if (formatted) {
        sections.push(formatted);
      }
      sections.push("");
    }
  }

  if (unassigned.length > 0) {
    sections.push(`── Unassigned (${unassigned.length}) ──`);
    sections.push("");
    for (const entry of unassigned) {
      sections.push(
        `  Score: ${entry.assetScore || 0}, Source: ${entry.source || "?"} — no available scene`,
      );
    }
    sections.push("");
  }

  if (assigned.length === 0 && unassigned.length === 0) {
    sections.push("(empty patch file)");
  }

  return sections.join("\n") + "\n";
}

// ─── Main ───

/**
 * Main entry point.
 *
 * @param {string[]} args - CLI arguments
 */
export function main(args = process.argv.slice(2)) {
  const getArg = (name) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
  };

  const inputPath = getArg("input") || join(__dirname, "..", "output", "media-patch.json");
  const outputPath = getArg("output") || null;

  if (!existsSync(inputPath)) {
    console.error(`❌ Input file not found: ${inputPath}`);
    process.exit(1);
  }

  const patches = JSON.parse(readFileSync(inputPath, "utf8"));
  const formatted = formatMediaPatch(patches);

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
