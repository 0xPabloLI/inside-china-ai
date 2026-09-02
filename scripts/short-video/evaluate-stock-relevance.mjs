/**
 * Evaluate stock image relevance against scene content using VLM.
 *
 * For each scene with media.type === "image", runs analyzeAssetSemantics
 * with a claim built from voiceover + texts. Reports relevance scores
 * and flags low-scoring scenes for replacement.
 *
 * Usage: node scripts/short-video/evaluate-stock-relevance.mjs --content zhipu-glm6-self-training
 */
import { readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { analyzeAssetSemantics, closeVisualAnalyzer } from "./lib/visual-analyzer.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const THRESHOLD = 60;

function getArg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : null;
}

function buildAssetNeed(scene) {
  if (scene.aiVideo?.prompt) return scene.aiVideo.prompt;
  const t = scene.texts || {};
  const parts = [
    t.badge,
    t.company,
    t.context,
    t.action,
    t.result,
    t.title,
    t.titleHighlight,
    t.detail,
  ].filter(Boolean);
  return parts.join(". ");
}

function loadScenes(contentSlug) {
  const contentDir = join(__dirname, "content", contentSlug);
  const sceneDataPath = join(contentDir, "scene-data.mjs");
  const url = `file://${sceneDataPath}`;
  const mod = import(url);
  return mod.then((m) => ({ scenes: m.scenes, contentDir }));
}

async function main() {
  const contentSlug = getArg("content");
  if (!contentSlug) {
    console.error("Usage: node evaluate-stock-relevance.mjs --content <slug>");
    process.exit(1);
  }

  const { scenes, contentDir } = await loadScenes(contentSlug);

  console.log(`\n=== Stock Image Relevance Evaluation ===`);
  console.log(`Content: ${contentSlug}`);
  console.log(`Threshold: ${THRESHOLD}\n`);

  const results = [];

  for (const scene of scenes) {
    if (!scene.media || scene.media.type !== "image") {
      console.log(`Scene ${scene.id} (${scene.name}): skip (no stock image)`);
      continue;
    }

    const assetPath = resolve(contentDir, scene.media.path);
    const claim = {
      voiceover: scene.voiceover ?? "",
      assetNeed: buildAssetNeed(scene),
    };

    console.log(`Scene ${scene.id} (${scene.name}): evaluating ${scene.media.path}...`);

    const result = await analyzeAssetSemantics(assetPath, { claim });
    const relevance = result.relevance;
    const reason = result.relevanceReason ?? result.reason;
    const passed = relevance !== null && relevance >= THRESHOLD;

    results.push({
      sceneId: scene.id,
      sceneName: scene.name,
      asset: scene.media.path,
      relevance,
      reason,
      passed,
    });

    const status = relevance === null ? "FAIL (no score)" : passed ? "PASS" : "FAIL";
    console.log(`  → ${status} — relevance: ${relevance ?? "null"}`);
    if (reason) console.log(`    reason: ${reason}`);
    if (result.description) console.log(`    VLM description: ${result.description}`);
    console.log();
  }

  await closeVisualAnalyzer();

  console.log(`\n=== Summary ===`);
  const failed = results.filter((r) => !r.passed);
  const passed = results.filter((r) => r.passed);
  console.log(`Passed: ${passed.length}/${results.length}`);
  console.log(`Failed: ${failed.length}/${results.length}`);

  if (failed.length > 0) {
    console.log(`\n=== Scenes needing replacement ===`);
    for (const f of failed) {
      console.log(`  Scene ${f.sceneId} (${f.sceneName}): ${f.asset} — relevance ${f.relevance ?? "null"}`);
    }
  }

  const reportPath = join(contentDir, "stock-relevance-report.json");
  const { writeFileSync } = await import("node:fs");
  writeFileSync(reportPath, JSON.stringify({ threshold: THRESHOLD, results }, null, 2));
  console.log(`\nReport saved: ${reportPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});