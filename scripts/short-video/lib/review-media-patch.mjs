/**
 * Apply Media Patch — formats media-patch.json for human review.
 *
 * Reads media-patch.json and outputs:
 *   1. Human-readable review summary (focus analysis + VLM semantics comments)
 *   2. Copyable media: { ... } code blocks (without analysis/focusAnalysis)
 *
 * Spec §4.7: Output review summary as comments, NOT as copyable fields.
 * The media object keeps existing MediaField shape — no analysis or focusAnalysis.
 *
 * P3: Also reads asset-analysis.json (if present) to display VLM semantics
 * (description, subjects, contentKind, fit, criticalEdgeText, reason).
 *
 * Usage: node review-media-patch.mjs [--content <slug>] [--input media-patch.json] [--output formatted.txt] [--analysis asset-analysis.json]
 *
 * When --content <slug> is provided, defaults to output/{slug}/media-patch.json
 * and output/{slug}/asset-analysis.json.
 *
 * @module review-media-patch
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
 * Format VLM semantic analysis as a human-readable comment block.
 *
 * P3: Displays description, subjects, contentKind, fit, criticalEdgeText, reason
 * from asset-analysis.json.
 *
 * @param {Object} semantics - VLM analysis fields from asset-analysis.json
 * @returns {string} Multi-line comment block
 */
export function formatSemanticsSummary(semantics) {
  if (!semantics || typeof semantics !== "object") {
    return "";
  }

  const lines = [];

  if (semantics.description) {
    lines.push(`  // VLM Description: ${semantics.description}`);
  }
  if (semantics.subjects && semantics.subjects.length > 0) {
    lines.push(`  // Subjects: ${semantics.subjects.join(", ")}`);
  }
  if (semantics.contentKind) {
    lines.push(`  // Content Kind: ${semantics.contentKind}`);
  }
  if (semantics.fit) {
    lines.push(`  // Fit: ${semantics.fit}`);
  }
  if (semantics.criticalEdgeText) {
    lines.push(`  // Critical Edge Text: ${semantics.criticalEdgeText}`);
  }
  if (semantics.reason) {
    lines.push(`  // Reason: ${semantics.reason}`);
  }
  if (semantics.lowConfidence) {
    lines.push(
      `  // ⚠️ Low confidence (technicalScore: ${semantics.technicalScore || "?"}) — VLM skipped.`,
    );
  }

  return lines.join("\n");
}

/**
 * Load asset-analysis.json artifact (if it exists).
 *
 * @param {string} analysisPath - Path to asset-analysis.json
 * @returns {Object|null} Map of path → semantics, or null if file not found
 */
export function loadAssetAnalysis(analysisPath) {
  if (!analysisPath || !existsSync(analysisPath)) {
    return null;
  }

  try {
    const data = JSON.parse(readFileSync(analysisPath, "utf8"));
    if (!data || !Array.isArray(data.assets)) return null;

    // Build a lookup map by path
    const map = new Map();
    for (const entry of data.assets) {
      if (entry.path) {
        map.set(entry.path, entry);
      }
    }
    return map;
  } catch {
    return null;
  }
}

/**
 * Format a single media-patch entry as a copyable code block with review comments.
 *
 * Output format:
 *   // VLM Description: ...
 *   // Subjects: ...
 *   // Focus Analysis: ...
 *   media: {
 *     type: "image",
 *     path: "...",
 *     ...
 *   }
 *
 * The media object does NOT contain analysis or focusAnalysis fields.
 *
 * @param {Object} entry - A single entry from media-patch.json
 * @param {Map|null} [analysisMap] - Optional lookup from asset-analysis.json
 * @returns {string} Formatted block
 */
export function formatPatchEntry(entry, analysisMap) {
  if (!entry || entry.status !== "assigned") {
    return "";
  }

  const lines = [];

  // VLM semantics comments (P3: from asset-analysis.json)
  if (analysisMap && entry.media?.path) {
    const semantics = analysisMap.get(entry.media.path);
    if (semantics) {
      const summary = formatSemanticsSummary(semantics);
      if (summary) lines.push(summary);
    }
  }

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
 * @param {Map|null} [analysisMap] - Optional lookup from asset-analysis.json
 * @returns {string} Complete formatted output
 */
export function formatMediaPatch(patches, analysisMap) {
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

      const formatted = formatPatchEntry(entry, analysisMap);
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

  const patches = JSON.parse(readFileSync(inputPath, "utf8"));
  const analysisMap = loadAssetAnalysis(analysisPath);
  const formatted = formatMediaPatch(patches, analysisMap);

  if (outputPath) {
    writeFileSync(outputPath, formatted, "utf8");
    console.log(`✅ Written to: ${outputPath}`);
  } else {
    console.log(formatted);
  }
}

// Auto-run if called directly
const isMainModule = process.argv[1] && process.argv[1].endsWith("review-media-patch.mjs");
if (isMainModule) {
  main();
}
