#!/usr/bin/env node
/**
 * Batch Video Production (ISSUE-08)
 *
 * Processes all scene-data-*.mjs files through the video pipeline.
 * Each file produces one MP4.
 *
 * Usage: node scripts/short-video/batch-main.mjs [--bgm]
 * Output: output/deepseek-short-{slug}.mp4 for each scene-data file
 */

import { readdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAIN_SCRIPT = join(__dirname, "main.mjs");
const hasBgm = process.argv.includes("--bgm");

// Find all scene-data files (excluding the default one)
const sceneFiles = readdirSync(__dirname)
  .filter((f) => f.match(/^scene-data-.+\.mjs$/))
  .map((f) => join(__dirname, f));

if (sceneFiles.length === 0) {
  console.error("❌ No scene-data-*.mjs files found. Run: node batch-generate.mjs");
  process.exit(1);
}

console.log(`🎬 Batch Video Production — ${sceneFiles.length} videos`);
console.log("=".repeat(50));

let success = 0;
let failed = 0;

for (let i = 0; i < sceneFiles.length; i++) {
  const file = sceneFiles[i];
  const name = file.split("/").pop();
  console.log(`\n📹 [${i + 1}/${sceneFiles.length}] ${name}`);

  try {
    // Temporarily copy to scene-data.mjs (main.mjs reads this)
    execSync(
      `cp "${join(__dirname, "scene-data.mjs")}" "${join(__dirname, "scene-data-backup.mjs")}"`,
    );
    execSync(`cp "${file}" "${join(__dirname, "scene-data.mjs")}"`);

    // Run pipeline
    const bgmFlag = hasBgm ? "--bgm" : "";
    execSync(`node "${MAIN_SCRIPT}" ${bgmFlag}`, { stdio: "inherit" });

    // Move output to unique name
    const slug = name.replace(/^scene-data-/, "").replace(/\.mjs$/, "");
    const outputPath = join(__dirname, "output", `deepseek-short-${slug}.mp4`);
    const defaultOutput = join(__dirname, "output", "deepseek-short.mp4");
    if (existsSync(defaultOutput)) {
      execSync(`mv "${defaultOutput}" "${outputPath}"`);
      console.log(`  ✅ ${outputPath}`);
      success++;
    }
  } catch (e) {
    console.error(`  ❌ Failed: ${e.message}`);
    failed++;
  } finally {
    // Restore original scene-data
    execSync(
      `cp "${join(__dirname, "scene-data-backup.mjs")}" "${join(__dirname, "scene-data.mjs")}"`,
    );
    execSync(`rm -f "${join(__dirname, "scene-data-backup.mjs")}"`);
  }
}

console.log(`\n📊 Batch complete: ${success} success, ${failed} failed`);
