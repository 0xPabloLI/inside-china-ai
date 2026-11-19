#!/usr/bin/env node
/**
 * Publish-package generator CLI (#219 ticket 02 — Profile-driven).
 *
 * Generates one publish package per REGISTERED platform profile
 * (caption txt + metadata json + pinned comment), landing in the run that
 * produced the video: output/{pipelineId}/runs/{runId}/publish/{platform}/
 * (#1432 S4). A legacy tree without runs keeps output/{pipelineId}/publish/.
 * Kernel artifacts are untouched.
 *
 * Usage:
 *   node scripts/short-video/generate-caption.mjs               # standalone (root scene-data)
 *   node scripts/short-video/generate-caption.mjs --content <dir>  # content pipeline (latest run)
 *   node scripts/short-video/generate-caption.mjs --content <dir> --run <runId>
 *   # or auto-called by verify-video.mjs when all checks pass
 *
 * Reads:  scripts/short-video/{scene-data.mjs | content/<dir>/scene-data.mjs}
 *         + meta.mjs (keyEntities / manual hashtags)
 * Writes: output/[{pipelineId}/runs/{runId}/]publish/{platform}/{platform}-caption.txt
 *         output/[{pipelineId}/runs/{runId}/]publish/{platform}/{platform}-metadata.json
 *         output/[{pipelineId}/runs/{runId}/]publish/{platform}/{platform}-pinned-comment.txt
 *
 * Caption/hashtag limits come from each platform's profile — no local copies
 * (single-path convergence, review 缓议 #219 T02).
 */

import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { generatePublishPackages } from "./lib/platforms/generate-publish-package.mjs";
import { listPlatformProfiles } from "./lib/platforms/index.mjs";
import { resolveRun } from "./lib/run-history.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const args = process.argv.slice(2);
const contentFlag = args.indexOf("--content");
const contentDir = contentFlag >= 0 ? args[contentFlag + 1] : "";
const runFlagIndex = args.indexOf("--run");
const runFlag = runFlagIndex >= 0 ? args[runFlagIndex + 1] : null;

// A content pack writes its package into the run that produced the video
// (#1432 S4). Fallbacks, in order: an explicit --run / latest run when history
// exists, then the legacy output/<content> tree (which keeps old packs working).
let OUTPUT_ROOT = join(__dirname, "output");
let resolvedRun = null;
if (contentDir) {
  try {
    resolvedRun = resolveRun({ root: __dirname, slug: contentDir, runId: runFlag });
    OUTPUT_ROOT = resolvedRun.dir;
  } catch {
    OUTPUT_ROOT = join(__dirname, "output", contentDir);
  }
}
const SCENE_DATA_PATH = contentDir
  ? join(__dirname, "content", contentDir, "scene-data.mjs")
  : join(__dirname, "scene-data.mjs");
const META_PATH = contentDir
  ? join(__dirname, "content", contentDir, "meta.mjs")
  : join(__dirname, "meta.mjs");

async function main() {
  // ─── Load scene data ───
  let scenes, metadata;
  try {
    const mod = await import(`file://${SCENE_DATA_PATH}`);
    scenes = mod.scenes || mod.default?.scenes;
    metadata = mod.metadata || mod.default?.metadata;
  } catch (e) {
    console.error(`❌ Failed to load scene-data.mjs: ${e.message}`);
    process.exit(1);
  }

  // ─── Load meta.mjs for primary entity + keyEntities + manual hashtags ───
  let meta = null;
  if (existsSync(META_PATH)) {
    try {
      const metaMod = await import(`file://${META_PATH}`);
      meta = metaMod.meta || metaMod.default?.meta;
      if (meta && !meta.keyEntities && !meta.hashtags) meta = null; // nothing usable
    } catch (e) {
      console.log(`  ⚠️ meta.mjs found but failed to load: ${e.message}`);
    }
  }

  // ─── Generate one package per registered platform profile ───
  const results = generatePublishPackages({
    outputRoot: OUTPUT_ROOT,
    scenes,
    metadata,
    meta,
  });
  if (resolvedRun) {
    console.log(`🆔 Package target: run ${resolvedRun.runId} (${resolvedRun.source})`);
  }

  // ─── Report ───
  const violations = [];
  for (const { platform, paths, pkg, violations: v } of results) {
    const profile = listPlatformProfiles().find((p) => p.platform === platform);
    console.log(`📝 ${profile.displayName} package (${platform}):`);
    console.log(`   Title (SEO): ${pkg.title} (${pkg.title.length} chars)`);
    console.log(`   Description: ${pkg.description.length} chars (incl. CTA)`);
    console.log(`   Hashtags:    ${pkg.hashtags.join(" ")} (${pkg.hashtags.length})`);
    console.log(
      `   Total caption: ${pkg.captionText.length} chars (limit: ${profile.caption.maxLength})`,
    );
    console.log(`   Pinned comment: ${pkg.pinnedComment || "(none — AITL not set)"}`);
    console.log(`   Source:      ${pkg.metadataJson.source}`);
    console.log(`📁 Files written (${paths.dir}):`);
    console.log(`   ${paths.caption}`);
    console.log(`   ${paths.metadata}`);
    console.log(`   ${paths.pinnedComment}`);
    violations.push(...v.map((violation) => `[${platform}] ${violation}`));
  }

  if (violations.length > 0) {
    console.error("\n❌ Constraint violations:");
    for (const v of violations) {
      console.error(`   • ${v}`);
    }
    process.exit(1);
  }
  console.log("\n✅ All platform packages satisfy their profile constraints");
}

main().catch((e) => {
  console.error(`❌ ${e.message}`);
  process.exit(1);
});
