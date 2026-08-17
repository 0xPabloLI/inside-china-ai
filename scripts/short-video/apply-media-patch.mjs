#!/usr/bin/env node
/**
 * Apply Media Patch — formats media-patch.json as copy-paste-ready code blocks.
 *
 * Reads `output/media-patch.json` (produced by asset-sourcer.mjs) and outputs
 * formatted media field code blocks for each assigned scene. User reviews
 * the output and manually copies the relevant blocks into scene-data.mjs.
 *
 * Does NOT auto-modify scene-data.mjs — human review is the checkpoint.
 *
 * Usage:
 *   node scripts/short-video/apply-media-patch.mjs
 *   node scripts/short-video/apply-media-patch.mjs --input path/to/patch.json
 *
 * Output: formatted code blocks to stdout.
 */

import { existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse CLI args
const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
};

const inputPath = getArg("input") || join(__dirname, "output", "media-patch.json");

if (!existsSync(inputPath)) {
  console.error(`❌ Patch file not found: ${inputPath}`);
  console.error("   Run asset-sourcer.mjs first to generate media-patch.json");
  process.exit(1);
}

let patches;
try {
  const raw = readFileSync(inputPath, "utf8");
  patches = JSON.parse(raw);
} catch (e) {
  console.error(`❌ Failed to parse JSON: ${e.message}`);
  process.exit(1);
}

if (!Array.isArray(patches) || patches.length === 0) {
  console.log("No patches to apply.");
  process.exit(0);
}

// Filter to assigned patches only
const assigned = patches.filter((p) => p.status === "assigned" && p.media);

if (assigned.length === 0) {
  console.log("No assigned patches found. All assets are unassigned.");
  console.log(`   Total patches: ${patches.length}`);
  console.log(`   Assigned: 0`);
  console.log(`   Unassigned: ${patches.length}`);
  process.exit(0);
}

// Group by sceneId for sorted output
assigned.sort((a, b) => (a.sceneId || 0) - (b.sceneId || 0));

console.log("=".repeat(60));
console.log("📋 Media Patch — Copy-paste into scene-data.mjs");
console.log("=".repeat(60));
console.log();

for (const patch of assigned) {
  const m = patch.media;
  const vt = patch.visualType || "unknown";
  const score = patch.assetScore || 0;
  const source = patch.source || "unknown";

  console.log(`// Scene ${patch.sceneId} (${vt}) — score: ${score}, source: ${source}`);
  console.log("media: {");

  // Type
  console.log(`  type: "${m.type}",`);

  // Path
  console.log(`  path: "${m.path}",`);

  // Source (optional)
  if (m.source) {
    console.log(`  source: "${m.source}",`);
  }

  // Animation
  console.log(`  animation: "${m.animation}",`);

  // Overlay
  console.log(`  overlay: ${m.overlay},`);

  // Volume (only for video)
  if (m.volume !== undefined) {
    console.log(`  volume: ${m.volume},`);
  }

  // Fit (VLM-analyzed, only for landscape assets)
  if (m.fit) {
    console.log(`  fit: "${m.fit}",`);
  }

  // Focus (VLM-analyzed, only for landscape assets)
  if (m.focus) {
    console.log(`  focus: "${m.focus}",`);
  }

  console.log("},");

  // Attribution comment
  if (patch.attribution) {
    console.log(`// Attribution: ${patch.attribution.text}`);
  }

  console.log();
}

// Summary
const unassignedCount = patches.length - assigned.length;
console.log("=".repeat(60));
console.log(`📊 Summary:`);
console.log(`   Assigned: ${assigned.length}`);
console.log(`   Unassigned: ${unassignedCount}`);
console.log(`   Total: ${patches.length}`);
console.log();
console.log("💡 Review each block above, then copy the ones you want");
console.log("   into the corresponding scene in scene-data.mjs.");
