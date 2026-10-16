/**
 * Review Media Patch — formats media-patch.json for human review.
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
 * Single source of truth for formatting functions lives in media-patch-format.mjs (#649).
 *
 * @module review-media-patch
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

// Re-export core formatting functions as the authoritative surface
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

// Auto-run if called directly
const isMainModule = process.argv[1] && process.argv[1].endsWith("review-media-patch.mjs");
if (isMainModule) {
  main();
}
